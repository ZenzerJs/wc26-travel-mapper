import type { GeoJSONSource, Map as MapboxMap, Marker, Popup } from 'mapbox-gl';
import mapboxgl from 'mapbox-gl';
import { POI_COLORS } from '@/lib/constants';
import { escapeHtml } from '@/lib/escape-html';
import type { City, GroundRouteMode, RoutePOI } from '@/lib/types';

const ROUTE_SOURCE_ID = 'wc26-directions-route';
const ROUTE_LAYER_ID = 'wc26-directions-route-line';
const GREAT_CIRCLE_SOURCE_ID = 'wc26-great-circle-route';
const GREAT_CIRCLE_LAYER_ID = 'wc26-great-circle-route-line';

const ROUTE_COLORS: Record<GroundRouteMode, string> = {
  driving: '#3b82f6',
};

const COARSE_POINTER =
  typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

export interface MapLayerData {
  origin: City | null;
  destination: City | null;
  routeGeometry: GeoJSON.LineString | null;
  greatCircleGeometry: GeoJSON.LineString | null;
  routeMode: GroundRouteMode;
  visiblePois: RoutePOI[];
  selectedStopIds: Set<string>;
  onPoiOpen: (poiId: string) => void;
  onPoiClose: () => void;
}

export interface MapLayerHandles {
  cityMarkers: Marker[];
  cityPopups: Popup[];
  poiById: Map<string, { marker: Marker; popup: Popup }>;
}

function removeLayerAndSource(map: MapboxMap, layerId: string, sourceId: string): void {
  if (map.getLayer(layerId)) {
    map.removeLayer(layerId);
  }

  if (map.getSource(sourceId)) {
    map.removeSource(sourceId);
  }
}

function setLineLayer(
  map: MapboxMap,
  sourceId: string,
  layerId: string,
  geometry: GeoJSON.LineString,
  color: string,
  width: number
): void {
  const existing = map.getSource(sourceId) as GeoJSONSource | undefined;
  if (existing) {
    existing.setData({
      type: 'Feature',
      properties: {},
      geometry,
    });
    if (map.getLayer(layerId)) {
      map.setPaintProperty(layerId, 'line-color', color);
      map.setPaintProperty(layerId, 'line-width', width);
    }
    return;
  }

  map.addSource(sourceId, {
    type: 'geojson',
    data: {
      type: 'Feature',
      properties: {},
      geometry,
    },
  });

  map.addLayer({
    id: layerId,
    type: 'line',
    source: sourceId,
    layout: {
      'line-cap': 'round',
      'line-join': 'round',
    },
    paint: {
      'line-color': color,
      'line-width': width,
    },
  });
}

function createCityMarker(
  map: MapboxMap,
  city: City,
  color: string,
  handles: MapLayerHandles
): void {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = 'cursor-pointer border-none bg-transparent p-0';
  element.setAttribute('aria-label', `${city.name} marker`);

  const dot = document.createElement('span');
  dot.className = 'block h-4 w-4 rounded-full border-2 border-white shadow-md';
  dot.style.backgroundColor = color;
  element.appendChild(dot);

  const popup = new mapboxgl.Popup({ offset: 12, closeOnClick: false }).setHTML(
    `<div class="min-w-[140px]"><p class="font-semibold text-gray-900">${escapeHtml(city.name)}</p><p class="text-sm text-gray-600">${escapeHtml(city.stadium)}</p></div>`
  );

  element.addEventListener('click', (event) => {
    event.stopPropagation();
    popup.setLngLat([city.lng, city.lat]).addTo(map);
  });

  const marker = new mapboxgl.Marker({ element, anchor: 'bottom' })
    .setLngLat([city.lng, city.lat])
    .addTo(map);

  handles.cityMarkers.push(marker);
  handles.cityPopups.push(popup);
}

function createPoiMarker(
  map: MapboxMap,
  poi: RoutePOI,
  isSelected: boolean,
  onOpen: (poiId: string) => void,
  onClose: () => void,
  handles: MapLayerHandles
): void {
  const color = POI_COLORS[poi.categoryGroup];
  const element = document.createElement('button');
  element.type = 'button';
  element.className = 'cursor-pointer border-none bg-transparent p-0';
  element.setAttribute('aria-label', `${poi.name} POI marker`);

  const dot = document.createElement('span');
  if (isSelected) {
    dot.className = 'block h-4 w-4 rounded-full border-2 border-white shadow-lg ring-2';
    dot.style.backgroundColor = color;
    dot.style.setProperty('--tw-ring-color', color);
  } else {
    dot.className = 'block h-3 w-3 rounded-full border border-white shadow-md';
    dot.style.backgroundColor = color;
  }
  element.appendChild(dot);

  const selectedNote = isSelected
    ? '<p class="text-xs font-medium text-emerald-600">✓ On your route</p>'
    : '';
  const popup = new mapboxgl.Popup({ offset: 8, closeOnClick: false }).setHTML(
    `<div class="min-w-[140px]"><p class="font-semibold text-gray-900">${escapeHtml(poi.name)}</p><p class="text-sm text-gray-600">${escapeHtml(poi.category)}</p>${selectedNote}</div>`
  );

  popup.on('close', () => {
    onClose();
  });

  const showPopup = () => {
    popup.setLngLat([poi.lng, poi.lat]).addTo(map);
  };

  if (!COARSE_POINTER) {
    element.addEventListener('mouseenter', showPopup);
  }

  element.addEventListener('click', (event) => {
    event.stopPropagation();
    onOpen(poi.id);
    showPopup();
  });

  const marker = new mapboxgl.Marker({ element, anchor: 'center' })
    .setLngLat([poi.lng, poi.lat])
    .addTo(map);

  handles.poiById.set(poi.id, { marker, popup });
}

function clearCityMarkers(handles: MapLayerHandles): void {
  handles.cityMarkers.forEach((marker) => marker.remove());
  handles.cityPopups.forEach((popup) => popup.remove());
  handles.cityMarkers = [];
  handles.cityPopups = [];
}

function clearPoiMarkers(handles: MapLayerHandles): void {
  handles.poiById.forEach((entry) => {
    entry.popup.remove();
    entry.marker.remove();
  });
  handles.poiById.clear();
}

export function clearMapLayers(map: MapboxMap, handles: MapLayerHandles): void {
  clearCityMarkers(handles);
  clearPoiMarkers(handles);
  removeLayerAndSource(map, ROUTE_LAYER_ID, ROUTE_SOURCE_ID);
  removeLayerAndSource(map, GREAT_CIRCLE_LAYER_ID, GREAT_CIRCLE_SOURCE_ID);
}

function syncPoiMarkers(map: MapboxMap, data: MapLayerData, handles: MapLayerHandles): void {
  const nextIds = new Set(data.visiblePois.map((poi) => poi.id));

  const toRemove: string[] = [];
  handles.poiById.forEach((entry, id) => {
    if (!nextIds.has(id)) {
      entry.popup.remove();
      entry.marker.remove();
      toRemove.push(id);
    }
  });
  toRemove.forEach((id) => handles.poiById.delete(id));

  for (const poi of data.visiblePois) {
    const existing = handles.poiById.get(poi.id);
    const isSelected = data.selectedStopIds.has(poi.id);

    if (existing) {
      const el = existing.marker.getElement().querySelector('span');
      if (el) {
        if (isSelected) {
          el.className = 'block h-4 w-4 rounded-full border-2 border-white shadow-lg ring-2';
          el.style.setProperty('--tw-ring-color', POI_COLORS[poi.categoryGroup]);
        } else {
          el.className = 'block h-3 w-3 rounded-full border border-white shadow-md';
        }
        (el as HTMLElement).style.backgroundColor = POI_COLORS[poi.categoryGroup];
      }
      continue;
    }

    createPoiMarker(map, poi, isSelected, data.onPoiOpen, data.onPoiClose, handles);
  }
}

export function syncOpenPoiPopup(
  map: MapboxMap,
  openPoiId: string | null,
  handles: MapLayerHandles
): void {
  handles.poiById.forEach(({ popup }) => {
    popup.remove();
  });

  if (!openPoiId) return;
  const entry = handles.poiById.get(openPoiId);
  if (!entry) return;
  entry.popup.setLngLat(entry.marker.getLngLat()).addTo(map);
}

export function addMapLayers(map: MapboxMap, data: MapLayerData, handles: MapLayerHandles): void {
  if (!map.isStyleLoaded()) {
    return;
  }

  if (data.routeGeometry) {
    removeLayerAndSource(map, GREAT_CIRCLE_LAYER_ID, GREAT_CIRCLE_SOURCE_ID);
    setLineLayer(
      map,
      ROUTE_SOURCE_ID,
      ROUTE_LAYER_ID,
      data.routeGeometry,
      ROUTE_COLORS[data.routeMode],
      4
    );
  } else if (data.greatCircleGeometry) {
    removeLayerAndSource(map, ROUTE_LAYER_ID, ROUTE_SOURCE_ID);
    setLineLayer(
      map,
      GREAT_CIRCLE_SOURCE_ID,
      GREAT_CIRCLE_LAYER_ID,
      data.greatCircleGeometry,
      '#3b82f6',
      3
    );
  } else {
    removeLayerAndSource(map, ROUTE_LAYER_ID, ROUTE_SOURCE_ID);
    removeLayerAndSource(map, GREAT_CIRCLE_LAYER_ID, GREAT_CIRCLE_SOURCE_ID);
  }

  clearCityMarkers(handles);

  if (data.origin) {
    createCityMarker(map, data.origin, '#22c55e', handles);
  }

  if (data.destination) {
    createCityMarker(map, data.destination, '#ef4444', handles);
  }

  syncPoiMarkers(map, data, handles);
}

export function createMapLayerHandles(): MapLayerHandles {
  return { cityMarkers: [], cityPopups: [], poiById: new Map() };
}
