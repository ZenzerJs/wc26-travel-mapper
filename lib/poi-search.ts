import { DEFAULT_POI_RADIUS_METERS, POI_CATEGORY_IDS } from '@/lib/constants';
import {
  createCachedFetcher,
  isDoNotCacheError,
  POI_CACHE_SECONDS,
  roundCoord,
} from '@/lib/api-cache';
import { getCaminoApiKey, getMapboxServerToken } from '@/lib/server-secrets';
import type { POICategoryGroup, RoutePOI } from '@/lib/types';

const CATEGORY_ID_TO_GROUP: Record<string, POICategoryGroup> = {
  '13000': 'food',
  '10000': 'arts',
  '16000': 'outdoors',
  '4bf58dd8d48988d113951735': 'gas',
  '4bf58dd8d48988d1f8931735': 'hotels',
};

const MAPBOX_CATEGORIES: Record<string, string[]> = {
  '13000': ['restaurant', 'cafe', 'fast_food'],
  '10000': ['museum', 'cinema', 'art_gallery'],
  '16000': ['park', 'national_park', 'stadium'],
  '4bf58dd8d48988d113951735': ['gas_station'],
  '4bf58dd8d48988d1f8931735': ['hotel'],
};

const CAMINO_QUERIES: Record<string, string> = {
  '13000': 'restaurants and cafes',
  '10000': 'museums and arts entertainment',
  '16000': 'parks and outdoor recreation',
  '4bf58dd8d48988d113951735': 'gas stations',
  '4bf58dd8d48988d1f8931735': 'hotels and lodging',
};

interface MapboxSearchFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    mapbox_id?: string;
    name?: string;
    name_preferred?: string;
    poi_category?: string[];
    full_address?: string;
    place_formatted?: string;
    address?: string;
  };
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

  const response = await fetch(url.toString(), { headers: { Accept: 'application/json' } });

  if (!response.ok) {
    const text = await response.text();
    console.error(`Mapbox POI ${response.status} (${category}):`, text.substring(0, 150));
    return [];
  }

  const data = (await response.json()) as { features?: MapboxSearchFeature[] };
  return data.features ?? [];
}

function mapboxFeatureToPoi(
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
  };
}

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

function caminoPlaceToPoi(place: CaminoPlace, categoryGroup: POICategoryGroup): RoutePOI | null {
  const lat = place.location?.lat ?? place.lat;
  const lon = place.location?.lon ?? place.lon;
  const name = place.name ?? place.tags?.name;
  const id = place.id;
  if (lat === undefined || lon === undefined || !name || !id) return null;

  return {
    id,
    name,
    category: place.category ?? place.amenity ?? place.tags?.category ?? categoryGroup,
    categoryGroup,
    lat,
    lng: lon,
    address: place.address ?? place.tags?.['addr:full'] ?? '',
  };
}

async function searchCamino(
  apiKey: string,
  query: string,
  lat: number,
  lng: number,
  radius: number,
  categoryGroup: POICategoryGroup
): Promise<RoutePOI[]> {
  const url = new URL('https://api.getcamino.ai/query');
  url.searchParams.set('query', query);
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lng));
  url.searchParams.set('radius', String(Math.min(radius, 10000)));
  url.searchParams.set('rank', 'true');
  url.searchParams.set('limit', '6');

  const response = await fetch(url.toString(), {
    headers: { 'X-API-Key': apiKey, Accept: 'application/json' },
  });

  if (!response.ok) {
    const text = await response.text();
    console.error('Camino POI error:', response.status, text.substring(0, 200));
    return [];
  }

  const data = (await response.json()) as { results?: CaminoPlace[] };
  return (data.results ?? [])
    .map((p) => caminoPlaceToPoi(p, categoryGroup))
    .filter((p): p is RoutePOI => p !== null);
}

export async function fetchPoisForCategory(
  categoryId: string,
  categoryGroup: POICategoryGroup,
  lat: number,
  lng: number,
  radius: number,
  mapboxToken: string | undefined,
  caminoKey: string | undefined
): Promise<RoutePOI[]> {
  const seen = new Set<string>();
  const pois: RoutePOI[] = [];

  const mbCategories = MAPBOX_CATEGORIES[categoryId] ?? [];
  if (mapboxToken && mbCategories.length > 0) {
    for (const cat of mbCategories) {
      const features = await searchMapboxCategory(mapboxToken, cat, lat, lng, 4);
      for (const f of features) {
        const poi = mapboxFeatureToPoi(f, categoryGroup);
        if (poi && !seen.has(poi.id)) {
          seen.add(poi.id);
          pois.push(poi);
        }
      }
      if (pois.length >= 4) break;
    }
  }

  if (pois.length === 0 && caminoKey) {
    const query = CAMINO_QUERIES[categoryId];
    if (query) {
      const caminoPois = await searchCamino(caminoKey, query, lat, lng, radius, categoryGroup);
      for (const poi of caminoPois) {
        if (!seen.has(poi.id)) {
          seen.add(poi.id);
          pois.push(poi);
        }
      }
    }
  }

  return pois.slice(0, 5);
}

export function getCategoryGroup(categoryId: string): POICategoryGroup | undefined {
  return CATEGORY_ID_TO_GROUP[categoryId];
}

export const ALLOWED_POI_CATEGORY_IDS = new Set(Object.values(POI_CATEGORY_IDS));

const getCachedPoisForCell = createCachedFetcher(
  'poi',
  POI_CACHE_SECONDS,
  async (
    categoryId: string,
    categoryGroup: POICategoryGroup,
    cacheLat: number,
    cacheLng: number,
    radius: number
  ) => {
    const mapboxToken = getMapboxServerToken();
    const caminoKey = getCaminoApiKey();
    return fetchPoisForCategory(
      categoryId,
      categoryGroup,
      cacheLat,
      cacheLng,
      radius,
      mapboxToken,
      caminoKey
    );
  },
  (pois) => pois.length > 0
);

export async function searchPoisWithCache(
  categoryId: string,
  categoryGroup: POICategoryGroup,
  lat: number,
  lng: number,
  radius: number = DEFAULT_POI_RADIUS_METERS
): Promise<{ pois: RoutePOI[]; fromCache: boolean }> {
  const cacheLat = roundCoord(lat);
  const cacheLng = roundCoord(lng);

  try {
    const pois = await getCachedPoisForCell(categoryId, categoryGroup, cacheLat, cacheLng, radius);
    return { pois, fromCache: true };
  } catch (error) {
    if (isDoNotCacheError(error)) {
      const mapboxToken = getMapboxServerToken();
      const caminoKey = getCaminoApiKey();
      const exact =
        lat === cacheLat && lng === cacheLng
          ? (error.value as RoutePOI[])
          : await fetchPoisForCategory(
              categoryId,
              categoryGroup,
              lat,
              lng,
              radius,
              mapboxToken,
              caminoKey
            );
      return { pois: exact, fromCache: false };
    }
    throw error;
  }
}
