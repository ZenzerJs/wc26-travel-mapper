import type { City } from './types';

export async function getHostCities(): Promise<City[]> {
  const response = await fetch('/data/host-cities.json');

  if (!response.ok) {
    throw new Error('Failed to load host cities');
  }

  const cities: City[] = await response.json();
  return cities;
}

export function getCityById(cities: City[], id: string): City | undefined {
  return cities.find((city) => city.id === id);
}
