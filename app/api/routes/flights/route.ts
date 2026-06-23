import { NextRequest, NextResponse } from 'next/server';
import { searchSkyscannerFlights } from '@/lib/skyscanner';
import { getRapidApiKey } from '@/lib/server-secrets';
import type { FlightSearchRequest, FlightSearchResponse } from '@/lib/types';
import { isValidFlightDate, isValidIata, normalizeIata } from '@/lib/validate-request';

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

  const { originIata, destinationIata, date } = body as Partial<FlightSearchRequest>;

  if (!isValidIata(originIata) || !isValidIata(destinationIata) || !isValidFlightDate(date)) {
    return NextResponse.json(
      { error: 'Request must include valid originIata and destinationIata codes.' },
      { status: 400 }
    );
  }

  try {
    const flights = await searchSkyscannerFlights(
      apiKey,
      normalizeIata(originIata),
      normalizeIata(destinationIata),
      date
    );
    const response: FlightSearchResponse = { flights };
    return NextResponse.json(response);
  } catch (error) {
    console.error('Flight route error:', error);
    const message =
      process.env.NODE_ENV === 'production'
        ? 'Flight search unavailable. Try again later.'
        : error instanceof Error
          ? error.message
          : 'Flight search unavailable. Try checking Google Flights directly.';

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
