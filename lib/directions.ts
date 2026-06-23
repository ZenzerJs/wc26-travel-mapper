import type { DirectionsErrorResponse, DirectionsRequest, RouteResponse } from '@/lib/types';

export async function fetchDirections(request: DirectionsRequest): Promise<RouteResponse> {
  const response = await fetch('/api/routes/directions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error('Directions fetch failed:', text);
    let data: DirectionsErrorResponse | null = null;

    try {
      data = JSON.parse(text) as DirectionsErrorResponse;
    } catch {
      data = null;
    }

    const errorMessage =
      data && 'error' in data ? data.error : 'Unable to fetch directions. Please try again.';
    throw new Error(errorMessage);
  }

  return (await response.json()) as RouteResponse;
}
