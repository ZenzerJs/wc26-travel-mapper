import { NextRequest, NextResponse } from 'next/server';
import { searchFlights } from '@/lib/flight-search';
import { clientFlightError, SERVICE_UNAVAILABLE } from '@/lib/safe-errors';
import { getAmadeusCredentials, getRapidApiKey } from '@/lib/server-secrets';
import type { FlightSearchRequest, FlightSearchResponse } from '@/lib/types';
import { isValidCityName, isValidFlightDate } from '@/lib/validate-request';

function resolveFlightDate(date?: string): string {
  if (date) return date;
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
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
    console.error('Flight search not configured: missing Amadeus and RapidAPI credentials');
    return NextResponse.json(
      { error: SERVICE_UNAVAILABLE.flights, flights: [] },
      { status: 503 }
    );
  }

  if (errors.length > 0) {
    console.error('Flight search failed:', errors.join('; '));
  }

  return NextResponse.json(
    {
      error: clientFlightError(errors[0] ? new Error(errors[0]) : undefined),
      flights: [],
    },
    { status: 502 }
  );
}
