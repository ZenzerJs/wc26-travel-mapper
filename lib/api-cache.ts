import { unstable_cache } from 'next/cache';

/** POI data changes slowly — cache for 7 days. */
export const POI_CACHE_SECONDS = 60 * 60 * 24 * 7;

/** Flight prices shift through the day — cache for 12 hours. */
export const FLIGHT_CACHE_SECONDS = 60 * 60 * 12;

/** ~1.1 km grid so nearby route samples share one cache cell. */
export function roundCoord(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Thrown from inside unstable_cache when the result must not be stored
 * (empty POI list, API failure, no flights found).
 */
export class DoNotCacheError extends Error {
  constructor(public readonly value: unknown) {
    super('do-not-cache');
    this.name = 'DoNotCacheError';
  }
}

export function isDoNotCacheError(error: unknown): error is DoNotCacheError {
  return error instanceof DoNotCacheError;
}

export function createCachedFetcher<TArgs extends unknown[], TResult>(
  namespace: string,
  revalidateSeconds: number,
  fetcher: (...args: TArgs) => Promise<TResult>,
  shouldCache: (result: TResult) => boolean
): (...args: TArgs) => Promise<TResult> {
  return (...args: TArgs) => {
    const keyParts = args.map((arg) => String(arg));
    const cached = unstable_cache(
      async () => {
        const result = await fetcher(...args);
        if (!shouldCache(result)) {
          throw new DoNotCacheError(result);
        }
        return result;
      },
      [namespace, ...keyParts],
      { revalidate: revalidateSeconds, tags: [`${namespace}:${keyParts.join(':')}`] }
    );
    return cached();
  };
}
