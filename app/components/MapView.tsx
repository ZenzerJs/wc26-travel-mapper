'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Map from 'react-map-gl';
import { Compass, Layers, Map as MapIcon, Moon } from 'lucide-react';
import type { MapLayerMouseEvent } from 'mapbox-gl';
import type { MapRef } from 'react-map-gl';
import { MAP_STYLES, POI_COLORS } from '@/lib/constants';
import {
  addMapLayers,
  createMapLayerHandles,
  type MapLayerData,
} from '@/lib/map-layers';
import type { City, GroundRouteMode, MapStyleOption, POICategoryGroup, POIFilter, RoutePOI } from '@/lib/types';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';
const INITIAL_VIEW_STATE = {
  latitude: 40,
  longitude: -100,
  zoom: 3,
};

const POI_CATEGORY_LABELS: Record<POICategoryGroup, string> = {
  food: 'Food',
  arts: 'Arts',
  outdoors: 'Outdoors',
  gas: 'Gas',
  hotels: 'Hotels',
};

// NASA VIIRS Black Marble night lights — free, no auth required, max zoom 8.
const NASA_NIGHT_SOURCE = 'nasa-black-marble';
const NASA_NIGHT_LAYER = 'nasa-black-marble-layer';
const NASA_NIGHT_TILES = [
  'https://map1.vis.earthdata.nasa.gov/wmts-webmercator/VIIRS_Black_Marble/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg',
];

interface MapViewProps {
  origin: City | null;
  destination: City | null;
  routeGeometry: GeoJSON.LineString | null;
  greatCircleGeometry: GeoJSON.LineString | null;
  routeMode: GroundRouteMode;
  mapStyle: MapStyleOption;
  onMapStyleChange: (style: MapStyleOption) => void;
  pois: RoutePOI[];
  selectedStopIds: string[];
  onlySelectedStops: boolean;
  showPoisOnMap: boolean;
  poiFilter: POIFilter;
  focusedPoiId: string | null;
  onFocusedPoiHandled: () => void;
}

export default function MapView({
  origin,
  destination,
  routeGeometry,
  greatCircleGeometry,
  routeMode,
  mapStyle,
  onMapStyleChange,
  pois,
  selectedStopIds,
  onlySelectedStops,
  showPoisOnMap,
  poiFilter,
  focusedPoiId,
  onFocusedPoiHandled,
}: MapViewProps) {
  const mapRef = useRef<MapRef>(null);
  const handlesRef = useRef(createMapLayerHandles());
  const layerDataRef = useRef<MapLayerData | null>(null);
  // Always-current ref so async callbacks (style.load) read the latest value.
  const mapStyleRef = useRef<MapStyleOption>(mapStyle);
  mapStyleRef.current = mapStyle;

  const [openPoiId, setOpenPoiId] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const selectedStopIdSet = useMemo(() => new Set(selectedStopIds), [selectedStopIds]);

  const visiblePois = useMemo(() => {
    if (onlySelectedStops || !showPoisOnMap) {
      return pois.filter((poi) => selectedStopIdSet.has(poi.id));
    }
    if (poiFilter === 'all') return pois;
    return pois.filter(
      (poi) => poi.categoryGroup === poiFilter || selectedStopIdSet.has(poi.id)
    );
  }, [pois, poiFilter, showPoisOnMap, onlySelectedStops, selectedStopIdSet]);

  // ── Route / POI / city layers ──────────────────────────────────────────────
  const syncMapLayers = useCallback(() => {
    const map = mapRef.current?.getMap();
    const layerData = layerDataRef.current;
    if (!map || !layerData || !map.isStyleLoaded()) return;
    addMapLayers(map, layerData, handlesRef.current);
  }, []);

  // ── NASA night lights overlay ──────────────────────────────────────────────
  const applyNightLights = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map || !map.isStyleLoaded()) return;

    if (mapStyleRef.current === 'night') {
      // Add source if missing
      if (!map.getSource(NASA_NIGHT_SOURCE)) {
        map.addSource(NASA_NIGHT_SOURCE, {
          type: 'raster',
          tiles: NASA_NIGHT_TILES,
          tileSize: 256,
          maxzoom: 8,
          attribution: '© NASA VIIRS Black Marble',
        });
      }
      // Insert below the first symbol layer so city labels stay on top
      if (!map.getLayer(NASA_NIGHT_LAYER)) {
        const firstSymbol = map
          .getStyle()
          .layers?.find((l) => l.type === 'symbol')?.id as string | undefined;
        map.addLayer(
          {
            id: NASA_NIGHT_LAYER,
            type: 'raster',
            source: NASA_NIGHT_SOURCE,
            paint: { 'raster-opacity': 1.0 },
          },
          firstSymbol
        );
      }
    } else {
      if (map.getLayer(NASA_NIGHT_LAYER)) map.removeLayer(NASA_NIGHT_LAYER);
      if (map.getSource(NASA_NIGHT_SOURCE)) map.removeSource(NASA_NIGHT_SOURCE);
    }
  }, []);

  // Combined sync: night lights first (base), then route/POI on top
  const syncAll = useCallback(() => {
    applyNightLights();
    syncMapLayers();
  }, [applyNightLights, syncMapLayers]);

  useEffect(() => {
    layerDataRef.current = {
      origin,
      destination,
      routeGeometry,
      greatCircleGeometry,
      routeMode,
      visiblePois,
      selectedStopIds: selectedStopIdSet,
      openPoiId,
      onPoiOpen: setOpenPoiId,
      onPoiClose: () => setOpenPoiId(null),
    };
    syncMapLayers();
  }, [destination, greatCircleGeometry, openPoiId, origin, routeGeometry, routeMode, selectedStopIdSet, syncMapLayers, visiblePois]);

  useEffect(() => {
    if (!focusedPoiId) return;
    const poi = pois.find((item) => item.id === focusedPoiId);
    if (!poi) { onFocusedPoiHandled(); return; }
    const map = mapRef.current?.getMap();
    if (map) map.flyTo({ center: [poi.lng, poi.lat], zoom: 12, duration: 1200 });
    setOpenPoiId(poi.id);
    onFocusedPoiHandled();
  }, [focusedPoiId, onFocusedPoiHandled, pois]);

  const handleMapLoad = useCallback(() => {
    setMapReady(true);
    syncAll();
  }, [syncAll]);

  // Re-apply layers after any style reload (e.g. manual style switch)
  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current?.getMap();
    if (!map) return;
    const onStyleLoad = () => syncAll();
    map.on('style.load', onStyleLoad);
    return () => { map.off('style.load', onStyleLoad); };
  }, [mapReady, syncAll]);

  // When mapStyle prop changes externally (dark mode toggle), push to the map canvas.
  const prevMapStyleRef = useRef<MapStyleOption>(mapStyle);
  useEffect(() => {
    if (!mapReady || mapStyle === prevMapStyleRef.current) return;
    prevMapStyleRef.current = mapStyle;
    const map = mapRef.current?.getMap();
    if (!map) return;
    map.setStyle(MAP_STYLES[mapStyle]);
    map.once('style.load', () => syncAll());
  }, [mapStyle, mapReady, syncAll]);

  const handleStyleToggle = useCallback(
    (style: MapStyleOption) => {
      if (style === mapStyle) return;
      onMapStyleChange(style);
      // The prevMapStyleRef effect handles the actual map.setStyle once the prop updates.
    },
    [mapStyle, onMapStyleChange]
  );

  const handleResetOrientation = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    map.easeTo({ center: [-100, 40], zoom: 3, bearing: 0, pitch: 0, duration: 1000 });
  }, []);

  const handleMapClick = useCallback((event: MapLayerMouseEvent) => {
    event.originalEvent.stopPropagation();
    setOpenPoiId(null);
  }, []);

  if (!MAPBOX_TOKEN) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gray-900 p-6 text-center text-white">
        <p>
          Set <code className="rounded bg-gray-800 px-1">NEXT_PUBLIC_MAPBOX_TOKEN</code> in your
          environment to load the map.
        </p>
      </div>
    );
  }

  const legendGroups: POICategoryGroup[] = ['food', 'arts', 'outdoors', 'gas', 'hotels'];

  return (
    <div className="relative h-full w-full">
      {/* Map controls — compass + style toggle stacked top-right */}
      <div className="absolute right-4 top-4 z-10 flex flex-col gap-2">
        {/* Compass / reset orientation */}
        <button
          type="button"
          onClick={handleResetOrientation}
          title="Reset map view"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/20 bg-black/40 text-white shadow-lg backdrop-blur-md transition-colors hover:bg-black/60 active:scale-95"
        >
          <Compass className="h-4 w-4" strokeWidth={2} />
        </button>

        {/* Style toggle */}
        <div className="flex flex-col overflow-hidden rounded-lg border border-white/20 bg-black/40 shadow-lg backdrop-blur-md">
          <button
            type="button"
            onClick={() => handleStyleToggle('satellite')}
            title="Satellite view"
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
              mapStyle === 'satellite'
                ? 'bg-white/20 text-white'
                : 'text-white/70 hover:bg-white/10 hover:text-white'
            }`}
          >
            <MapIcon className="h-3.5 w-3.5" strokeWidth={2} />
            Satellite
          </button>
          <div className="mx-2 h-px bg-white/10" />
          <button
            type="button"
            onClick={() => handleStyleToggle('streets')}
            title="Streets view"
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
              mapStyle === 'streets'
                ? 'bg-white/20 text-white'
                : 'text-white/70 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Layers className="h-3.5 w-3.5" strokeWidth={2} />
            Streets
          </button>
          <div className="mx-2 h-px bg-white/10" />
          <button
            type="button"
            onClick={() => handleStyleToggle('night')}
            title="Night Earth view — NASA VIIRS Black Marble"
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
              mapStyle === 'night'
                ? 'bg-white/20 text-white'
                : 'text-white/70 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Moon className="h-3.5 w-3.5" strokeWidth={2} />
            Night
          </button>
        </div>
      </div>

      <Map
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        initialViewState={INITIAL_VIEW_STATE}
        mapStyle={MAP_STYLES[mapStyle]}
        style={{ width: '100%', height: '100%' }}
        onClick={handleMapClick}
        onLoad={handleMapLoad}
      />

      {/* POI legend */}
      {mapReady && showPoisOnMap && visiblePois.length > 0 && (
        <div className="pointer-events-none absolute bottom-8 right-4 z-10 rounded-xl border border-white/20 bg-black/50 px-3 py-2 text-xs shadow-xl backdrop-blur-md">
          <p className="mb-1.5 font-semibold tracking-wide text-white/90">Stops</p>
          <div className="flex flex-col gap-1">
            {legendGroups
              .filter((g) => visiblePois.some((p) => p.categoryGroup === g))
              .map((group) => (
                <span key={group} className="flex items-center gap-1.5 text-white/80">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full shadow-[0_0_4px_1px_rgba(0,0,0,0.4)]"
                    style={{ backgroundColor: POI_COLORS[group] }}
                  />
                  {POI_CATEGORY_LABELS[group]}
                </span>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
