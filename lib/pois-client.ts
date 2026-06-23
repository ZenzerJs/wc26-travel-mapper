import type { POIResponse, POISearchRequest } from '@/lib/types';

export async function fetchPois(request: POISearchRequest): Promise<POIResponse> {
  const response = await fetch('/api/routes/pois', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    console.error('POI fetch failed:', await response.text());
    return { pois: [] };
  }

  try {
    return (await response.json()) as POIResponse;
  } catch (error) {
    console.error('POI response parse failed:', error);
    return { pois: [] };
  }
}
