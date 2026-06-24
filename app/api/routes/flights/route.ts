import { NextRequest, NextResponse } from 'next/server';
import { searchFlights } from '@/lib/flight-search';
import { getAmadeusCredentials, getRapidApiKey } from '@/lib/server-secrets';
import type { FlightSearchRequest, FlightSearchResponse } from '@/lib/types';
import { isValidCityName, isValidFlightDate } from '@/lib/validate-request';

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
  const searchParams = {
    originCity: originCity.trim(),
    destinationCity: destinationCity.trim(),
    originIata: originIata?.trim().toUpperCase(),
    destinationIata: destinationIata?.trim().toUpperCase(),
    originCountry: originCountry?.trim(),
    destinationCountry: destinationCountry?.trim(),
    departDate,
  };

  const { flights, errors } = await searchFlights(searchParams);

  if (flights.length > 0) {
    const response: FlightSearchResponse = { flights };
    return NextResponse.json(response);
  }

  const amadeus = getAmadeusCredentials();
  const rapidKey = getRapidApiKey();

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
