'use client';

import { useState } from 'react';
import {
  ArrowRight,
  Car,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  ExternalLink,
  FootprintsIcon,
  Fuel,
  Leaf,
  Link2,
  MapPin,
  Plane,
  RefreshCw,
  Trash2,
  Maximize2,
  Minimize2,
  Moon,
  Navigation,
  Plus,
  Sun,
  X,
} from 'lucide-react';
import Skeleton from '@/app/components/Skeleton';
import { LONG_TRIP_SECONDS, OVERNIGHT_TRIP_SECONDS, POI_CATEGORY_LABELS } from '@/lib/constants';
import { filterPois, formatDistanceFromRoute, groupPoisByCategory } from '@/lib/pois';
import {
  compareCarbon,
  estimateFuelCost,
  formatTimezoneDifference,
  getLocalTime,
  getTimezoneAbbr,
  getTimezoneDifferenceHours,
} from '@/lib/trip-metrics';
import type {
  City,
  FlightResult,
  GroundRouteMode,
  POICategoryGroup,
  POIFilter,
  RoutePOI,
  RouteResponse,
  WeatherData,
} from '@/lib/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RoutePanelProps {
  cities: City[];
  originId: string;
  destinationId: string;
  mode: GroundRouteMode;
  route: RouteResponse | null;
  pois: RoutePOI[];
  flights: FlightResult[];
  isLoadingRoute: boolean;
  isLoadingPois: boolean;
  isLoadingFlights: boolean;
  flightError: string | null;
  error: string | null;
  originWeather: WeatherData | null;
  destWeather: WeatherData | null;
  selectedStops: RoutePOI[];
  isRerouting: boolean;
  stopsError: string | null;
  onlySelectedStops: boolean;
  isDark: boolean;
  showPoisOnMap: boolean;
  poiFilter: POIFilter;
  onToggleStop: (poi: RoutePOI) => void;
  onOnlySelectedStopsChange: (only: boolean) => void;
  onToggleTheme: () => void;
  onOriginChange: (id: string) => void;
  onDestinationChange: (id: string) => void;
  onModeChange: (mode: GroundRouteMode) => void;
  onShowRoute: () => void;
  onRefreshRoute: () => void;
  onClearRoute: () => void;
  onSearchFlights: () => void;
  onShowPoisChange: (show: boolean) => void;
  onPoiFilterChange: (filter: POIFilter) => void;
  onViewPoiOnMap: (poiId: string) => void;
  canShowRoute: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

type PanelSize = 'normal' | 'wide' | 'full';

const PANEL_SIZE_CLASSES: Record<PanelSize, string> = {
  normal: 'w-full max-w-sm',
  wide: 'w-full max-w-xl',
  full: 'w-full max-w-3xl',
};

const FILTER_OPTIONS: Array<{ id: POIFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'food', label: 'Food' },
  { id: 'arts', label: 'Arts' },
  { id: 'outdoors', label: 'Outdoors' },
  { id: 'gas', label: 'Gas' },
  { id: 'hotels', label: 'Hotels' },
];

const POI_CATEGORY_SECTIONS: POICategoryGroup[] = ['food', 'arts', 'outdoors', 'gas'];

const POI_BORDER_COLORS: Record<POICategoryGroup, string> = {
  food: 'border-l-red-400',
  arts: 'border-l-purple-400',
  outdoors: 'border-l-green-500',
  gas: 'border-l-amber-400',
  hotels: 'border-l-indigo-400',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function AddStopButton({
  isSelected,
  onToggle,
}: {
  isSelected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition-all ${
        isSelected
          ? 'bg-emerald-500 text-white hover:bg-emerald-600'
          : 'border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
      }`}
    >
      {isSelected ? (
        <>
          <Check className="h-3 w-3" /> Added
        </>
      ) : (
        <>
          <Plus className="h-3 w-3" /> Add
        </>
      )}
    </button>
  );
}

function PoiCard({
  poi,
  isSelected,
  onToggle,
  onViewOnMap,
}: {
  poi: RoutePOI;
  isSelected: boolean;
  onToggle: (poi: RoutePOI) => void;
  onViewOnMap: (id: string) => void;
}) {
  const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(poi.name)}`;
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${poi.lat},${poi.lng}`;
  const borderColor = POI_BORDER_COLORS[poi.categoryGroup];

  return (
    <li
      className={`group rounded-r-lg border border-l-4 bg-white p-3 text-sm shadow-sm transition-shadow hover:shadow-md dark:bg-slate-800 ${borderColor} ${
        isSelected
          ? 'border-emerald-200 ring-1 ring-emerald-200 dark:border-emerald-700 dark:ring-emerald-700'
          : 'border-gray-100 dark:border-slate-700'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-gray-900 dark:text-slate-100">{poi.name}</p>
          <p className="text-xs text-gray-500 dark:text-slate-400">{poi.category}</p>
          {poi.rating !== undefined && (
            <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">★ {poi.rating.toFixed(1)}</p>
          )}
          <div className="mt-1.5 flex gap-3">
            <a
              href={googleSearchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 underline underline-offset-2 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
            >
              Google it
            </a>
            <a
              href={directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 underline underline-offset-2 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
            >
              Get directions
            </a>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <AddStopButton isSelected={isSelected} onToggle={() => onToggle(poi)} />
          <button
            type="button"
            onClick={() => onViewOnMap(poi.id)}
            className="rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-600 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            <MapPin className="inline h-3 w-3" /> View
          </button>
        </div>
      </div>
    </li>
  );
}

function HotelCard({
  poi,
  isSelected,
  onToggle,
  onViewOnMap,
}: {
  poi: RoutePOI;
  isSelected: boolean;
  onToggle: (poi: RoutePOI) => void;
  onViewOnMap: (id: string) => void;
}) {
  const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(poi.name)}`;
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${poi.lat},${poi.lng}`;

  return (
    <li
      className={`rounded-r-lg border border-l-4 border-l-indigo-400 bg-white p-3 text-sm shadow-sm transition-shadow hover:shadow-md dark:bg-slate-800 ${
        isSelected
          ? 'border-emerald-200 ring-1 ring-emerald-200 dark:border-emerald-700 dark:ring-emerald-700'
          : 'border-indigo-100 dark:border-slate-700'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-gray-900 dark:text-slate-100">{poi.name}</p>
          {poi.rating !== undefined && (
            <p className="text-xs text-amber-600 dark:text-amber-400">★ {poi.rating.toFixed(1)}</p>
          )}
          {poi.distanceFromRoute !== undefined && (
            <p className="text-xs text-gray-500 dark:text-slate-400">{formatDistanceFromRoute(poi.distanceFromRoute)}</p>
          )}
          <div className="mt-1.5 flex gap-3">
            <a
              href={googleSearchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 underline underline-offset-2 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
            >
              Google it
            </a>
            <a
              href={directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 underline underline-offset-2 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
            >
              Get directions
            </a>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <AddStopButton isSelected={isSelected} onToggle={() => onToggle(poi)} />
          <button
            type="button"
            onClick={() => onViewOnMap(poi.id)}
            className="rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-600 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            <MapPin className="inline h-3 w-3" /> View
          </button>
        </div>
      </div>
    </li>
  );
}

function FlightResultCard({
  flight,
  index,
  originIata,
  destIata,
}: {
  flight: FlightResult;
  index: number;
  originIata: string;
  destIata: string;
}) {
  const oym = new Date().toISOString().slice(0, 7).replace('-', '');
  const skyscannerUrl = `https://www.skyscanner.com/transport/flights/${originIata.toLowerCase()}/${destIata.toLowerCase()}/?adults=1&cabinclass=economy&outboundaltsenabled=false&oym=${oym}`;

  const stopsLabel =
    flight.stops === undefined ? null : flight.stops === 0 ? 'Nonstop' : `${flight.stops} stop${flight.stops > 1 ? 's' : ''}`;

  return (
    <li className="rounded-xl border border-blue-100 bg-gradient-to-br from-white to-blue-50/40 p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          {flight.price !== undefined ? (
            <p className="text-2xl font-bold text-gray-900">
              ${flight.price.toLocaleString('en-US')}
              <span className="ml-1 text-sm font-normal text-gray-500">USD</span>
            </p>
          ) : flight.priceLabel ? (
            <p className="text-2xl font-bold text-gray-900">{flight.priceLabel}</p>
          ) : (
            <p className="text-sm font-medium text-gray-400">Price unavailable</p>
          )}
          {flight.airline && (
            <p className="text-sm font-medium text-gray-700">{flight.airline}</p>
          )}
        </div>
        <div className="text-right">
          {flight.duration && (
            <p className="text-sm font-semibold text-gray-800">{flight.duration}</p>
          )}
          {stopsLabel && (
            <p className="text-xs text-gray-500">{stopsLabel}</p>
          )}
        </div>
      </div>

      {(flight.departureTime || flight.arrivalTime) && (
        <p className="mt-1.5 text-xs text-gray-600">
          {flight.departureTime && <span>{flight.departureTime}</span>}
          {flight.departureTime && flight.arrivalTime && (
            <ArrowRight className="mx-1 inline h-3 w-3" />
          )}
          {flight.arrivalTime && <span>{flight.arrivalTime}</span>}
        </p>
      )}

      {!flight.airline && !flight.price && !flight.duration && !flight.departureTime && (
        <p className="text-xs text-gray-400">Flight option {index + 1}</p>
      )}

      <a
        href={skyscannerUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700"
      >
        View on Skyscanner
        <ExternalLink className="h-3 w-3" />
      </a>
    </li>
  );
}

function WeatherChip({ label, city, weather }: { label: string; city?: City; weather: WeatherData | null }) {
  return (
    <div className="flex-1 rounded-xl border border-slate-100 bg-white p-2.5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">{label}</p>
      {city && (
        <p className="truncate text-xs font-semibold text-slate-700 dark:text-slate-300">{city.name}</p>
      )}
      <div className="mt-1 flex items-baseline gap-1.5">
        {weather ? (
          <>
            <span className="text-lg leading-none">{weather.emoji}</span>
            <span className="text-base font-bold text-slate-900 dark:text-slate-100">{weather.tempC}°C</span>
          </>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        )}
      </div>
      {weather && (
        <p className="truncate text-[11px] capitalize text-slate-500 dark:text-slate-400">{weather.description}</p>
      )}
    </div>
  );
}

function TripInsights({
  route,
  mode,
  originCity,
  destCity,
  originWeather,
  destWeather,
}: {
  route: RouteResponse;
  mode: GroundRouteMode;
  originCity?: City;
  destCity?: City;
  originWeather: WeatherData | null;
  destWeather: WeatherData | null;
}) {
  const fuel = mode === 'driving' ? estimateFuelCost(route.distanceMeters) : null;
  const carbon =
    originCity && destCity ? compareCarbon(route.distanceMeters, originCity, destCity) : null;

  const hasWeather = Boolean(originWeather || destWeather);
  const showTimezones = Boolean(
    originCity && destCity && originCity.timezone && destCity.timezone
  );
  const tzDiff =
    originCity && destCity
      ? getTimezoneDifferenceHours(originCity.timezone, destCity.timezone)
      : 0;

  return (
    <div className="space-y-2.5">
      {/* Weather */}
      {hasWeather && (
        <div className="flex gap-2">
          <WeatherChip label="Origin" city={originCity} weather={originWeather} />
          <WeatherChip label="Destination" city={destCity} weather={destWeather} />
        </div>
      )}

      {/* Local times */}
      {showTimezones && originCity && destCity && (
        <div className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
            <Clock className="h-3 w-3" />
            Local time
          </div>
          <div className="flex items-center justify-between text-sm">
            <div>
              <p className="font-bold text-slate-900 dark:text-slate-100">{getLocalTime(originCity.timezone)}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {originCity.name} · {getTimezoneAbbr(originCity.timezone)}
              </p>
            </div>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-300 dark:text-slate-600" />
            <div className="text-right">
              <p className="font-bold text-slate-900 dark:text-slate-100">{getLocalTime(destCity.timezone)}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {destCity.name} · {getTimezoneAbbr(destCity.timezone)}
              </p>
            </div>
          </div>
          {tzDiff !== 0 && (
            <p className="mt-1.5 rounded-md bg-slate-50 px-2 py-1 text-center text-[11px] font-medium text-slate-600 dark:bg-slate-700/50 dark:text-slate-300">
              {destCity.name} is {formatTimezoneDifference(tzDiff)}
            </p>
          )}
        </div>
      )}

      {/* Fuel + Carbon grid */}
      <div className="grid grid-cols-2 gap-2">
        {fuel && (
          <div className="rounded-xl border border-amber-100 bg-gradient-to-br from-white to-amber-50/50 p-3 shadow-sm dark:border-amber-900/40 dark:from-slate-800 dark:to-amber-950/20">
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400">
              <Fuel className="h-3 w-3" />
              Est. fuel
            </div>
            <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{fuel.costLabel}</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {Math.round(fuel.gallons)} gal · 25 MPG
            </p>
          </div>
        )}

        {carbon && (
          <div className={`rounded-xl border border-emerald-100 bg-gradient-to-br from-white to-emerald-50/50 p-3 shadow-sm dark:border-emerald-900/40 dark:from-slate-800 dark:to-emerald-950/20 ${!fuel ? 'col-span-2' : ''}`}>
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
              <Leaf className="h-3 w-3" />
              CO₂ footprint
            </div>
            <div className="flex items-baseline gap-3">
              <div>
                <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{carbon.drivingKg} kg</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Driving</p>
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{carbon.flyingKg} kg</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Flying</p>
              </div>
            </div>
            {carbon.greenerMode !== 'equal' && carbon.flyingSavingsPercent > 0 && (
              <p className="mt-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                {carbon.greenerMode === 'flying' ? 'Flying' : 'Driving'} saves{' '}
                {carbon.flyingSavingsPercent}%
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function RoutePanel({
  cities,
  originId,
  destinationId,
  mode,
  route,
  pois,
  flights,
  isLoadingRoute,
  isLoadingPois,
  isLoadingFlights,
  flightError,
  error,
  originWeather,
  destWeather,
  selectedStops,
  isRerouting,
  stopsError,
  onlySelectedStops,
  isDark,
  showPoisOnMap,
  poiFilter,
  onToggleStop,
  onOnlySelectedStopsChange,
  onToggleTheme,
  onOriginChange,
  onDestinationChange,
  onModeChange,
  onShowRoute,
  onRefreshRoute,
  onClearRoute,
  onSearchFlights,
  onShowPoisChange,
  onPoiFilterChange,
  onViewPoiOnMap,
  canShowRoute,
}: RoutePanelProps) {
  const [stepsOpen, setStepsOpen] = useState(false);
  const [panelSize, setPanelSize] = useState<PanelSize>('normal');
  const [copied, setCopied] = useState(false);
  const [exported, setExported] = useState(false);

  const originCity = cities.find((c) => c.id === originId);
  const destCity = cities.find((c) => c.id === destinationId);

  function cycleSize() {
    setPanelSize((s) => {
      const cycle: PanelSize[] = ['normal', 'wide', 'full'];
      return cycle[(cycle.indexOf(s) + 1) % cycle.length];
    });
  }

  async function handleShare() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: select the URL bar
    }
  }

  function buildItineraryText(): string {
    const lines: string[] = [];
    lines.push('WC26 TRAVEL MAPPER — TRIP ITINERARY');
    lines.push('='.repeat(40));
    lines.push('');
    lines.push(`Route:    ${originCity?.name ?? '?'} → ${destCity?.name ?? '?'}`);
    lines.push(`Mode:     ${mode.charAt(0).toUpperCase() + mode.slice(1)}`);
    if (route) {
      lines.push(`Distance: ${route.distance}`);
      lines.push(`Duration: ${route.duration}`);
    }
    if (originCity && destCity) {
      lines.push('');
      lines.push(`Local time — ${originCity.name}: ${getLocalTime(originCity.timezone)} (${getTimezoneAbbr(originCity.timezone)})`);
      lines.push(`Local time — ${destCity.name}: ${getLocalTime(destCity.timezone)} (${getTimezoneAbbr(destCity.timezone)})`);
    }
    if (route && mode === 'driving') {
      const fuel = estimateFuelCost(route.distanceMeters);
      lines.push('');
      lines.push(`Est. fuel cost: ${fuel.costLabel} (~${Math.round(fuel.gallons)} gallons)`);
    }
    if (route && originCity && destCity) {
      const carbon = compareCarbon(route.distanceMeters, originCity, destCity);
      lines.push(`CO2 — Driving: ${carbon.drivingKg} kg | Flying: ${carbon.flyingKg} kg`);
    }

    if (flights.length > 0) {
      lines.push('');
      lines.push('FLIGHTS');
      lines.push('-'.repeat(40));
      flights.forEach((f, i) => {
        const price = f.price !== undefined ? `$${f.price}` : f.priceLabel ?? 'N/A';
        lines.push(`${i + 1}. ${f.airline ?? 'Flight'} — ${price}${f.duration ? ` · ${f.duration}` : ''}`);
      });
    }

    const allPois = [...groupedPois.food, ...groupedPois.arts, ...groupedPois.outdoors, ...groupedPois.gas];
    if (allPois.length > 0) {
      lines.push('');
      lines.push('STOPS ALONG THE WAY');
      lines.push('-'.repeat(40));
      allPois.forEach((poi) => {
        lines.push(`• ${poi.name} (${poi.category})`);
      });
    }

    if (groupedPois.hotels.length > 0) {
      lines.push('');
      lines.push('HOTELS & LODGING');
      lines.push('-'.repeat(40));
      groupedPois.hotels.forEach((poi) => {
        lines.push(`• ${poi.name}`);
      });
    }

    lines.push('');
    lines.push(`Shareable link: ${typeof window !== 'undefined' ? window.location.href : ''}`);
    return lines.join('\n');
  }

  async function handleExport() {
    try {
      await navigator.clipboard.writeText(buildItineraryText());
      setExported(true);
      setTimeout(() => setExported(false), 2000);
    } catch {
      // ignore clipboard failures
    }
  }

  const filteredPois = filterPois(pois, poiFilter);
  const groupedPois = groupPoisByCategory(filteredPois);
  const selectedStopIds = new Set(selectedStops.map((stop) => stop.id));
  // When "only my stops" is on, restrict the displayed lists to selected stops.
  const displayedPois = onlySelectedStops
    ? filteredPois.filter((poi) => selectedStopIds.has(poi.id))
    : filteredPois;
  const displayGrouped = groupPoisByCategory(displayedPois);
  const visibleFilterOptions = FILTER_OPTIONS.filter(
    (option) => option.id !== 'gas' || mode === 'driving'
  );
  const showFlightSuggestion = Boolean(route && route.durationSeconds > LONG_TRIP_SECONDS);
  const showOvernightHotels = Boolean(route && route.durationSeconds > OVERNIGHT_TRIP_SECONDS);
  const isExpanded = panelSize !== 'normal';

  return (
    <div
      className={`fixed left-4 top-4 z-10 max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl shadow-2xl transition-[max-width] duration-300 md:left-4 md:right-auto md:top-4 max-md:bottom-4 max-md:left-4 max-md:right-4 max-md:top-auto ${PANEL_SIZE_CLASSES[panelSize]}`}
      style={{ scrollbarWidth: 'thin', scrollbarColor: '#334155 transparent' }}
    >
      {/* ── Header ── */}
      <div className="sticky top-0 z-20 rounded-t-2xl bg-[#0A2540] px-4 pb-3 pt-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            {/* WC26 badge */}
            {/* Soccer ball badge */}
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#00A551]">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="9" stroke="white" strokeWidth="1.5"/>
                <path d="M12 3 L12 6 M12 18 L12 21 M3 12 L6 12 M18 12 L21 12" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                <polygon points="12,7 14.5,10 13,13 11,13 9.5,10" fill="white" opacity="0.9"/>
              </svg>
            </div>
            <div className="min-w-0">
              <h1 className="font-display truncate text-base font-bold leading-tight tracking-tight text-white">
                WC26 Travel Mapper
              </h1>
              <p className="text-xs text-blue-300/80">FIFA World Cup 2026</p>
            </div>
          </div>

          {/* Theme + panel controls */}
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={onToggleTheme}
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              className="rounded-lg p-1.5 text-blue-300 transition-colors hover:bg-white/10 hover:text-white"
            >
              {isDark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={cycleSize}
              title={panelSize === 'full' ? 'Collapse panel' : 'Expand panel'}
              className="rounded-lg p-1.5 text-blue-300 transition-colors hover:bg-white/10 hover:text-white"
            >
              {panelSize === 'full' ? (
                <Minimize2 className="h-3.5 w-3.5" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Origin → Destination preview strip */}
        {(originCity || destCity) && (
          <div className="mt-2.5 flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs text-blue-100">
            <span className="truncate max-w-[120px]">{originCity?.name ?? '…'}</span>
            <ArrowRight className="h-3 w-3 shrink-0 text-[#00A551]" />
            <span className="truncate max-w-[120px]">{destCity?.name ?? '…'}</span>
          </div>
        )}
      </div>

      {/* ── Body ── */}
      <div className="rounded-b-2xl bg-slate-50 p-4 dark:bg-slate-900">
        <div className="space-y-3">

          {/* City selects */}
          <div className="grid gap-2.5">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Origin
              </span>
              <select
                value={originId}
                onChange={(e) => onOriginChange(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="">Select origin city</option>
                {cities.map((city) => (
                  <option key={city.id} value={city.id} disabled={city.id === destinationId}>
                    {city.name}, {city.country}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Destination
              </span>
              <select
                value={destinationId}
                onChange={(e) => onDestinationChange(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="">Select destination city</option>
                {cities.map((city) => (
                  <option key={city.id} value={city.id} disabled={city.id === originId}>
                    {city.name}, {city.country}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Mode toggle */}
          <div className="flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => onModeChange('driving')}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-all ${
                mode === 'driving'
                  ? 'bg-emerald-500 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              <Car className="h-4 w-4" />
              Driving
            </button>
            <button
              type="button"
              onClick={() => onModeChange('walking')}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-all ${
                mode === 'walking'
                  ? 'bg-sky-500 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              <FootprintsIcon className="h-4 w-4" />
              Walking
            </button>
          </div>

          {/* Show Route button */}
          <button
            type="button"
            onClick={onShowRoute}
            disabled={!canShowRoute || isLoadingRoute}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-bold text-white shadow-md shadow-emerald-500/25 transition-all hover:bg-emerald-600 hover:shadow-emerald-600/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none dark:disabled:bg-slate-700 dark:disabled:text-slate-500"
          >
            {isLoadingRoute ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Finding route…
              </>
            ) : (
              <>
                Show Route
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>

          {/* Loading skeletons */}
          {isLoadingRoute && (
            <div className="space-y-2">
              <Skeleton className="h-4 w-3/4 rounded-lg" />
              <Skeleton className="h-4 w-1/2 rounded-lg" />
              <Skeleton className="h-20 w-full rounded-lg" />
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
              {error}
            </div>
          )}

          {/* ── Route Results ── */}
          {route && !error && (
            <div className="space-y-3 pt-1">
              {/* Flight suggestion card */}
              {showFlightSuggestion && (
                <div className="overflow-hidden rounded-2xl border border-blue-200 bg-gradient-to-br from-[#0A2540] to-[#1a3a5c]">
                  <div className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-500/20">
                        <Plane className="h-4 w-4 text-blue-300" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white">Consider Flying</p>
                        <p className="text-xs text-blue-300">
                          This route takes {route.duration} by road
                        </p>
                      </div>
                    </div>

                    {!flights.length && !isLoadingFlights && !flightError && (
                      <button
                        type="button"
                        onClick={onSearchFlights}
                        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-blue-500 px-3 py-2.5 text-sm font-bold text-white transition-colors hover:bg-blue-400"
                      >
                        <Plane className="h-4 w-4" />
                        Search Flights
                      </button>
                    )}

                    {isLoadingFlights && (
                      <div className="mt-3 space-y-2">
                        <Skeleton className="h-16 w-full rounded-xl bg-white/10" />
                        <Skeleton className="h-16 w-full rounded-xl bg-white/10" />
                      </div>
                    )}

                    {flightError && (
                      <p className="mt-3 rounded-lg bg-white/10 px-3 py-2 text-xs text-blue-200">
                        {flightError}
                      </p>
                    )}
                  </div>

                  {!isLoadingFlights && flights.length > 0 && (
                    <div className="border-t border-white/10 bg-white/5 px-4 pb-4 pt-3">
                      <ul className="space-y-2">
                        {flights.map((flight, index) => (
                          <FlightResultCard
                            key={`${flight.airline ?? 'flight'}-${index}`}
                            flight={flight}
                            index={index}
                            originIata={originCity?.iata ?? ''}
                            destIata={destCity?.iata ?? ''}
                          />
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Route summary */}
              <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                <div className={`grid gap-3 ${isExpanded ? 'grid-cols-3' : 'grid-cols-2'}`}>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Distance</p>
                    <p className="mt-0.5 text-base font-bold text-slate-900 dark:text-slate-100">{route.distance}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Duration</p>
                    <p className="mt-0.5 text-base font-bold text-slate-900 dark:text-slate-100">{route.duration}</p>
                  </div>
                  {isExpanded && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Mode</p>
                      <p className="mt-0.5 text-base font-bold capitalize text-slate-900 dark:text-slate-100">{mode}</p>
                    </div>
                  )}
                </div>
                {!isExpanded && (
                  <p className="mt-2 text-xs capitalize text-slate-400 dark:text-slate-500">Mode: {mode}</p>
                )}
              </div>

              {/* Your stops — user-added waypoints */}
              {(selectedStops.length > 0 || isRerouting || stopsError) && (
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-3 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                  <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
                    <Navigation className="h-3.5 w-3.5" />
                    Your stops ({selectedStops.length})
                    {isRerouting && (
                      <RefreshCw className="ml-auto h-3 w-3 animate-spin text-emerald-500" />
                    )}
                  </div>

                  {selectedStops.length > 0 ? (
                    <ul className="space-y-1.5">
                      {selectedStops.map((stop, index) => (
                        <li
                          key={stop.id}
                          className="flex items-center gap-2 rounded-lg bg-white px-2.5 py-1.5 text-sm shadow-sm dark:bg-slate-800"
                        >
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-[11px] font-bold text-white">
                            {index + 1}
                          </span>
                          <span className="min-w-0 flex-1 truncate font-medium text-slate-800 dark:text-slate-200">
                            {stop.name}
                          </span>
                          <button
                            type="button"
                            onClick={() => onToggleStop(stop)}
                            title="Remove stop"
                            className="shrink-0 rounded p-0.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/40"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    !stopsError && (
                      <p className="text-xs text-emerald-700/70 dark:text-emerald-400/70">Updating route…</p>
                    )
                  )}

                  {stopsError && (
                    <p className="mt-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs text-red-600 dark:bg-red-950/30 dark:text-red-300">
                      {stopsError}
                    </p>
                  )}

                  {selectedStops.length > 0 && (
                    <p className="mt-2 text-[11px] text-emerald-700/70 dark:text-emerald-400/70">
                      Route updated to pass through your stops in travel order.
                    </p>
                  )}
                </div>
              )}

              {/* Trip insights: weather, fuel, carbon, time zones */}
              <TripInsights
                route={route}
                mode={mode}
                originCity={originCity}
                destCity={destCity}
                originWeather={originWeather}
                destWeather={destWeather}
              />

              {/* Action buttons */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onRefreshRoute}
                  disabled={!canShowRoute || isLoadingRoute}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-600 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:disabled:text-slate-600"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={handleShare}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-semibold shadow-sm transition-all ${
                    copied
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                  }`}
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Link2 className="h-3.5 w-3.5" />
                      Share
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={onClearRoute}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-600 shadow-sm transition-colors hover:bg-red-50 hover:border-red-200 hover:text-red-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-red-900/50 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear
                </button>
              </div>

              {/* Export itinerary */}
              <button
                type="button"
                onClick={handleExport}
                className={`flex w-full items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-semibold shadow-sm transition-all ${
                  exported
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                {exported ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    Itinerary copied to clipboard!
                  </>
                ) : (
                  <>
                    <Download className="h-3.5 w-3.5" />
                    Export trip itinerary
                  </>
                )}
              </button>

              {/* Turn-by-turn */}
              {route.steps.length > 0 && (
                <div>
                  <button
                    type="button"
                    onClick={() => setStepsOpen((o) => !o)}
                    className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    aria-expanded={stepsOpen}
                  >
                    Turn-by-turn directions
                    {stepsOpen ? (
                      <ChevronUp className="h-4 w-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-slate-400" />
                    )}
                  </button>

                  {stepsOpen && (
                    <ol className="mt-1.5 max-h-48 space-y-1.5 overflow-y-auto rounded-xl border border-slate-100 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
                      {route.steps.map((step, index) => (
                        <li key={`${step.instruction}-${index}`} className="text-xs text-slate-600 dark:text-slate-300">
                          <span className="mr-1.5 font-bold text-slate-300 dark:text-slate-600">{index + 1}.</span>
                          {step.instruction}
                          <span className="ml-1 text-slate-400 dark:text-slate-500">({step.distance})</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              )}

              {/* ── POI Section ── */}
              <div className="space-y-2.5 border-t border-slate-100 pt-3 dark:border-slate-700">
                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={showPoisOnMap}
                      onChange={(e) => onShowPoisChange(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-emerald-500 focus:ring-emerald-500 dark:border-slate-600 dark:bg-slate-800"
                    />
                    Show stops along route
                  </label>

                  {/* Only-my-stops toggle — appears once stops are added */}
                  {selectedStops.length > 0 && (
                    <label className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                      <input
                        type="checkbox"
                        checked={onlySelectedStops}
                        onChange={(e) => onOnlySelectedStopsChange(e.target.checked)}
                        className="h-4 w-4 rounded border-emerald-300 text-emerald-500 focus:ring-emerald-500 dark:border-emerald-700 dark:bg-slate-800"
                      />
                      Only show my added stops
                    </label>
                  )}
                </div>

                {/* Filter pills — hidden when only showing selected stops */}
                {!onlySelectedStops && (
                  <div className="flex flex-wrap gap-1.5">
                    {visibleFilterOptions.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => onPoiFilterChange(option.id)}
                        className={`rounded-full px-3 py-1 text-xs font-semibold transition-all ${
                          poiFilter === option.id
                            ? 'bg-[#0A2540] text-white shadow-sm dark:bg-emerald-600'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}

                {/* POI loading */}
                {isLoadingPois && (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-2/3 rounded-lg" />
                    <Skeleton className="h-16 w-full rounded-xl" />
                    <Skeleton className="h-16 w-full rounded-xl" />
                  </div>
                )}

                {/* Empty state */}
                {!isLoadingPois && displayedPois.length === 0 && (
                  <p className="rounded-xl bg-slate-100 px-3 py-3 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    {onlySelectedStops
                      ? 'You have not added any stops in this category yet.'
                      : 'No stops found along this route.'}
                  </p>
                )}

                {/* POI groups */}
                {!isLoadingPois &&
                  POI_CATEGORY_SECTIONS.filter((g) => mode === 'driving' || g !== 'gas').map((group) => {
                    const groupPois = displayGrouped[group];
                    if (groupPois.length === 0) return null;

                    return (
                      <div key={group}>
                        <h3 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                          {POI_CATEGORY_LABELS[group]}
                        </h3>
                        <ul className={`gap-2 ${isExpanded ? 'grid grid-cols-2' : 'space-y-2'}`}>
                          {groupPois.map((poi) => (
                            <PoiCard
                              key={poi.id}
                              poi={poi}
                              isSelected={selectedStopIds.has(poi.id)}
                              onToggle={onToggleStop}
                              onViewOnMap={onViewPoiOnMap}
                            />
                          ))}
                        </ul>
                      </div>
                    );
                  })}

                {/* Hotels */}
                {!isLoadingPois &&
                  displayGrouped.hotels.length > 0 &&
                  (poiFilter === 'all' || poiFilter === 'hotels') && (
                    <div>
                      {showOvernightHotels && (
                        <p className="mb-1 text-xs font-semibold italic text-indigo-500 dark:text-indigo-400">
                          Recommended overnight stops
                        </p>
                      )}
                      <h3 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                        {POI_CATEGORY_LABELS.hotels}
                      </h3>
                      <ul className={`gap-2 ${isExpanded ? 'grid grid-cols-2' : 'space-y-2'}`}>
                        {displayGrouped.hotels.map((poi) => (
                          <HotelCard
                            key={poi.id}
                            poi={poi}
                            isSelected={selectedStopIds.has(poi.id)}
                            onToggle={onToggleStop}
                            onViewOnMap={onViewPoiOnMap}
                          />
                        ))}
                      </ul>
                    </div>
                  )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
