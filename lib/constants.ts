import type { POICategoryGroup } from './types';

export const POI_CATEGORY_IDS: Record<POICategoryGroup, string> = {
  food: '13000',
  arts: '10000',
  outdoors: '16000',
  gas: '4bf58dd8d48988d113951735',
  hotels: '4bf58dd8d48988d1f8931735',
};

export const POI_CATEGORY_LABELS: Record<POICategoryGroup, string> = {
  food: 'Food',
  arts: 'Arts & Entertainment',
  outdoors: 'Outdoors & Recreation',
  gas: 'Gas Station',
  hotels: 'Hotels & Lodging',
};

export const POI_COLORS: Record<POICategoryGroup, string> = {
  food: '#ef4444',
  arts: '#a855f7',
  outdoors: '#22c55e',
  gas: '#f59e0b',
  hotels: '#6366f1',
};

export const MAP_STYLES = {
  streets: 'mapbox://styles/mapbox/streets-v12',
  night: 'mapbox://styles/mapbox/dark-v11',
} as const;

export const DEFAULT_POI_RADIUS_METERS = 5000;

export const ROUTE_SAMPLE_INTERVAL_KM = 100;

export const HOTEL_SAMPLE_INTERVAL_KM = 150;

export const LONG_TRIP_SECONDS = 36_000;

export const OVERNIGHT_TRIP_SECONDS = 21_600;
