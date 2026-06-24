import { NextRequest, NextResponse } from 'next/server';
import { formatDistance, formatDuration, formatStepDistance } from '@/lib/format';
import { SERVICE_UNAVAILABLE } from '@/lib/safe-errors';
import { getMapboxServerToken } from '@/lib/server-secrets';
import type { DirectionsRequest, RouteResponse } from '@/lib/types';
import { isValidCoordinate } from '@/lib/validate-request';

const MAPBOX_PROFILES = {
  driving: 'driving',
  walking: 'walking',
} as const;

interface MapboxManeuver {
  instruction: string;
}

interface MapboxStep {
  maneuver: MapboxManeuver;
  distance: number;
}

interface MapboxLeg {
  steps: MapboxStep[];
}

interface MapboxRoute {
  geometry: GeoJSON.LineString;
  distance: number;
  duration: number;
  legs: MapboxLeg[];
}

interface MapboxDirectionsResponse {
  code: string;
  message?: string;
  routes?: MapboxRoute[];
}

/** Mapbox Directions expects coordinates as lng,lat pairs separated by semicolons. */
function formatMapboxCoordinates(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  waypoints: Array<{ lat: number; lng: number }> = []
): string {
  const points = [origin, ...waypoints, destination];
  return points.map((p) => `${p.lng},${p.lat}`).join(';');
}

// Mapbox Directions allows up to 25 coordinates total (origin + waypoints + destination).
const MAX_WAYPOINTS = 23;

function sanitizeWaypoints(value: unknown): Array<{ lat: number; lng: number }> {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isValidCoordinate)
    .slice(0, MAX_WAYPOINTS)
    .map((p) => ({ lat: p.lat, lng: p.lng }));
}

function isValidMode(mode: unknown): mode is DirectionsRequest['mode'] {
  return mode === 'driving' || mode === 'walking';
}

function getFriendlyError(code: string, _mode: DirectionsRequest['mode']): string {
  if (code === 'NoRoute' || code === 'NoSegment') {
    return 'No driving route found between these cities. Try a different destination.';
  }

  return 'Unable to find a route between these cities. Please try different cities.';
}

export async function POST(request: NextRequest) {
  try {
    const token = getMapboxServerToken();

    if (!token) {
      console.error('Directions not configured: missing Mapbox server token');
      return NextResponse.json({ error: SERVICE_UNAVAILABLE.directions }, { status: 503 });
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

    const { origin, destination, mode, waypoints } = body as Partial<DirectionsRequest>;

    if (!isValidCoordinate(origin) || !isValidCoordinate(destination) || !isValidMode(mode)) {
      return NextResponse.json(
        { error: 'Request must include origin, destination coordinates, and a valid mode.' },
        { status: 400 }
      );
    }

    const profile = MAPBOX_PROFILES[mode];
    const cleanWaypoints = sanitizeWaypoints(waypoints);
    const coordinates = formatMapboxCoordinates(origin, destination, cleanWaypoints);
    const url = new URL(
      `https://api.mapbox.com/directions/v5/mapbox/${profile}/${coordinates}`
    );
    url.searchParams.set('access_token', token);
    url.searchParams.set('geometries', 'geojson');
    url.searchParams.set('steps', 'true');
    url.searchParams.set('overview', 'full');

    const mapboxResponse = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
    });

    if (!mapboxResponse.ok) {
      const text = await mapboxResponse.text();
      console.error(`Mapbox Directions API error ${mapboxResponse.status}:`, text.substring(0, 500));
      return NextResponse.json({ error: 'Directions service unavailable.' }, { status: 502 });
    }

    const mapboxData = (await mapboxResponse.json()) as MapboxDirectionsResponse;

    if (mapboxData.code !== 'Ok' || !mapboxData.routes?.length) {
      const message = getFriendlyError(mapboxData.code ?? 'Unknown', mode);
      return NextResponse.json({ error: message }, { status: 404 });
    }

    const route = mapboxData.routes[0];
    const steps = route.legs.flatMap((leg) =>
      leg.steps.map((step) => ({
        instruction: step.maneuver.instruction,
        distance: formatStepDistance(step.distance),
      }))
    );

    const response: RouteResponse = {
      distance: formatDistance(route.distance),
      duration: formatDuration(route.duration),
      durationSeconds: route.duration,
      distanceMeters: route.distance,
      geometry: route.geometry,
      steps,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Directions route error:', error);
    return NextResponse.json({ error: SERVICE_UNAVAILABLE.directions }, { status: 500 });
  }
}
