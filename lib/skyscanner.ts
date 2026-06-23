import { formatDuration } from '@/lib/format';
import type { FlightResult } from '@/lib/types';

const SKYSCANNER_HOST = 'flights-sky.p.rapidapi.com';
const SKYSCANNER_BASE_URL = `https://${SKYSCANNER_HOST}`;

interface SkyscannerRequestOptions {
  apiKey: string;
  path: string;
  searchParams?: Record<string, string>;
}

function getOutboundDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date.toISOString().slice(0, 10);
}

function resolveSearchDate(date?: string): string {
  return date ?? getOutboundDate();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function formatFlightTime(value: unknown): string | undefined {
  const text = readString(value);
  if (!text) {
    return undefined;
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    return text;
  }

  return parsed.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatMinutesDuration(minutes: number | undefined): string | undefined {
  if (minutes === undefined) {
    return undefined;
  }

  return formatDuration(minutes * 60);
}

async function skyscannerGet({ apiKey, path, searchParams = {} }: SkyscannerRequestOptions) {
  const url = new URL(`${SKYSCANNER_BASE_URL}${path}`);
  Object.entries(searchParams).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-rapidapi-host': SKYSCANNER_HOST,
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

function extractEntityId(autoCompleteData: unknown): string | undefined {
  if (!isRecord(autoCompleteData)) {
    return undefined;
  }

  const items = autoCompleteData.data;
  if (!Array.isArray(items) || items.length === 0) {
    return undefined;
  }

  for (const item of items) {
    if (!isRecord(item)) {
      continue;
    }

    const presentation = item.presentation;
    if (isRecord(presentation)) {
      const presentationId = readString(presentation.id);
      if (presentationId) {
        return presentationId;
      }
    }

    const placeId = readString(item.PlaceId) ?? readString(item.placeId);
    if (placeId) {
      return placeId;
    }

    const skyId = readString(item.skyId) ?? readString(item.SkyId);
    if (skyId) {
      return skyId;
    }

    const entityId = readString(item.entityId) ?? readString(item.EntityId);
    if (entityId) {
      return entityId;
    }
  }

  return undefined;
}

interface PlaceLookup {
  cityName: string;
  iata?: string;
  country?: string;
}

async function tryAutocomplete(
  apiKey: string,
  query: string,
  path: '/web/flights/auto-complete' | '/flights/auto-complete'
): Promise<string | undefined> {
  const searchParams: Record<string, string> = { query: query.trim() };
  if (path === '/flights/auto-complete') {
    searchParams.market = 'US';
    searchParams.locale = 'en-US';
  }

  const { response, data, text } = await skyscannerGet({ apiKey, path, searchParams });

  if (!response.ok) {
    console.error(`Auto-complete failed for "${query}" (${path}):`, response.status, text.substring(0, 200));
    return undefined;
  }

  return extractEntityId(data);
}

async function resolvePlaceId(apiKey: string, lookup: PlaceLookup): Promise<string> {
  const queries = [
    lookup.cityName.trim(),
    lookup.country ? `${lookup.cityName.trim()}, ${lookup.country}` : null,
    lookup.iata?.trim().toUpperCase() ?? null,
    lookup.iata?.toUpperCase() === 'EWR' ? 'Newark' : null,
    lookup.iata?.toUpperCase() === 'EWR' ? 'Newark Liberty' : null,
  ].filter((q): q is string => Boolean(q));

  const uniqueQueries = Array.from(new Set(queries));

  for (const query of uniqueQueries) {
    for (const path of ['/web/flights/auto-complete', '/flights/auto-complete'] as const) {
      const placeId = await tryAutocomplete(apiKey, query, path);
      if (placeId) {
        return placeId;
      }
    }
  }

  // When auto-complete is down, the search API accepts IATA codes directly.
  if (lookup.iata && /^[A-Za-z]{3}$/.test(lookup.iata)) {
    return lookup.iata.trim().toUpperCase();
  }

  throw new Error(`No airport found for ${lookup.cityName}`);
}

function getContext(data: unknown): Record<string, unknown> | null {
  if (!isRecord(data)) {
    return null;
  }

  const inner = isRecord(data.data) ? data.data : data;
  const context = inner.context;
  return isRecord(context) ? context : null;
}

function getSessionId(data: unknown): string | undefined {
  const context = getContext(data);
  if (context) {
    const sessionId = readString(context.sessionId);
    if (sessionId) return sessionId;
  }

  if (!isRecord(data)) return undefined;
  const inner = isRecord(data.data) ? data.data : data;
  return readString(inner.sessionId) ?? readString(inner.token);
}

function getStatus(data: unknown): string | undefined {
  const context = getContext(data);
  if (context) {
    const status = readString(context.status)?.toLowerCase();
    if (status) return status;
  }

  if (!isRecord(data)) return undefined;
  const inner = isRecord(data.data) ? data.data : data;
  const status = readString(inner.status)?.toLowerCase();
  return status === 'false' ? 'failed' : status;
}

function hasSearchFailure(data: unknown): boolean {
  if (!isRecord(data)) return true;

  if (readString(data.errors)) return true;

  const inner = isRecord(data.data) ? data.data : data;
  if (isRecord(inner) && inner.errors) return true;
  if (isRecord(inner) && inner.status === false) return true;

  return false;
}

function unwrapSearchPayload(data: unknown): Record<string, unknown> | null {
  if (!isRecord(data)) return null;

  const level1 = isRecord(data.data) ? data.data : data;
  if (isRecord(level1.data)) {
    return level1.data;
  }

  return level1;
}

function extractItineraryResults(data: unknown): unknown[] {
  const inner = unwrapSearchPayload(data);
  if (!inner) return [];

  const itineraries = inner.itineraries;

  if (isRecord(itineraries) && Array.isArray(itineraries.results)) {
    if (itineraries.results.length > 0) {
      return itineraries.results;
    }
  }

  if (isRecord(itineraries) && Array.isArray(itineraries.buckets)) {
    return itineraries.buckets.flatMap((bucket) => {
      if (!isRecord(bucket) || !Array.isArray(bucket.items)) {
        return [];
      }

      return bucket.items;
    });
  }

  if (Array.isArray(itineraries)) {
    return itineraries;
  }

  if (Array.isArray(inner.results)) {
    return inner.results;
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

  const rawPrice = readNumber(itinerary.price) ?? readNumber(itinerary.minPrice);
  const formatted = readString(itinerary.priceFormatted);

  return { price: rawPrice, priceLabel: formatted };
}

function extractAirline(leg: Record<string, unknown>): string | undefined {
  const carriers = leg.carriers;
  if (isRecord(carriers) && Array.isArray(carriers.marketing)) {
    const names = carriers.marketing
      .map((carrier) => (isRecord(carrier) ? readString(carrier.name) : undefined))
      .filter((name): name is string => Boolean(name));

    if (names.length > 0) {
      return names.join(', ');
    }
  }

  if (readString(leg.carrierName)) {
    return readString(leg.carrierName);
  }

  const segments = leg.segments;
  if (Array.isArray(segments)) {
    const names = segments
      .map((segment) => {
        if (!isRecord(segment)) {
          return undefined;
        }

        if (isRecord(segment.marketingCarrier)) {
          return readString(segment.marketingCarrier.name);
        }

        return readString(segment.carrierName);
      })
      .filter((name): name is string => Boolean(name));

    if (names.length > 0) {
      return Array.from(new Set(names)).join(', ');
    }
  }

  return undefined;
}

function mapItineraryToFlight(itinerary: unknown): FlightResult | null {
  if (!isRecord(itinerary)) {
    return null;
  }

  const { price, priceLabel } = extractPrice(itinerary);
  const legs = Array.isArray(itinerary.legs) ? itinerary.legs : [];
  const firstLeg = legs.find((leg) => isRecord(leg));

  if (!firstLeg || !isRecord(firstLeg)) {
    if (price === undefined && !priceLabel) {
      return null;
    }

    return {
      price,
      priceLabel,
      airline: readString(itinerary.airline),
      duration: readString(itinerary.duration),
      departureTime: formatFlightTime(itinerary.departureTime ?? itinerary.departure),
      arrivalTime: formatFlightTime(itinerary.arrivalTime ?? itinerary.arrival),
      stops: readNumber(itinerary.stopCount) ?? readNumber(itinerary.stops),
    };
  }

  const durationMinutes =
    readNumber(firstLeg.durationInMinutes) ??
    readNumber(firstLeg.durationMinutes) ??
    readNumber(itinerary.durationInMinutes);

  const stops =
    readNumber(firstLeg.stopCount) ??
    readNumber(itinerary.stopCount) ??
    (Array.isArray(firstLeg.segments) ? Math.max(firstLeg.segments.length - 1, 0) : undefined);

  const flight: FlightResult = {
    airline: extractAirline(firstLeg) ?? readString(itinerary.airline),
    price,
    priceLabel,
    duration:
      readString(firstLeg.duration) ??
      readString(itinerary.duration) ??
      formatMinutesDuration(durationMinutes),
    departureTime: formatFlightTime(
      firstLeg.departure ?? firstLeg.departureTime ?? itinerary.departureTime ?? itinerary.departure
    ),
    arrivalTime: formatFlightTime(
      firstLeg.arrival ?? firstLeg.arrivalTime ?? itinerary.arrivalTime ?? itinerary.arrival
    ),
    stops,
  };

  if (
    flight.price === undefined &&
    !flight.priceLabel &&
    !flight.airline &&
    !flight.duration &&
    !flight.departureTime &&
    !flight.arrivalTime
  ) {
    return null;
  }

  return flight;
}

function parseFlights(data: unknown): FlightResult[] {
  return extractItineraryResults(data)
    .map(mapItineraryToFlight)
    .filter((flight): flight is FlightResult => flight !== null)
    .slice(0, 3);
}

async function pollSearchUntilComplete(apiKey: string, initialData: unknown): Promise<unknown> {
  let currentData = initialData;
  let attempts = 0;

  while (getStatus(currentData) === 'incomplete' && attempts < 6) {
    const sessionId = getSessionId(currentData);
    if (!sessionId) {
      break;
    }

    await sleep(1000);

    const { response, data } = await skyscannerGet({
      apiKey,
      path: '/web/flights/search-incomplete',
      searchParams: { sessionId },
    });

    if (!response.ok || data === null) {
      break;
    }

    currentData = data;
    attempts += 1;
  }

  return currentData;
}

export async function searchSkyscannerFlights(
  apiKey: string,
  originCity: string,
  destinationCity: string,
  date?: string,
  originIata?: string,
  destinationIata?: string,
  originCountry?: string,
  destinationCountry?: string
): Promise<FlightResult[]> {
  const departDate = resolveSearchDate(date);
  const [placeIdFrom, placeIdTo] = await Promise.all([
    resolvePlaceId(apiKey, { cityName: originCity, iata: originIata, country: originCountry }),
    resolvePlaceId(apiKey, { cityName: destinationCity, iata: destinationIata, country: destinationCountry }),
  ]);

  let lastError = 'Flight search unavailable. Try checking Google Flights directly.';
  let completedData: unknown = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) {
      await sleep(1500 * attempt);
    }

    const { response, data, text } = await skyscannerGet({
      apiKey,
      path: '/web/flights/search-one-way',
      searchParams: {
        placeIdFrom,
        placeIdTo,
        departDate,
        adults: '1',
        currency: 'USD',
        market: 'US',
        locale: 'en-US',
        cabinClass: 'economy',
      },
    });

    if (!response.ok) {
      console.error('Skyscanner API error:', response.status, text.substring(0, 500));
      lastError =
        response.status === 403
          ? 'Flight search unavailable: this RapidAPI key is not subscribed to Flights Scraper Sky.'
          : response.status === 429
            ? 'Flight search unavailable: RapidAPI rate limit reached. Try again later.'
            : 'Flight search unavailable. Try checking Google Flights directly.';
      continue;
    }

    if (hasSearchFailure(data)) {
      console.error('Skyscanner search returned errors:', text.substring(0, 400));
      lastError = 'Flight search temporarily unavailable. Try again or use Skyscanner directly.';
      continue;
    }

    completedData = await pollSearchUntilComplete(apiKey, data);
    const flights = parseFlights(completedData);

    if (flights.length > 0) {
      return flights;
    }
  }

  throw new Error(lastError);
}
