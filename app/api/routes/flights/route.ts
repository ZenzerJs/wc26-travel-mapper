import { NextRequest, NextResponse } from 'next/server';
import { searchSkyscannerFlights } from '@/lib/skyscanner';
import { getRapidApiKey } from '@/lib/server-secrets';
import type { FlightSearchRequest, FlightSearchResponse } from '@/lib/types';
import { isValidCityName, isValidFlightDate } from '@/lib/validate-request';

export async function POST(request: NextRequest) {
  const apiKey = getRapidApiKey();

  if (!apiKey) {
    return NextResponse.json({ error: 'Flight search is not configured.' }, { status: 500 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { originCity, destinationCity, date } = body as Partial<FlightSearchRequest>;

  if (!isValidCityName(originCity) || !isValidCityName(destinationCity) || !isValidFlightDate(date)) {
    return NextResponse.json(
      { error: 'Request must include valid originCity and destinationCity names.' },
      { status: 400 }
    );
  }

  try {
    const flights = await searchSkyscannerFlights(
      apiKey,
      originCity.trim(),
      destinationCity.trim(),
      date
    );
    const response: FlightSearchResponse = { flights };
    return NextResponse.json(response);
  } catch (error) {
    console.error('Flight route error:', error);
    const message =
      process.env.NODE_ENV === 'production'
        ? error instanceof Error && error.message.startsWith('No airport found')
          ? error.message
          : 'Flight search unavailable. Try again later.'
        : error instanceof Error
          ? error.message
          : 'Flight search unavailable. Try checking Google Flights directly.';

    return NextResponse.json({ error: message, flights: [] }, { status: 502 });
  }
}
