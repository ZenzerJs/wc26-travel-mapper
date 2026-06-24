import { searchAmadeusFlights } from '@/lib/amadeus-flights';
import {
  createCachedFetcher,
  DoNotCacheError,
  FLIGHT_CACHE_SECONDS,
  isDoNotCacheError,
} from '@/lib/api-cache';
import { searchSkyScrapperFlights } from '@/lib/sky-scrapper';
import { searchSkyscannerFlights } from '@/lib/skyscanner';
import { getAmadeusCredentials, getRapidApiFlightHost, getRapidApiKey } from '@/lib/server-secrets';
import type { FlightResult } from '@/lib/types';
import { isValidIata } from '@/lib/validate-request';

export interface FlightSearchParams {
  originCity: string;
  destinationCity: string;
  originIata?: string;
  destinationIata?: string;
  originCountry?: string;
  destinationCountry?: string;
  departDate: string;
}

function normalizeFlightEndpoint(value: string | undefined, fallback: string): string {
  return (value ?? fallback).trim().toUpperCase();
}

export function flightCacheKey(params: FlightSearchParams): string {
  const origin = normalizeFlightEndpoint(params.originIata, params.originCity);
  const destination = normalizeFlightEndpoint(params.destinationIata, params.destinationCity);
  return `${origin}:${destination}:${params.departDate}`;
}

export async function searchFlightsUncached(params: FlightSearchParams): Promise<{
  flights: FlightResult[];
  errors: string[];
}> {
  const {
    originCity,
    destinationCity,
    originIata,
    destinationIata,
    originCountry,
    destinationCountry,
    departDate,
  } = params;
  const errors: string[] = [];

  const amadeus = getAmadeusCredentials();
  if (amadeus && isValidIata(originIata) && isValidIata(destinationIata)) {
    try {
      const flights = await searchAmadeusFlights(
        amadeus.clientId,
        amadeus.clientSecret,
        originIata,
        destinationIata,
        departDate
      );
      return { flights, errors };
    } catch (error) {
      console.error('Amadeus flight error:', error);
      errors.push(error instanceof Error ? error.message : 'Amadeus search failed');
    }
  }

  const rapidKey = getRapidApiKey();
  const flightHost = getRapidApiFlightHost();

  if (rapidKey && flightHost.includes('sky-scrapper')) {
    try {
      const flights = await searchSkyScrapperFlights(
        rapidKey,
        originCity.trim(),
        destinationCity.trim(),
        departDate,
        originIata?.trim().toUpperCase(),
        destinationIata?.trim().toUpperCase()
      );
      return { flights, errors };
    } catch (error) {
      console.error('Sky Scrapper flight error:', error);
      errors.push(error instanceof Error ? error.message : 'Sky Scrapper search failed');
    }
  }

  if (rapidKey && flightHost.includes('flights-sky')) {
    try {
      const flights = await searchSkyscannerFlights(
        rapidKey,
        originCity.trim(),
        destinationCity.trim(),
        departDate,
        originIata?.trim().toUpperCase(),
        destinationIata?.trim().toUpperCase(),
        originCountry?.trim(),
        destinationCountry?.trim()
      );
      return { flights, errors };
    } catch (error) {
      console.error('Skyscanner flight error:', error);
      errors.push(error instanceof Error ? error.message : 'Skyscanner search failed');
    }
  }

  return { flights: [], errors };
}

const getCachedFlightsByKey = createCachedFetcher(
  'flights',
  FLIGHT_CACHE_SECONDS,
  async (cacheKey: string, paramsJson: string) => {
    const params = JSON.parse(paramsJson) as FlightSearchParams;
    const { flights } = await searchFlightsUncached(params);
    return { cacheKey, flights };
  },
  (result) => result.flights.length > 0
);

export async function searchFlights(params: FlightSearchParams): Promise<{
  flights: FlightResult[];
  errors: string[];
  fromCache: boolean;
}> {
  const cacheKey = flightCacheKey(params);
  const paramsJson = JSON.stringify(params);

  try {
    const cached = await getCachedFlightsByKey(cacheKey, paramsJson);
    return { flights: cached.flights, errors: [], fromCache: true };
  } catch (error) {
    if (isDoNotCacheError(error)) {
      const value = error.value as { flights: FlightResult[] };
      const uncached = value.flights.length > 0 ? { flights: value.flights, errors: [] } : await searchFlightsUncached(params);
      return { ...uncached, fromCache: false };
    }
    throw error;
  }
}
