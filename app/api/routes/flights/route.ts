import { NextRequest, NextResponse } from 'next/server';
import { searchSkyscannerFlights } from '@/lib/skyscanner';
import type { FlightSearchRequest, FlightSearchResponse } from '@/lib/types';

export async function POST(request: NextRequest) {
  const apiKey = process.env.RAPIDAPI_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: 'RapidAPI key is not configured.' }, { status: 500 });
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

  if (!originIata || !destinationIata) {
    return NextResponse.json(
      { error: 'Request must include originIata and destinationIata.' },
      { status: 400 }
    );
  }

  try {
    const flights = await searchSkyscannerFlights(apiKey, originIata, destinationIata, date);
    const response: FlightSearchResponse = { flights };
    return NextResponse.json(response);
  } catch (error) {
    console.error('Flight route error:', error);
    const message =
      error instanceof Error
        ? error.message
        : 'Flight search unavailable. Try checking Google Flights directly.';

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
