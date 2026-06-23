/**
 * Server-only environment variables. Never import this from client components.
 * Secrets must not use the NEXT_PUBLIC_ prefix.
 */

export function getMapboxServerToken(): string | undefined {
  return process.env.MAPBOX_TOKEN ?? process.env.MAPBOX_ACCESS_TOKEN;
}

export function getRapidApiKey(): string | undefined {
  return process.env.RAPIDAPI_KEY;
}

/** RapidAPI flight provider host. Default: Sky Scrapper (subscribe on RapidAPI). */
export function getRapidApiFlightHost(): string {
  return process.env.RAPIDAPI_FLIGHT_HOST ?? 'sky-scrapper.p.rapidapi.com';
}

export function getAmadeusCredentials(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.AMADEUS_CLIENT_ID;
  const clientSecret = process.env.AMADEUS_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function getOpenWeatherApiKey(): string | undefined {
  return process.env.OPENWEATHER_API_KEY;
}

export function getFoursquareApiKey(): string | undefined {
  return process.env.FOURSQUARE_API_KEY;
}

/** Camino AI location API — also reads FOURSQUARE_API_KEY for backward compatibility. */
export function getCaminoApiKey(): string | undefined {
  return process.env.CAMINO_API_KEY ?? process.env.FOURSQUARE_API_KEY;
}
