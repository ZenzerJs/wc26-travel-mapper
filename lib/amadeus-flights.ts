import { formatDuration } from '@/lib/format';
import type { FlightResult } from '@/lib/types';

const TEST_HOST = 'https://test.api.amadeus.com';
const PROD_HOST = 'https://api.amadeus.com';

let tokenCache: { token: string; expiresAtMs: number } | null = null;

function getHost(): string {
  return process.env.AMADEUS_ENV === 'production' ? PROD_HOST : TEST_HOST;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function parseIsoDuration(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/i);
  if (!match) return iso;

  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  return formatDuration(hours * 3600 + minutes * 60);
}

function formatFlightTime(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

async function getAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const now = Date.now();
  if (tokenCache && now < tokenCache.expiresAtMs - 60_000) {
    return tokenCache.token;
  }

  const response = await fetch(`${getHost()}/v1/security/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error('Amadeus auth error:', response.status, text.substring(0, 300));
    throw new Error('Flight search auth failed. Check Amadeus API credentials.');
  }

  const data = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) {
    throw new Error('Flight search auth failed. Check Amadeus API credentials.');
  }

  tokenCache = {
    token: data.access_token,
    expiresAtMs: now + (data.expires_in ?? 1800) * 1000,
  };

  return data.access_token;
}

function mapOfferToFlight(offer: Record<string, unknown>): FlightResult | null {
  const priceObj = offer.price;
  const priceTotalRaw = isRecord(priceObj) ? readString(priceObj.total) : undefined;
  const priceTotal = priceTotalRaw ? Number.parseFloat(priceTotalRaw) : undefined;
  const currency =
    isRecord(priceObj) && readString(priceObj.currency) ? priceObj.currency : 'USD';

  const itineraries = Array.isArray(offer.itineraries) ? offer.itineraries : [];
  const firstItinerary = itineraries.find(isRecord);
  if (!firstItinerary) return null;

  const segments = Array.isArray(firstItinerary.segments)
    ? firstItinerary.segments.filter(isRecord)
    : [];
  const firstSegment = segments[0];
  const lastSegment = segments[segments.length - 1];

  const airlineCodes = Array.isArray(offer.validatingAirlineCodes)
    ? offer.validatingAirlineCodes.filter((c): c is string => typeof c === 'string')
    : [];
  const segmentCarrier = firstSegment
    ? readString(firstSegment.carrierCode) ??
      (isRecord(firstSegment.operating) ? readString(firstSegment.operating.carrierCode) : undefined)
    : undefined;

  const departureTime = firstSegment
    ? formatFlightTime(readString(isRecord(firstSegment.departure) ? firstSegment.departure.at : undefined))
    : undefined;
  const arrivalTime = lastSegment
    ? formatFlightTime(readString(isRecord(lastSegment.arrival) ? lastSegment.arrival.at : undefined))
    : undefined;

  const stops = Math.max(segments.length - 1, 0);
  const duration = parseIsoDuration(readString(firstItinerary.duration));

  const priceLabel =
    priceTotal !== undefined && Number.isFinite(priceTotal)
      ? `$${Math.round(priceTotal).toLocaleString('en-US')}`
      : undefined;

  if (priceTotal === undefined && !duration && !departureTime) {
    return null;
  }

  return {
    price: Number.isFinite(priceTotal) ? Math.round(priceTotal!) : undefined,
    priceLabel: priceLabel ? `${priceLabel} ${currency}` : undefined,
    airline: airlineCodes.join(', ') || segmentCarrier || 'Flight',
    duration,
    departureTime,
    arrivalTime,
    stops,
  };
}

export async function searchAmadeusFlights(
  clientId: string,
  clientSecret: string,
  originIata: string,
  destinationIata: string,
  date: string
): Promise<FlightResult[]> {
  const token = await getAccessToken(clientId, clientSecret);

  const url = new URL(`${getHost()}/v2/shopping/flight-offers`);
  url.searchParams.set('originLocationCode', originIata.toUpperCase());
  url.searchParams.set('destinationLocationCode', destinationIata.toUpperCase());
  url.searchParams.set('departureDate', date);
  url.searchParams.set('adults', '1');
  url.searchParams.set('currencyCode', 'USD');
  url.searchParams.set('max', '3');
  url.searchParams.set('nonStop', 'false');

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const text = await response.text();
    console.error('Amadeus flight search error:', response.status, text.substring(0, 400));
    if (response.status === 401) {
      throw new Error('Flight search auth failed. Check Amadeus API credentials.');
    }
    if (response.status === 429) {
      throw new Error('Flight search rate limit reached. Try again in a few minutes.');
    }
    throw new Error('Flight search unavailable. Try again later.');
  }

  const payload = (await response.json()) as { data?: unknown[] };
  const flights = (payload.data ?? [])
    .filter(isRecord)
    .map(mapOfferToFlight)
    .filter((f): f is FlightResult => f !== null);

  if (flights.length === 0) {
    throw new Error('No flights found for this route and date.');
  }

  return flights;
}

export function isAmadeusConfigured(): boolean {
  return Boolean(process.env.AMADEUS_CLIENT_ID && process.env.AMADEUS_CLIENT_SECRET);
}
