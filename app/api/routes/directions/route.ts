import { NextRequest, NextResponse } from 'next/server';
import { formatDistance, formatDuration, formatStepDistance } from '@/lib/format';
import type { DirectionsRequest, RouteResponse } from '@/lib/types';

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

function getMapboxToken(): string | undefined {
  return (
    process.env.MAPBOX_TOKEN ??
    process.env.MAPBOX_ACCESS_TOKEN ??
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  );
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

function isValidCoordinate(value: unknown): value is { lat: number; lng: number } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const coordinate = value as { lat?: unknown; lng?: unknown };
  return typeof coordinate.lat === 'number' && typeof coordinate.lng === 'number';
}

function isValidMode(mode: unknown): mode is DirectionsRequest['mode'] {
  return mode === 'driving' || mode === 'walking';
}

function getFriendlyError(code: string, mode: DirectionsRequest['mode']): string {
  if (code === 'NoRoute' || code === 'NoSegment') {
    if (mode === 'walking') {
      return 'No walking route found between these cities. Walking across large distances or water may not be possible.';
    }

    return 'No driving route found between these cities. Try a different mode or destination.';
  }

  return 'Unable to find a route between these cities. Please try different cities or mode.';
}

export async function POST(request: NextRequest) {
  try {
    const token = getMapboxToken();

    if (!token) {
      return NextResponse.json(
        { error: 'Mapbox access token is not configured on the server.' },
        { status: 500 }
      );
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
      return NextResponse.json(
        { error: `External API failed: ${mapboxResponse.status}` },
        { status: 502 }
      );
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
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
