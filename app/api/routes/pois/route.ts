import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_POI_RADIUS_METERS, POI_CATEGORY_IDS } from '@/lib/constants';
import { getFoursquareApiKey } from '@/lib/server-secrets';
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

// Map internal category IDs to Foursquare v3 category IDs.
const FOURSQUARE_CATEGORIES: Record<string, string> = {
  '13000': '13065',
  '10000': '10000',
  '16000': '16000',
  '4bf58dd8d48988d113951735': '19007',
  '4bf58dd8d48988d1f8931735': '19009',
};

interface FoursquarePlace {
  fsq_id?: string;
  name?: string;
  categories?: Array<{ id?: number; name?: string }>;
  rating?: number;
  geocodes?: { main?: { latitude?: number; longitude?: number } };
  location?: { formatted_address?: string };
}

interface FoursquareSearchResponse {
  results?: FoursquarePlace[];
}

function placeToRoutePoi(place: FoursquarePlace, categoryGroup: POICategoryGroup): RoutePOI | null {
  const lat = place.geocodes?.main?.latitude;
  const lng = place.geocodes?.main?.longitude;
  const name = place.name;
  const id = place.fsq_id;

  if (lat === undefined || lng === undefined || !name || !id) {
    return null;
  }

  return {
    id,
    name,
    category: place.categories?.[0]?.name ?? categoryGroup,
    categoryGroup,
    rating: place.rating,
    lat,
    lng,
    address: place.location?.formatted_address ?? '',
  };
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = getFoursquareApiKey();

    if (!apiKey) {
      return NextResponse.json({ error: 'Foursquare API key is not configured.' }, { status: 500 });
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

    const fsqCategory = categoryId ? FOURSQUARE_CATEGORIES[categoryId] : undefined;
    const categoryGroup = categoryId ? (CATEGORY_ID_TO_GROUP[categoryId] ?? null) : null;

    if (!fsqCategory || !categoryGroup) {
      return NextResponse.json({ pois: [] satisfies RoutePOI[] });
    }

    const url = new URL('https://api.foursquare.com/v3/places/search');
    url.searchParams.set('ll', `${lat},${lng}`);
    url.searchParams.set('radius', String(radius));
    url.searchParams.set('sort', 'POPULARITY');
    url.searchParams.set('limit', '5');
    url.searchParams.set('categories', fsqCategory);

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: apiKey,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('Foursquare error:', response.status, text.substring(0, 300));
      return NextResponse.json({ pois: [], error: 'Foursquare API failed' }, { status: 502 });
    }

    const data = (await response.json()) as FoursquareSearchResponse;
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
