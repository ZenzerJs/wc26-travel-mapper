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

/** Max concurrent POI API calls — avoids burning through Mapbox/Camino rate limits. */
const POI_FETCH_CONCURRENCY = 3;

/** Pause between batches to stay under per-minute limits. */
const POI_BATCH_DELAY_MS = 150;

interface SamplingPlan {
  poiIntervalKm: number;
  maxPoiPoints: number;
  hotelIntervalKm: number;
  maxHotelPoints: number;
}

interface DiscoverPoisResult {
  pois: RoutePOI[];
  failedRequests: number;
  totalRequests: number;
}

function getSamplingPlan(lengthKm: number): SamplingPlan {
  if (lengthKm <= 500) {
    return { poiIntervalKm: 100, maxPoiPoints: 4, hotelIntervalKm: 200, maxHotelPoints: 2 };
  }
  if (lengthKm <= 1200) {
    return { poiIntervalKm: 180, maxPoiPoints: 5, hotelIntervalKm: 300, maxHotelPoints: 3 };
  }
  if (lengthKm <= 2000) {
    return { poiIntervalKm: 220, maxPoiPoints: 6, hotelIntervalKm: 400, maxHotelPoints: 4 };
  }
  return { poiIntervalKm: 250, maxPoiPoints: 6, hotelIntervalKm: 500, maxHotelPoints: 4 };
}

function getStandardCategories(mode: GroundRouteMode): POICategoryGroup[] {
  if (mode === 'driving') {
    return [...STANDARD_POI_GROUPS, 'gas'];
  }
  return STANDARD_POI_GROUPS;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  limit: number
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < tasks.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await tasks[index]();
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export async function discoverPoisAlongRoute(
  geometry: GeoJSON.LineString,
  mode: GroundRouteMode
): Promise<DiscoverPoisResult> {
  const lengthKm = routeLengthKm(geometry);
  const plan = getSamplingPlan(lengthKm);

  const standardSamplePoints = pickEvenlySpaced(
    sampleRouteEveryKm(geometry, plan.poiIntervalKm || ROUTE_SAMPLE_INTERVAL_KM),
    plan.maxPoiPoints
  );
  const hotelSamplePoints = pickEvenlySpaced(
    sampleRouteEveryKm(geometry, plan.hotelIntervalKm || HOTEL_SAMPLE_INTERVAL_KM),
    plan.maxHotelPoints
  );

  const categories = getStandardCategories(mode);
  const seen = new Set<string>();
  const pois: RoutePOI[] = [];
  let failedRequests = 0;
  let totalRequests = 0;

  type FetchTask = {
    point: { lat: number; lng: number };
    group: POICategoryGroup;
    includeDistance: boolean;
  };

  const tasks: FetchTask[] = [];

  for (const point of standardSamplePoints) {
    for (const group of categories) {
      tasks.push({ point, group, includeDistance: false });
    }
  }
  for (const point of hotelSamplePoints) {
    tasks.push({ point, group: 'hotels', includeDistance: true });
  }

  const fetchTasks = tasks.map((task) => async () => {
    totalRequests += 1;
    try {
      const { pois: results, error } = await fetchPois({
        lat: task.point.lat,
        lng: task.point.lng,
        radius: DEFAULT_POI_RADIUS_METERS,
        categoryId: POI_CATEGORY_IDS[task.group],
      });

      if (error) {
        failedRequests += 1;
        return;
      }

      for (const poi of results) {
        if (seen.has(poi.id)) continue;
        seen.add(poi.id);

        if (task.includeDistance) {
          pois.push({
            ...poi,
            categoryGroup: task.group,
            distanceFromRoute: distanceToRouteMeters({ lat: poi.lat, lng: poi.lng }, geometry),
          });
        } else {
          pois.push({ ...poi, categoryGroup: task.group });
        }
      }
    } catch {
      failedRequests += 1;
    }
  });

  // Process in small batches with a short pause to avoid rate-limit storms.
  for (let i = 0; i < fetchTasks.length; i += POI_FETCH_CONCURRENCY) {
    const batch = fetchTasks.slice(i, i + POI_FETCH_CONCURRENCY);
    await runWithConcurrency(
      batch.map((fn) => () => fn()),
      POI_FETCH_CONCURRENCY
    );
    if (i + POI_FETCH_CONCURRENCY < fetchTasks.length) {
      await sleep(POI_BATCH_DELAY_MS);
    }
  }

  return { pois, failedRequests, totalRequests };
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
