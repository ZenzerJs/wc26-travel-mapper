import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_POI_RADIUS_METERS, POI_CATEGORY_IDS } from '@/lib/constants';
import { getCaminoApiKey } from '@/lib/server-secrets';
import type { POICategoryGroup, POIResponse, POISearchRequest, RoutePOI } from '@/lib/types';
import { isValidCoordinate } from '@/lib/validate-request';

const ALLOWED_CATEGORY_IDS = new Set(Object.values(POI_CATEGORY_IDS));

const CATEGORY_ID_TO_GROUP: Record<string, POICategoryGroup> = {
  '13000': 'food',
  '10000': 'arts',
  '16000': 'outdoors',
  '4bf58dd8d48988d113951735': 'gas',
  '4bf58dd8d48988d1f8931735': 'hotels',
};

// Natural-language queries for Camino AI (key format: camino-…).
const CAMINO_QUERIES: Record<string, string> = {
  '13000': 'restaurants and cafes',
  '10000': 'museums and arts entertainment',
  '16000': 'parks and outdoor recreation',
  '4bf58dd8d48988d113951735': 'gas stations',
  '4bf58dd8d48988d1f8931735': 'hotels and lodging',
};

interface CaminoPlace {
  id?: string;
  name?: string;
  category?: string;
  amenity?: string;
  address?: string;
  lat?: number;
  lon?: number;
  location?: { lat?: number; lon?: number };
  tags?: { name?: string; category?: string; 'addr:full'?: string };
}

interface CaminoSearchResponse {
  results?: CaminoPlace[];
}

function placeToRoutePoi(place: CaminoPlace, categoryGroup: POICategoryGroup): RoutePOI | null {
  const lat = place.location?.lat ?? place.lat;
  const lon = place.location?.lon ?? place.lon;
  const name = place.name ?? place.tags?.name;
  const id = place.id;

  if (lat === undefined || lon === undefined || !name || !id) {
    return null;
  }

  const category =
    place.category ?? place.amenity ?? place.tags?.category ?? categoryGroup;

  return {
    id,
    name,
    category,
    categoryGroup,
    lat,
    lng: lon,
    address: place.address ?? place.tags?.['addr:full'] ?? '',
  };
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = getCaminoApiKey();

    if (!apiKey) {
      return NextResponse.json({ error: 'Camino API key is not configured.' }, { status: 500 });
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

    const payload = body as Partial<POISearchRequest>;
    const { categoryId, radius: requestedRadius } = payload;

    if (!isValidCoordinate(payload)) {
      return NextResponse.json(
        { error: 'Request must include lat and lng coordinates.' },
        { status: 400 }
      );
    }

    const { lat, lng } = payload;
    const radius =
      typeof requestedRadius === 'number' && requestedRadius > 0
        ? requestedRadius
        : DEFAULT_POI_RADIUS_METERS;

    if (categoryId && !ALLOWED_CATEGORY_IDS.has(categoryId)) {
      return NextResponse.json({ error: 'Unsupported category ID.' }, { status: 400 });
    }

    const query = categoryId ? CAMINO_QUERIES[categoryId] : undefined;
    const categoryGroup = categoryId ? (CATEGORY_ID_TO_GROUP[categoryId] ?? null) : null;

    if (!query || !categoryGroup) {
      return NextResponse.json({ pois: [] satisfies RoutePOI[] });
    }

    const url = new URL('https://api.getcamino.ai/query');
    url.searchParams.set('query', query);
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lon', String(lng));
    url.searchParams.set('radius', String(Math.min(radius, 10000)));
    url.searchParams.set('rank', 'true');
    url.searchParams.set('limit', '8');

    const response = await fetch(url.toString(), {
      headers: {
        'X-API-Key': apiKey,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('Camino POI error:', response.status, text.substring(0, 300));
      return NextResponse.json({ pois: [], error: 'POI search failed' }, { status: 502 });
    }

    const data = (await response.json()) as CaminoSearchResponse;
    const pois: RoutePOI[] = (data.results ?? [])
      .map((place) => placeToRoutePoi(place, categoryGroup))
      .filter((poi): poi is RoutePOI => poi !== null);

    const poiResponse: POIResponse = { pois };
    return NextResponse.json(poiResponse);
  } catch (error) {
    console.error('POI route error:', error);
    return NextResponse.json({ pois: [], error: 'Internal error' }, { status: 500 });
  }
}
