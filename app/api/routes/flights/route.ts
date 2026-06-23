import { NextRequest, NextResponse } from 'next/server';
import { searchAmadeusFlights } from '@/lib/amadeus-flights';
import { searchSkyScrapperFlights } from '@/lib/sky-scrapper';
import { searchSkyscannerFlights } from '@/lib/skyscanner';
import { getAmadeusCredentials, getRapidApiFlightHost, getRapidApiKey } from '@/lib/server-secrets';
import type { FlightSearchRequest, FlightSearchResponse } from '@/lib/types';
import { isValidCityName, isValidFlightDate, isValidIata } from '@/lib/validate-request';

function resolveFlightDate(date?: string): string {
  if (date) return date;
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}

function productionErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'Flight search unavailable. Try again later.';
  }

  const msg = error.message;
  if (
    msg.startsWith('No airport found') ||
    msg.startsWith('No flights found') ||
    msg.includes('quota') ||
    msg.includes('rate limit') ||
    msg.includes('Subscribe') ||
    msg.includes('Amadeus') ||
    msg.includes('credentials')
  ) {
    return msg;
  }

  return 'Flight search unavailable. Try again later.';
}

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { originCity, destinationCity, originIata, destinationIata, originCountry, destinationCountry, date } =
    body as Partial<FlightSearchRequest>;

  if (!isValidCityName(originCity) || !isValidCityName(destinationCity) || !isValidFlightDate(date)) {
    return NextResponse.json(
      { error: 'Request must include valid originCity and destinationCity names.' },
      { status: 400 }
    );
  }

  const departDate = resolveFlightDate(date);
  const errors: string[] = [];

  // ── 1. Amadeus (free tier, uses IATA directly) ───────────────────────────
  const amadeus = getAmadeusCredentials();
  if (amadeus && isValidIata(originIata) && isValidIata(destinationIata)) {
    try {
      const flights = await searchAmadeusFlights(
        amadeus.clientId,
        amadeus.clientSecret,
        originIata,
        destinationIata,
        departDate
      );
      const response: FlightSearchResponse = { flights };
      return NextResponse.json(response);
    } catch (error) {
      console.error('Amadeus flight error:', error);
      errors.push(error instanceof Error ? error.message : 'Amadeus search failed');
    }
  }

  // ── 2. RapidAPI Sky Scrapper (recommended — subscribe on RapidAPI) ────────
  const rapidKey = getRapidApiKey();
  const flightHost = getRapidApiFlightHost();

  if (rapidKey && flightHost.includes('sky-scrapper')) {
    try {
      const flights = await searchSkyScrapperFlights(
        rapidKey,
        originCity.trim(),
        destinationCity.trim(),
        departDate,
        originIata?.trim().toUpperCase(),
        destinationIata?.trim().toUpperCase()
      );
      const response: FlightSearchResponse = { flights };
      return NextResponse.json(response);
    } catch (error) {
      console.error('Sky Scrapper flight error:', error);
      errors.push(error instanceof Error ? error.message : 'Sky Scrapper search failed');
    }
  }

  // ── 3. RapidAPI Flights Sky (legacy fallback) ─────────────────────────────
  if (rapidKey && flightHost.includes('flights-sky')) {
    try {
      const flights = await searchSkyscannerFlights(
        rapidKey,
        originCity.trim(),
        destinationCity.trim(),
        departDate,
        originIata?.trim().toUpperCase(),
        destinationIata?.trim().toUpperCase(),
        originCountry?.trim(),
        destinationCountry?.trim()
      );
      const response: FlightSearchResponse = { flights };
      return NextResponse.json(response);
    } catch (error) {
      console.error('Skyscanner flight error:', error);
      errors.push(error instanceof Error ? error.message : 'Skyscanner search failed');
    }
  }

  if (!amadeus && !rapidKey) {
    return NextResponse.json(
      {
        error:
          'Flight search is not configured. Add AMADEUS_CLIENT_ID and AMADEUS_CLIENT_SECRET (free at developers.amadeus.com).',
        flights: [],
      },
      { status: 500 }
    );
  }

  const message =
    errors.find((e) => e.includes('quota') || e.includes('rate limit')) ??
    errors[0] ??
    'Flight search unavailable. Try again later.';

  return NextResponse.json(
    {
      error: productionErrorMessage(new Error(message)),
      flights: [],
    },
    { status: 502 }
  );
}
