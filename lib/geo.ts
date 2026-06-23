import type { City } from './types';

/** Generate a great-circle arc between two cities as a GeoJSON LineString. */
export function buildGreatCircleLine(
  origin: City,
  destination: City,
  numPoints = 100
): GeoJSON.Feature<GeoJSON.LineString> {
  const coordinates: [number, number][] = [];

  for (let i = 0; i <= numPoints; i++) {
    const fraction = i / numPoints;
    coordinates.push(interpolateGreatCircle(origin, destination, fraction));
  }

  return {
    type: 'Feature',
    properties: {
      originId: origin.id,
      destinationId: destination.id,
    },
    geometry: {
      type: 'LineString',
      coordinates,
    },
  };
}

function interpolateGreatCircle(
  origin: City,
  destination: City,
  fraction: number
): [number, number] {
  const lat1 = toRadians(origin.lat);
  const lng1 = toRadians(origin.lng);
  const lat2 = toRadians(destination.lat);
  const lng2 = toRadians(destination.lng);

  const d =
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin((lat2 - lat1) / 2) ** 2 +
          Math.cos(lat1) * Math.cos(lat2) * Math.sin((lng2 - lng1) / 2) ** 2
      )
    );

  if (d === 0) {
    return [origin.lng, origin.lat];
  }

  const a = Math.sin((1 - fraction) * d) / Math.sin(d);
  const b = Math.sin(fraction * d) / Math.sin(d);

  const x = a * Math.cos(lat1) * Math.cos(lng1) + b * Math.cos(lat2) * Math.cos(lng2);
  const y = a * Math.cos(lat1) * Math.sin(lng1) + b * Math.cos(lat2) * Math.sin(lng2);
  const z = a * Math.sin(lat1) + b * Math.sin(lat2);

  const lat = Math.atan2(z, Math.sqrt(x * x + y * y));
  const lng = Math.atan2(y, x);

  return [toDegrees(lng), toDegrees(lat)];
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

export function haversineMeters(from: [number, number], to: [number, number]): number {
  const earthRadiusM = 6371000;
  const lat1 = toRadians(from[1]);
  const lat2 = toRadians(to[1]);
  const deltaLat = toRadians(to[1] - from[1]);
  const deltaLng = toRadians(to[0] - from[0]);

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;

  return 2 * earthRadiusM * Math.asin(Math.sqrt(a));
}

/** Sample points along a route polyline at fixed km intervals (lng/lat pairs). */
export function sampleRouteEveryKm(
  geometry: GeoJSON.LineString,
  intervalKm: number
): Array<{ lat: number; lng: number }> {
  const intervalM = intervalKm * 1000;
  const coords = geometry.coordinates as [number, number][];

  if (coords.length === 0) {
    return [];
  }

  if (coords.length === 1) {
    return [{ lng: coords[0][0], lat: coords[0][1] }];
  }

  const samples: Array<{ lat: number; lng: number }> = [];
  let cumulative = 0;
  let nextSampleAt = 0;

  const start = coords[0];
  samples.push({ lng: start[0], lat: start[1] });
  nextSampleAt = intervalM;

  for (let i = 1; i < coords.length; i++) {
    const prev = coords[i - 1];
    const curr = coords[i];
    const segmentLen = haversineMeters(prev, curr);
    const segmentStart = cumulative;
    cumulative += segmentLen;

    while (nextSampleAt <= cumulative) {
      const intoSegment = nextSampleAt - segmentStart;
      const t = segmentLen === 0 ? 0 : intoSegment / segmentLen;
      const lng = prev[0] + t * (curr[0] - prev[0]);
      const lat = prev[1] + t * (curr[1] - prev[1]);
      samples.push({ lng, lat });
      nextSampleAt += intervalM;
    }
  }

  return samples;
}

/** Total polyline length in kilometres. */
export function routeLengthKm(geometry: GeoJSON.LineString): number {
  const coords = geometry.coordinates as [number, number][];
  if (coords.length < 2) return 0;

  let totalM = 0;
  for (let i = 1; i < coords.length; i++) {
    totalM += haversineMeters(coords[i - 1], coords[i]);
  }
  return totalM / 1000;
}

/** Pick `count` items spread evenly across the full array (includes first and last). */
export function pickEvenlySpaced<T>(items: T[], count: number): T[] {
  if (items.length === 0 || count <= 0) return [];
  if (items.length <= count) return items;
  if (count === 1) return [items[0]];

  const picked: T[] = [];
  for (let i = 0; i < count; i++) {
    const index = Math.round((i / (count - 1)) * (items.length - 1));
    picked.push(items[index]);
  }
  return picked;
}

function haversineMetersBetweenPoints(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  return haversineMeters([lng1, lat1], [lng2, lat2]);
}

function distancePointToSegmentMeters(
  point: { lat: number; lng: number },
  start: [number, number],
  end: [number, number]
): number {
  const [x1, y1] = start;
  const [x2, y2] = end;
  const px = point.lng;
  const py = point.lat;

  const dx = x2 - x1;
  const dy = y2 - y1;

  if (dx === 0 && dy === 0) {
    return haversineMetersBetweenPoints(py, px, y1, x1);
  }

  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  const closestLng = x1 + t * dx;
  const closestLat = y1 + t * dy;

  return haversineMetersBetweenPoints(py, px, closestLat, closestLng);
}

/**
 * Index of the route vertex closest to a point. Used to order user-selected
 * waypoints in the direction of travel along the (base) route geometry.
 */
export function nearestRouteIndex(
  point: { lat: number; lng: number },
  geometry: GeoJSON.LineString
): number {
  const coords = geometry.coordinates as [number, number][];
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let i = 0; i < coords.length; i++) {
    const distance = haversineMeters([point.lng, point.lat], coords[i]);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
    }
  }

  return bestIndex;
}

/** Minimum distance in meters from a point to a route polyline. */
export function distanceToRouteMeters(
  point: { lat: number; lng: number },
  geometry: GeoJSON.LineString
): number {
  const coords = geometry.coordinates as [number, number][];

  if (coords.length === 0) {
    return 0;
  }

  if (coords.length === 1) {
    return haversineMetersBetweenPoints(point.lat, point.lng, coords[0][1], coords[0][0]);
  }

  let minDistance = Number.POSITIVE_INFINITY;

  for (let i = 1; i < coords.length; i++) {
    const segmentDistance = distancePointToSegmentMeters(point, coords[i - 1], coords[i]);
    minDistance = Math.min(minDistance, segmentDistance);
  }

  return minDistance;
}

/** Great-circle distance in kilometres between two lat/lng points. */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const x =
    sinDLat * sinDLat +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      sinDLng *
      sinDLng;
  return 2 * R * Math.asin(Math.sqrt(x));
}
