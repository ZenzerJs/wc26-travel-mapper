import { formatDuration } from '@/lib/format';
import type { FlightResult } from '@/lib/types';

const SKY_SCRAPPER_HOST = 'sky-scrapper.p.rapidapi.com';
const BASE_URL = `https://${SKY_SCRAPPER_HOST}`;

interface SkyScrapperRequestOptions {
  apiKey: string;
  path: string;
  searchParams?: Record<string, string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatFlightTime(value: unknown): string | undefined {
  const text = readString(value);
  if (!text) return undefined;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return text;
  return parsed.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatMinutesDuration(minutes: number | undefined): string | undefined {
  if (minutes === undefined) return undefined;
  return formatDuration(minutes * 60);
}

async function skyScrapperGet({ apiKey, path, searchParams = {} }: SkyScrapperRequestOptions) {
  const url = new URL(`${BASE_URL}${path}`);
  Object.entries(searchParams).forEach(([key, value]) => url.searchParams.set(key, value));

  const response = await fetch(url.toString(), {
    headers: {
      'Content-Type': 'application/json',
      'x-rapidapi-host': SKY_SCRAPPER_HOST,
      'x-rapidapi-key': apiKey,
    },
  });

  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  return { response, data, text };
}

interface AirportMatch {
  skyId: string;
  entityId: string;
  title: string;
}

function extractAirportMatches(data: unknown, query: string, iata?: string): AirportMatch[] {
  if (!isRecord(data)) return [];

  const items = Array.isArray(data.data) ? data.data : [];
  const normalizedQuery = query.trim().toLowerCase();
  const normalizedIata = iata?.trim().toUpperCase();

  const matches: AirportMatch[] = [];

  for (const item of items) {
    if (!isRecord(item)) continue;

    const skyId = readString(item.skyId) ?? readString(item.SkyId);
    const entityId = readString(item.entityId) ?? readString(item.EntityId);
    const title = readString(item.title) ?? readString(item.name) ?? '';
    const presentation = isRecord(item.presentation) ? item.presentation : null;
    const itemIata =
      readString(item.iata) ??
      readString(item.iataCode) ??
      (presentation ? readString(presentation.recommendationTitle) : undefined);

    if (!skyId || !entityId) continue;

    matches.push({ skyId, entityId, title: title || itemIata || skyId });
  }

  if (normalizedIata) {
    const iataMatch = matches.find(
      (m) =>
        m.skyId.toUpperCase() === normalizedIata ||
        m.title.toUpperCase().includes(normalizedIata)
    );
    if (iataMatch) return [iataMatch];
  }

  const queryMatch = matches.find((m) => m.title.toLowerCase().includes(normalizedQuery));
  if (queryMatch) return [queryMatch];

  return matches.slice(0, 1);
}

async function resolveAirport(
  apiKey: string,
  cityName: string,
  iata?: string
): Promise<AirportMatch> {
  const queries = [iata, cityName, iata && cityName ? `${cityName} ${iata}` : null].filter(
    (q): q is string => Boolean(q)
  );

  for (const query of queries) {
    const { response, data, text } = await skyScrapperGet({
      apiKey,
      path: '/api/v1/flights/searchAirport',
      searchParams: { query, locale: 'en-US' },
    });

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error(
          'Subscribe to Sky Scrapper on RapidAPI (sky-scrapper) to enable flight search.'
        );
      }
      if (response.status === 429) {
        throw new Error('RapidAPI rate limit reached. Try again later.');
      }
      console.error(`Sky Scrapper airport search failed for "${query}":`, response.status, text.slice(0, 200));
      continue;
    }

    const matches = extractAirportMatches(data, cityName, iata);
    if (matches.length > 0) {
      return matches[0];
    }
  }

  throw new Error(`No airport found for ${cityName}`);
}

function getContext(data: unknown): Record<string, unknown> | null {
  if (!isRecord(data)) return null;
  const inner = isRecord(data.data) ? data.data : data;
  const context = inner.context;
  return isRecord(context) ? context : null;
}

function getSessionId(data: unknown): string | undefined {
  const context = getContext(data);
  return context ? readString(context.sessionId) : undefined;
}

function getStatus(data: unknown): string | undefined {
  const context = getContext(data);
  return context ? readString(context.status)?.toLowerCase() : undefined;
}

function extractItineraryResults(data: unknown): unknown[] {
  if (!isRecord(data)) return [];
  const inner = isRecord(data.data) ? data.data : data;
  const itineraries = inner.itineraries;

  if (isRecord(itineraries) && Array.isArray(itineraries.results)) {
    return itineraries.results;
  }
  if (Array.isArray(itineraries)) {
    return itineraries;
  }
  return [];
}

function extractPrice(itinerary: Record<string, unknown>): { price?: number; priceLabel?: string } {
  const priceObject = itinerary.price;
  if (isRecord(priceObject)) {
    const raw = readNumber(priceObject.raw) ?? readNumber(priceObject.amount);
    const formatted = readString(priceObject.formatted) ?? readString(priceObject.display);
    return { price: raw, priceLabel: formatted };
  }
  return {};
}

function extractLegTime(leg: Record<string, unknown>, field: 'departure' | 'arrival'): string | undefined {
  const value = leg[field];
  if (isRecord(value)) {
    return readString(value.at) ?? readString(value.dateTime);
  }
  return readString(value) ?? readString(leg[`${field}Time`]);
}

function extractAirline(leg: Record<string, unknown>): string | undefined {
  const carriers = leg.carriers;
  if (isRecord(carriers) && Array.isArray(carriers.marketing)) {
    const names = carriers.marketing
      .map((carrier) => (isRecord(carrier) ? readString(carrier.name) : undefined))
      .filter((name): name is string => Boolean(name));
    if (names.length > 0) return names.join(', ');
  }
  return undefined;
}

function mapItineraryToFlight(itinerary: unknown): FlightResult | null {
  if (!isRecord(itinerary)) return null;

  const { price, priceLabel } = extractPrice(itinerary);
  const legs = Array.isArray(itinerary.legs) ? itinerary.legs : [];
  const firstLeg = legs.find(isRecord);
  if (!firstLeg) {
    if (price === undefined && !priceLabel) return null;
    return { price, priceLabel };
  }

  const durationMinutes = readNumber(firstLeg.durationInMinutes);
  const stops =
    readNumber(firstLeg.stopCount) ??
    (Array.isArray(firstLeg.segments) ? Math.max(firstLeg.segments.length - 1, 0) : undefined);

  const flight: FlightResult = {
    airline: extractAirline(firstLeg),
    price,
    priceLabel,
    duration: formatMinutesDuration(durationMinutes),
    departureTime: formatFlightTime(extractLegTime(firstLeg, 'departure')),
    arrivalTime: formatFlightTime(extractLegTime(firstLeg, 'arrival')),
    stops,
  };

  if (
    flight.price === undefined &&
    !flight.priceLabel &&
    !flight.airline &&
    !flight.duration &&
    !flight.departureTime
  ) {
    return null;
  }

  return flight;
}

async function pollUntilComplete(apiKey: string, initialData: unknown): Promise<unknown> {
  let currentData = initialData;
  let attempts = 0;

  while (getStatus(currentData) === 'incomplete' && attempts < 6) {
    const sessionId = getSessionId(currentData);
    if (!sessionId) break;

    await sleep(1000);

    const { response, data } = await skyScrapperGet({
      apiKey,
      path: '/api/v2/flights/searchIncomplete',
      searchParams: { sessionId, currency: 'USD', market: 'en-US', countryCode: 'US' },
    });

    if (!response.ok || data === null) break;
    currentData = data;
    attempts += 1;
  }

  return currentData;
}

export async function searchSkyScrapperFlights(
  apiKey: string,
  originCity: string,
  destinationCity: string,
  date: string,
  originIata?: string,
  destinationIata?: string
): Promise<FlightResult[]> {
  const [origin, destination] = await Promise.all([
    resolveAirport(apiKey, originCity, originIata),
    resolveAirport(apiKey, destinationCity, destinationIata),
  ]);

  const { response, data, text } = await skyScrapperGet({
    apiKey,
    path: '/api/v2/flights/searchFlights',
    searchParams: {
      originSkyId: origin.skyId,
      destinationSkyId: destination.skyId,
      originEntityId: origin.entityId,
      destinationEntityId: destination.entityId,
      date,
      adults: '1',
      currency: 'USD',
      market: 'en-US',
      countryCode: 'US',
      cabinClass: 'economy',
      sortBy: 'best',
    },
  });

  if (!response.ok) {
    console.error('Sky Scrapper search error:', response.status, text.slice(0, 400));
    if (response.status === 403) {
      throw new Error('Subscribe to Sky Scrapper on RapidAPI (sky-scrapper) to enable flight search.');
    }
    if (response.status === 429) {
      throw new Error('RapidAPI rate limit reached. Try again later.');
    }
    throw new Error('Flight search unavailable. Try again later.');
  }

  const completed = await pollUntilComplete(apiKey, data);
  const flights = extractItineraryResults(completed)
    .map(mapItineraryToFlight)
    .filter((f): f is FlightResult => f !== null)
    .slice(0, 3);

  if (flights.length === 0) {
    throw new Error('No flights found for this route and date.');
  }

  return flights;
}
