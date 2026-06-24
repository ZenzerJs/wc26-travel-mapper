import type { POIErrorResponse, POIResponse, POISearchRequest } from '@/lib/types';

export async function fetchPois(
  request: POISearchRequest
): Promise<POIResponse & { error?: string }> {
  const response = await fetch('/api/routes/pois', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  const text = await response.text();
  let data: (POIResponse & POIErrorResponse) | null = null;

  try {
    data = JSON.parse(text) as POIResponse & POIErrorResponse;
  } catch {
    data = null;
  }

  if (!response.ok) {
    const errorMessage = data?.error ?? 'POI search failed';
    console.error('POI fetch failed:', errorMessage);
    return { pois: [], error: errorMessage };
  }

  return { pois: data?.pois ?? [], error: data?.error };
}
