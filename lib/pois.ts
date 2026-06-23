import {
  DEFAULT_POI_RADIUS_METERS,
  HOTEL_SAMPLE_INTERVAL_KM,
  POI_CATEGORY_IDS,
  ROUTE_SAMPLE_INTERVAL_KM,
} from '@/lib/constants';
import { distanceToRouteMeters, pickEvenlySpaced, routeLengthKm, sampleRouteEveryKm } from '@/lib/geo';
import { fetchPois } from '@/lib/pois-client';
import type { GroundRouteMode, POICategoryGroup, RoutePOI } from '@/lib/types';

const STANDARD_POI_GROUPS: POICategoryGroup[] = ['food', 'arts', 'outdoors'];

interface SamplingPlan {
  poiIntervalKm: number;
  maxPoiPoints: number;
  hotelIntervalKm: number;
  maxHotelPoints: number;
}

/** Scale sample density with route length so long drives get stops along the whole path. */
function getSamplingPlan(lengthKm: number): SamplingPlan {
  if (lengthKm <= 500) {
    return { poiIntervalKm: 80, maxPoiPoints: 5, hotelIntervalKm: 150, maxHotelPoints: 3 };
  }
  if (lengthKm <= 1200) {
    return { poiIntervalKm: 150, maxPoiPoints: 8, hotelIntervalKm: 250, maxHotelPoints: 5 };
  }
  if (lengthKm <= 2000) {
    return { poiIntervalKm: 200, maxPoiPoints: 10, hotelIntervalKm: 350, maxHotelPoints: 6 };
  }
  // Cross-country hauls (e.g. New York → Dallas ~2,500 km)
  return { poiIntervalKm: 220, maxPoiPoints: 12, hotelIntervalKm: 400, maxHotelPoints: 7 };
}

function getStandardCategories(mode: GroundRouteMode): POICategoryGroup[] {
  if (mode === 'driving') {
    return [...STANDARD_POI_GROUPS, 'gas'];
  }

  return STANDARD_POI_GROUPS;
}

async function fetchCategoryAtPoints(
  geometry: GeoJSON.LineString,
  samplePoints: Array<{ lat: number; lng: number }>,
  group: POICategoryGroup,
  seen: Set<string>,
  pois: RoutePOI[],
  includeDistanceFromRoute: boolean
): Promise<void> {
  for (const point of samplePoints) {
    try {
      const { pois: results } = await fetchPois({
        lat: point.lat,
        lng: point.lng,
        radius: DEFAULT_POI_RADIUS_METERS,
        categoryId: POI_CATEGORY_IDS[group],
      });

      for (const poi of results) {
        if (seen.has(poi.id)) {
          continue;
        }

        seen.add(poi.id);

        if (includeDistanceFromRoute) {
          pois.push({
            ...poi,
            categoryGroup: group,
            distanceFromRoute: distanceToRouteMeters({ lat: poi.lat, lng: poi.lng }, geometry),
          });
        } else {
          pois.push({ ...poi, categoryGroup: group });
        }
      }
    } catch {
      // Silently skip sample points with no results or API errors.
    }
  }
}

export async function discoverPoisAlongRoute(
  geometry: GeoJSON.LineString,
  mode: GroundRouteMode
): Promise<RoutePOI[]> {
  const lengthKm = routeLengthKm(geometry);
  const plan = getSamplingPlan(lengthKm);

  const allPoiSamples = sampleRouteEveryKm(
    geometry,
    plan.poiIntervalKm || ROUTE_SAMPLE_INTERVAL_KM
  );
  const standardSamplePoints = pickEvenlySpaced(allPoiSamples, plan.maxPoiPoints);

  const allHotelSamples = sampleRouteEveryKm(geometry, plan.hotelIntervalKm || HOTEL_SAMPLE_INTERVAL_KM);
  const hotelSamplePoints = pickEvenlySpaced(allHotelSamples, plan.maxHotelPoints);

  const categories = getStandardCategories(mode);
  const seen = new Set<string>();
  const pois: RoutePOI[] = [];

  await Promise.all(
    categories.map((group) =>
      fetchCategoryAtPoints(geometry, standardSamplePoints, group, seen, pois, false)
    )
  );

  await fetchCategoryAtPoints(geometry, hotelSamplePoints, 'hotels', seen, pois, true);

  return pois;
}

export function groupPoisByCategory(pois: RoutePOI[]): Record<POICategoryGroup, RoutePOI[]> {
  return {
    food: pois.filter((poi) => poi.categoryGroup === 'food'),
    arts: pois.filter((poi) => poi.categoryGroup === 'arts'),
    outdoors: pois.filter((poi) => poi.categoryGroup === 'outdoors'),
    gas: pois.filter((poi) => poi.categoryGroup === 'gas'),
    hotels: pois.filter((poi) => poi.categoryGroup === 'hotels'),
  };
}

export function filterPois(pois: RoutePOI[], filter: 'all' | POICategoryGroup): RoutePOI[] {
  if (filter === 'all') {
    return pois;
  }

  return pois.filter((poi) => poi.categoryGroup === filter);
}

export function formatDistanceFromRoute(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km from route`;
  }

  return `${Math.round(meters)} m from route`;
}
