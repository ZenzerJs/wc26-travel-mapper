import { haversineMeters } from '@/lib/geo';
import type { City } from '@/lib/types';

const METERS_PER_MILE = 1609.344;

// Fuel assumptions (US averages)
const AVG_MPG = 25;
const AVG_GAS_PRICE_USD = 3.5;

// EPA-derived emission factors (kg CO2 per mile)
const DRIVING_CO2_PER_MILE = 0.4;
const FLYING_CO2_PER_MILE = 0.25;

export function metersToMiles(meters: number): number {
  return meters / METERS_PER_MILE;
}

/** Estimate fuel cost for a driving route. */
export interface FuelEstimate {
  gallons: number;
  costUsd: number;
  costLabel: string;
}

export function estimateFuelCost(distanceMeters: number): FuelEstimate {
  const miles = metersToMiles(distanceMeters);
  const gallons = miles / AVG_MPG;
  const costUsd = gallons * AVG_GAS_PRICE_USD;
  return {
    gallons,
    costUsd,
    costLabel: `~$${Math.round(costUsd).toLocaleString('en-US')}`,
  };
}

/** Compare CO2 emissions: driving the road route vs flying the straight-line distance. */
export interface CarbonComparison {
  drivingKg: number;
  flyingKg: number;
  /** 0–100, how much less CO2 flying produces vs driving (positive means flying is greener). */
  flyingSavingsPercent: number;
  greenerMode: 'driving' | 'flying' | 'equal';
}

export function compareCarbon(
  drivingDistanceMeters: number,
  origin: City,
  destination: City
): CarbonComparison {
  const drivingMiles = metersToMiles(drivingDistanceMeters);
  const flyingMeters = haversineMeters(
    [origin.lng, origin.lat],
    [destination.lng, destination.lat]
  );
  const flyingMiles = metersToMiles(flyingMeters);

  const drivingKg = drivingMiles * DRIVING_CO2_PER_MILE;
  const flyingKg = flyingMiles * FLYING_CO2_PER_MILE;

  let greenerMode: CarbonComparison['greenerMode'] = 'equal';
  if (drivingKg < flyingKg * 0.98) greenerMode = 'driving';
  else if (flyingKg < drivingKg * 0.98) greenerMode = 'flying';

  const higher = Math.max(drivingKg, flyingKg);
  const lower = Math.min(drivingKg, flyingKg);
  const flyingSavingsPercent = higher === 0 ? 0 : Math.round(((higher - lower) / higher) * 100);

  return {
    drivingKg: Math.round(drivingKg),
    flyingKg: Math.round(flyingKg),
    flyingSavingsPercent,
    greenerMode,
  };
}

/** Get the current local time at a city's timezone, e.g. "2:45 PM". */
export function getLocalTime(timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: timezone,
    }).format(new Date());
  } catch {
    return '—';
  }
}

/** Short timezone abbreviation, e.g. "PST", "EST". */
export function getTimezoneAbbr(timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'short',
    }).formatToParts(new Date());
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
  } catch {
    return '';
  }
}

/** Hour offset of destination relative to origin (e.g. -3 means dest is 3h behind). */
export function getTimezoneDifferenceHours(originTz: string, destTz: string): number {
  try {
    const now = new Date();
    const originOffset = getUtcOffsetMinutes(now, originTz);
    const destOffset = getUtcOffsetMinutes(now, destTz);
    return Math.round((destOffset - originOffset) / 60);
  } catch {
    return 0;
  }
}

function getUtcOffsetMinutes(date: Date, timezone: string): number {
  const tzString = date.toLocaleString('en-US', { timeZone: timezone });
  const utcString = date.toLocaleString('en-US', { timeZone: 'UTC' });
  const tzDate = new Date(tzString);
  const utcDate = new Date(utcString);
  return (tzDate.getTime() - utcDate.getTime()) / 60000;
}

export function formatTimezoneDifference(hours: number): string {
  if (hours === 0) return 'Same time zone';
  const abs = Math.abs(hours);
  const dir = hours > 0 ? 'ahead' : 'behind';
  return `${abs}h ${dir}`;
}
