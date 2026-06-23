export function isValidCoordinate(value: unknown): value is { lat: number; lng: number } {
  if (typeof value !== 'object' || value === null) return false;

  const coordinate = value as { lat?: unknown; lng?: unknown };
  if (typeof coordinate.lat !== 'number' || typeof coordinate.lng !== 'number') return false;
  if (!Number.isFinite(coordinate.lat) || !Number.isFinite(coordinate.lng)) return false;

  return (
    coordinate.lat >= -90 &&
    coordinate.lat <= 90 &&
    coordinate.lng >= -180 &&
    coordinate.lng <= 180
  );
}

/** IATA airport codes are exactly three letters. */
export function isValidIata(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z]{3}$/.test(value);
}

export function normalizeIata(value: string): string {
  return value.trim().toUpperCase();
}

/** YYYY-MM-DD or omitted. */
export function isValidFlightDate(value: unknown): value is string | undefined {
  if (value === undefined || value === null || value === '') return true;
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}
