'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import RoutePanel from '@/app/components/RoutePanel';
import { getCityById, getHostCities } from '@/lib/cities';
import { fetchDirections } from '@/lib/directions';
import { fetchFlights } from '@/lib/flights';
import { buildGreatCircleLine, nearestRouteIndex } from '@/lib/geo';
import { discoverPoisAlongRoute } from '@/lib/pois';
import { fetchWeather } from '@/lib/weather';
import type {
  City,
  FlightResult,
  GroundRouteMode,
  MapStyleOption,
  POIFilter,
  RoutePOI,
  RouteResponse,
  WeatherData,
} from '@/lib/types';

const MapView = dynamic(() => import('@/app/components/MapView'), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-gray-900" />,
});

export default function HomePage() {
  const [cities, setCities] = useState<City[]>([]);
  const [originId, setOriginId] = useState('');
  const [destinationId, setDestinationId] = useState('');
  const [mode, setMode] = useState<GroundRouteMode>('driving');
  const [mapStyle, setMapStyle] = useState<MapStyleOption>('satellite');
  const [activeOrigin, setActiveOrigin] = useState<City | null>(null);
  const [activeDestination, setActiveDestination] = useState<City | null>(null);
  const [route, setRoute] = useState<RouteResponse | null>(null);
  const [pois, setPois] = useState<RoutePOI[]>([]);
  const [flights, setFlights] = useState<FlightResult[]>([]);
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);
  const [isLoadingPois, setIsLoadingPois] = useState(false);
  const [isLoadingFlights, setIsLoadingFlights] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flightError, setFlightError] = useState<string | null>(null);
  const [showPoisOnMap, setShowPoisOnMap] = useState(true);
  const [poiFilter, setPoiFilter] = useState<POIFilter>('all');
  const [focusedPoiId, setFocusedPoiId] = useState<string | null>(null);
  const [originWeather, setOriginWeather] = useState<WeatherData | null>(null);
  const [destWeather, setDestWeather] = useState<WeatherData | null>(null);
  const [selectedStops, setSelectedStops] = useState<RoutePOI[]>([]);
  const [isRerouting, setIsRerouting] = useState(false);
  const [stopsError, setStopsError] = useState<string | null>(null);
  const [onlySelectedStops, setOnlySelectedStops] = useState(false);
  const [isDark, setIsDark] = useState(false);

  // Tracks pending auto-load from URL params
  const [pendingAutoLoad, setPendingAutoLoad] = useState(false);
  const autoLoadInitialized = useRef(false);
  // Base origin→destination geometry (no waypoints), used to order selected stops.
  const baseGeometryRef = useRef<GeoJSON.LineString | null>(null);

  // ── Load cities ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function loadCities() {
      try {
        const loaded = await getHostCities();
        if (!cancelled) setCities(loaded);
      } catch (e) {
        console.error('Failed to load host cities:', e);
      }
    }
    void loadCities();
    return () => { cancelled = true; };
  }, []);

  // ── Theme: read stored/system preference on mount ─────────────────────────
  useEffect(() => {
    // Default to light; only go dark when the user has explicitly chosen it.
    const dark = localStorage.getItem('wc26-theme') === 'dark';
    setIsDark(dark);
    document.documentElement.classList.toggle('dark', dark);
    if (dark) setMapStyle('night');
  }, []);

  const handleToggleTheme = useCallback(() => {
    setIsDark((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle('dark', next);
      localStorage.setItem('wc26-theme', next ? 'dark' : 'light');
      // Keep map in sync: dark → night, light → satellite (unless on streets)
      setMapStyle((cur) => {
        if (next) return cur === 'streets' ? cur : 'night';
        return cur === 'night' ? 'satellite' : cur;
      });
      return next;
    });
  }, []);

  // ── Parse URL params on mount ─────────────────────────────────────────────
  useEffect(() => {
    if (autoLoadInitialized.current) return;
    autoLoadInitialized.current = true;
    const params = new URLSearchParams(window.location.search);
    const urlOrigin = params.get('origin');
    const urlDest = params.get('destination');
    const urlMode = params.get('mode');
    if (urlOrigin && urlDest && (urlMode === 'driving' || urlMode === 'walking')) {
      setOriginId(urlOrigin);
      setDestinationId(urlDest);
      setMode(urlMode as GroundRouteMode);
      setPendingAutoLoad(true);
    }
  }, []);

  // ── Auto-trigger route once cities are loaded ─────────────────────────────
  useEffect(() => {
    if (!pendingAutoLoad || cities.length === 0) return;
    const origin = getCityById(cities, originId);
    const dest = getCityById(cities, destinationId);
    if (!origin || !dest) return;
    setPendingAutoLoad(false);
    // loadRouteData reads from state; state is already set by the mount effect
    // We use a timeout so the state is settled before the load fires
    const timer = setTimeout(() => {
      void loadRouteDataInternal(originId, destinationId, mode, cities);
    }, 50);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAutoLoad, cities]);

  // ── Gas filter cleanup ────────────────────────────────────────────────────
  useEffect(() => {
    if (mode === 'walking' && poiFilter === 'gas') setPoiFilter('all');
  }, [mode, poiFilter]);

  const canShowRoute = useMemo(
    () => Boolean(originId && destinationId && originId !== destinationId),
    [originId, destinationId]
  );

  const previewOrigin = useMemo(
    () => getCityById(cities, originId) ?? activeOrigin,
    [activeOrigin, cities, originId]
  );

  const previewDestination = useMemo(
    () => getCityById(cities, destinationId) ?? activeDestination,
    [activeDestination, cities, destinationId]
  );

  const greatCircleGeometry = useMemo(() => {
    if (route?.geometry || !previewOrigin || !previewDestination) return null;
    if (previewOrigin.id === previewDestination.id) return null;
    return buildGreatCircleLine(previewOrigin, previewDestination).geometry;
  }, [previewDestination, previewOrigin, route?.geometry]);

  // ── Core route loader (accepts explicit params for auto-load) ─────────────
  const loadRouteDataInternal = useCallback(
    async (
      oId: string,
      dId: string,
      routeMode: GroundRouteMode,
      cityList: City[]
    ) => {
      const origin = getCityById(cityList, oId);
      const destination = getCityById(cityList, dId);
      if (!origin || !destination || origin.id === destination.id) return;

      setActiveOrigin(origin);
      setActiveDestination(destination);
      setIsLoadingRoute(true);
      setIsLoadingPois(false);
      setError(null);
      setFlightError(null);
      setFlights([]);
      setRoute(null);
      setPois([]);
      setFocusedPoiId(null);
      setOriginWeather(null);
      setDestWeather(null);
      setSelectedStops([]);
      setStopsError(null);
      setOnlySelectedStops(false);
      baseGeometryRef.current = null;

      // Sync shareable URL
      const urlParams = new URLSearchParams({ origin: oId, destination: dId, mode: routeMode });
      window.history.replaceState({}, '', `?${urlParams.toString()}`);

      // Fetch weather for both endpoints in parallel (non-blocking, degrades gracefully)
      void fetchWeather(origin.lat, origin.lng).then(setOriginWeather);
      void fetchWeather(destination.lat, destination.lng).then(setDestWeather);

      try {
        const directions = await fetchDirections({
          origin: { lat: origin.lat, lng: origin.lng },
          destination: { lat: destination.lat, lng: destination.lng },
          mode: routeMode,
        });
        setRoute(directions);
        baseGeometryRef.current = directions.geometry;
        setIsLoadingRoute(false);
        setIsLoadingPois(true);

        try {
          const discoveredPois = await discoverPoisAlongRoute(directions.geometry, routeMode);
          setPois(discoveredPois);
        } catch (poiError) {
          console.error('Failed to load POIs:', poiError);
        } finally {
          setIsLoadingPois(false);
        }
      } catch (fetchError) {
        setRoute(null);
        setPois([]);
        setError(fetchError instanceof Error ? fetchError.message : 'Unable to fetch directions.');
        setIsLoadingRoute(false);
        setIsLoadingPois(false);
      }
    },
    []
  );

  const loadRouteData = useCallback(() => {
    void loadRouteDataInternal(originId, destinationId, mode, cities);
  }, [cities, destinationId, loadRouteDataInternal, mode, originId]);

  // ── Re-route through the user's selected stops (ordered along the base route) ──
  const rerouteWithStops = useCallback(
    async (stops: RoutePOI[]) => {
      if (!activeOrigin || !activeDestination) return;

      // No stops → restore the plain origin→destination route from base geometry.
      const baseGeometry = baseGeometryRef.current;
      const orderedStops =
        baseGeometry && stops.length > 1
          ? [...stops].sort(
              (a, b) =>
                nearestRouteIndex({ lat: a.lat, lng: a.lng }, baseGeometry) -
                nearestRouteIndex({ lat: b.lat, lng: b.lng }, baseGeometry)
            )
          : stops;

      setIsRerouting(true);
      setStopsError(null);

      try {
        const directions = await fetchDirections({
          origin: { lat: activeOrigin.lat, lng: activeOrigin.lng },
          destination: { lat: activeDestination.lat, lng: activeDestination.lng },
          mode,
          waypoints: orderedStops.map((stop) => ({ lat: stop.lat, lng: stop.lng })),
        });
        setRoute(directions);
      } catch (err) {
        console.error('Failed to reroute through stops:', err);
        setStopsError(
          err instanceof Error
            ? 'Could not route through that stop. It may be unreachable by this mode.'
            : 'Could not update the route.'
        );
      } finally {
        setIsRerouting(false);
      }
    },
    [activeDestination, activeOrigin, mode]
  );

  const handleToggleStop = useCallback(
    (poi: RoutePOI) => {
      setSelectedStops((current) => {
        const exists = current.some((stop) => stop.id === poi.id);
        const next = exists
          ? current.filter((stop) => stop.id !== poi.id)
          : [...current, poi];
        // If the user clears their last stop, drop the "only my stops" filter.
        if (next.length === 0) setOnlySelectedStops(false);
        void rerouteWithStops(next);
        return next;
      });
    },
    [rerouteWithStops]
  );

  const handleClearRoute = useCallback(() => {
    setActiveOrigin(null);
    setActiveDestination(null);
    setRoute(null);
    setPois([]);
    setFlights([]);
    setError(null);
    setFlightError(null);
    setFocusedPoiId(null);
    setPoiFilter('all');
    setShowPoisOnMap(true);
    setOriginWeather(null);
    setDestWeather(null);
    setSelectedStops([]);
    setStopsError(null);
    setOnlySelectedStops(false);
    baseGeometryRef.current = null;
    window.history.replaceState({}, '', window.location.pathname);
  }, []);

  const handleSearchFlights = useCallback(async () => {
    if (!activeOrigin || !activeDestination) return;
    setIsLoadingFlights(true);
    setFlightError(null);
    setFlights([]);
    try {
      const response = await fetchFlights({
        originIata: activeOrigin.iata,
        destinationIata: activeDestination.iata,
      });
      setFlights(response.flights);
    } catch (err) {
      setFlights([]);
      setFlightError(
        err instanceof Error ? err.message : 'Flight search unavailable. Try Google Flights directly.'
      );
    } finally {
      setIsLoadingFlights(false);
    }
  }, [activeDestination, activeOrigin]);

  return (
    <main className="relative h-screen w-screen overflow-hidden">
      <RoutePanel
        cities={cities}
        originId={originId}
        destinationId={destinationId}
        mode={mode}
        route={route}
        pois={pois}
        flights={flights}
        isLoadingRoute={isLoadingRoute}
        isLoadingPois={isLoadingPois}
        isLoadingFlights={isLoadingFlights}
        flightError={flightError}
        error={error}
        originWeather={originWeather}
        destWeather={destWeather}
        selectedStops={selectedStops}
        isRerouting={isRerouting}
        stopsError={stopsError}
        onlySelectedStops={onlySelectedStops}
        isDark={isDark}
        showPoisOnMap={showPoisOnMap}
        poiFilter={poiFilter}
        onToggleStop={handleToggleStop}
        onOnlySelectedStopsChange={setOnlySelectedStops}
        onToggleTheme={handleToggleTheme}
        onOriginChange={setOriginId}
        onDestinationChange={setDestinationId}
        onModeChange={setMode}
        onShowRoute={loadRouteData}
        onRefreshRoute={loadRouteData}
        onClearRoute={handleClearRoute}
        onSearchFlights={() => { void handleSearchFlights(); }}
        onShowPoisChange={setShowPoisOnMap}
        onPoiFilterChange={setPoiFilter}
        onViewPoiOnMap={setFocusedPoiId}
        canShowRoute={canShowRoute}
      />
      <div className="absolute inset-0">
        <MapView
          origin={activeOrigin ?? previewOrigin}
          destination={activeDestination ?? previewDestination}
          routeGeometry={route?.geometry ?? null}
          greatCircleGeometry={greatCircleGeometry}
          routeMode={mode}
          mapStyle={mapStyle}
          onMapStyleChange={setMapStyle}
          pois={pois}
          selectedStopIds={selectedStops.map((stop) => stop.id)}
          onlySelectedStops={onlySelectedStops}
          showPoisOnMap={showPoisOnMap}
          poiFilter={poiFilter}
          focusedPoiId={focusedPoiId}
          onFocusedPoiHandled={() => setFocusedPoiId(null)}
        />
      </div>
    </main>
  );
}
