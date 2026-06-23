import type { FlightErrorResponse, FlightSearchRequest, FlightSearchResponse } from '@/lib/types';

export async function fetchFlights(request: FlightSearchRequest): Promise<FlightSearchResponse> {
  const response = await fetch('/api/routes/flights', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error('Flight fetch failed:', text);
    let data: FlightErrorResponse | null = null;

    try {
      data = JSON.parse(text) as FlightErrorResponse;
    } catch {
      data = null;
    }

    const errorMessage =
      data && 'error' in data ? data.error : 'Flight search unavailable. Try checking Google Flights directly.';
    throw new Error(errorMessage);
  }

  try {
    return (await response.json()) as FlightSearchResponse;
  } catch (error) {
    console.error('Flight response parse failed:', error);
    throw new Error('Flight search unavailable. Try checking Google Flights directly.');
  }
}
