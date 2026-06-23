import { NextRequest, NextResponse } from 'next/server';
import { POI_CATEGORY_IDS } from '@/lib/constants';
import type { POICategoryGroup, POIResponse, POISearchRequest, RoutePOI } from '@/lib/types';

const ALLOWED_CATEGORY_IDS = new Set(Object.values(POI_CATEGORY_IDS));

// Map our internal category IDs to Mapbox Search Box API category slugs
const MAPBOX_CATEGORIES: Record<string, string[]> = {
  '13000': ['restaurant', 'cafe', 'fast_food'],
  '10000': ['museum', 'cinema', 'art_gallery'],
  '16000': ['park', 'national_park', 'stadium'],
  '4bf58dd8d48988d113951735': ['gas_station'],
  '4bf58dd8d48988d1f8931735': ['hotel'],
};

const CATEGORY_ID_TO_GROUP: Record<string, POICategoryGroup> = {
  '13000': 'food',
  '10000': 'arts',
  '16000': 'outdoors',
  '4bf58dd8d48988d113951735': 'gas',
  '4bf58dd8d48988d1f8931735': 'hotels',
};

interface MapboxSearchFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: {
    mapbox_id?: string;
    name?: string;
    name_preferred?: string;
    poi_category?: string[];
    poi_category_ids?: string[];
    full_address?: string;
    address?: string;
    place_formatted?: string;
  };
}

interface MapboxSearchResponse {
  type: 'FeatureCollection';
  features: MapboxSearchFeature[];
}

function isValidCoordinate(value: unknown): value is { lat: number; lng: number } {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as { lat?: unknown; lng?: unknown };
  return typeof c.lat === 'number' && typeof c.lng === 'number';
}

async function searchMapboxCategory(
  token: string,
  category: string,
  lat: number,
  lng: number,
  limit: number
): Promise<MapboxSearchFeature[]> {
  const url = new URL(
    `https://api.mapbox.com/search/searchbox/v1/category/${encodeURIComponent(category)}`
  );
  url.searchParams.set('proximity', `${lng},${lat}`);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('access_token', token);

  const response = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`Mapbox Search error ${response.status} for ${category}:`, text.substring(0, 200));
    return [];
  }

  const data = (await response.json()) as MapboxSearchResponse;
  return data.features ?? [];
}

function featureToRoutePoi(
  feature: MapboxSearchFeature,
  categoryGroup: POICategoryGroup
): RoutePOI | null {
  const [lng, lat] = feature.geometry.coordinates;
  const props = feature.properties;
  const name = props.name_preferred ?? props.name;
  if (!name) return null;

  const categoryLabel =
    props.poi_category?.[0]
      ?.split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ') ?? categoryGroup;

  return {
    id: props.mapbox_id ?? `mapbox-${lat}-${lng}-${name}`,
    name,
    category: categoryLabel,
    categoryGroup,
    lat,
    lng,
    address: props.full_address ?? props.place_formatted ?? props.address ?? '',
    rating: undefined,
  };
}

export async function POST(request: NextRequest) {
  try {
    const token = process.env.MAPBOX_TOKEN ?? process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

    if (!token) {
      return NextResponse.json({ error: 'Mapbox token is not configured.' }, { status: 500 });
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
    const { categoryId } = payload;

    if (!isValidCoordinate(payload)) {
      return NextResponse.json(
        { error: 'Request must include lat and lng coordinates.' },
        { status: 400 }
      );
    }

    const { lat, lng } = payload as { lat: number; lng: number };

    if (categoryId && !ALLOWED_CATEGORY_IDS.has(categoryId)) {
      return NextResponse.json({ error: 'Unsupported category ID.' }, { status: 400 });
    }

    const mbCategories = categoryId ? (MAPBOX_CATEGORIES[categoryId] ?? []) : [];
    const categoryGroup = categoryId ? (CATEGORY_ID_TO_GROUP[categoryId] ?? null) : null;

    if (mbCategories.length === 0 || !categoryGroup) {
      return NextResponse.json({ pois: [] satisfies RoutePOI[] });
    }

    // Query each Mapbox category and collect results
    const allFeatures: MapboxSearchFeature[] = [];
    const seen = new Set<string>();

    for (const cat of mbCategories) {
      const features = await searchMapboxCategory(token, cat, lat, lng, 5);
      for (const f of features) {
        const id = f.properties.mapbox_id ?? `${f.geometry.coordinates[0]}-${f.geometry.coordinates[1]}`;
        if (!seen.has(id)) {
          seen.add(id);
          allFeatures.push(f);
        }
      }
    }

    const pois: RoutePOI[] = allFeatures
      .map((f) => featureToRoutePoi(f, categoryGroup))
      .filter((p): p is RoutePOI => p !== null)
      .slice(0, 5);

    const response: POIResponse = { pois };
    return NextResponse.json(response);
  } catch (error) {
    console.error('POI route error:', error);
    return NextResponse.json({ pois: [] satisfies RoutePOI[] });
  }
}
