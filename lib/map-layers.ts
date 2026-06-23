import type { Map as MapboxMap, Marker, Popup } from 'mapbox-gl';
import mapboxgl from 'mapbox-gl';
import { POI_COLORS } from '@/lib/constants';
import type { City, GroundRouteMode, POICategoryGroup, RoutePOI } from '@/lib/types';

const ROUTE_SOURCE_ID = 'wc26-directions-route';
const ROUTE_LAYER_ID = 'wc26-directions-route-line';
const GREAT_CIRCLE_SOURCE_ID = 'wc26-great-circle-route';
const GREAT_CIRCLE_LAYER_ID = 'wc26-great-circle-route-line';

const ROUTE_COLORS: Record<GroundRouteMode, string> = {
  driving: '#3b82f6',
  walking: '#10b981',
};

export interface MapLayerData {
  origin: City | null;
  destination: City | null;
  routeGeometry: GeoJSON.LineString | null;
  greatCircleGeometry: GeoJSON.LineString | null;
  routeMode: GroundRouteMode;
  visiblePois: RoutePOI[];
  selectedStopIds: Set<string>;
  openPoiId: string | null;
  onPoiOpen: (poiId: string) => void;
  onPoiClose: () => void;
}

export interface MapLayerHandles {
  markers: Marker[];
  popups: Popup[];
}

function removeLayerAndSource(map: MapboxMap, layerId: string, sourceId: string): void {
  if (map.getLayer(layerId)) {
    map.removeLayer(layerId);
  }

  if (map.getSource(sourceId)) {
    map.removeSource(sourceId);
  }
}

function addLineLayer(
  map: MapboxMap,
  sourceId: string,
  layerId: string,
  geometry: GeoJSON.LineString,
  color: string,
  width: number
): void {
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
    `<div class="min-w-[140px]"><p class="font-semibold text-gray-900">${city.name}</p><p class="text-sm text-gray-600">${city.stadium}</p></div>`
  );

  element.addEventListener('click', (event) => {
    event.stopPropagation();
    popup.setLngLat([city.lng, city.lat]).addTo(map);
  });

  const marker = new mapboxgl.Marker({ element, anchor: 'bottom' })
    .setLngLat([city.lng, city.lat])
    .addTo(map);

  handles.markers.push(marker);
  handles.popups.push(popup);
}

function createPoiMarker(
  map: MapboxMap,
  poi: RoutePOI,
  isOpen: boolean,
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
    // Selected waypoints render larger with a white ring + colored outline.
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
    `<div class="min-w-[140px]"><p class="font-semibold text-gray-900">${poi.name}</p><p class="text-sm text-gray-600">${poi.category}</p>${selectedNote}</div>`
  );

  popup.on('close', () => {
    onClose();
  });

  const showPopup = () => {
    popup.setLngLat([poi.lng, poi.lat]).addTo(map);
  };

  element.addEventListener('mouseenter', showPopup);
  element.addEventListener('click', (event) => {
    event.stopPropagation();
    onOpen(poi.id);
    showPopup();
  });

  if (isOpen) {
    showPopup();
  }

  const marker = new mapboxgl.Marker({ element, anchor: 'center' })
    .setLngLat([poi.lng, poi.lat])
    .addTo(map);

  handles.markers.push(marker);
  handles.popups.push(popup);
}

export function clearMapLayers(map: MapboxMap, handles: MapLayerHandles): void {
  handles.markers.forEach((marker) => marker.remove());
  handles.popups.forEach((popup) => popup.remove());
  handles.markers = [];
  handles.popups = [];

  removeLayerAndSource(map, ROUTE_LAYER_ID, ROUTE_SOURCE_ID);
  removeLayerAndSource(map, GREAT_CIRCLE_LAYER_ID, GREAT_CIRCLE_SOURCE_ID);
}

export function addMapLayers(map: MapboxMap, data: MapLayerData, handles: MapLayerHandles): void {
  if (!map.isStyleLoaded()) {
    return;
  }

  clearMapLayers(map, handles);

  if (data.routeGeometry) {
    addLineLayer(
      map,
      ROUTE_SOURCE_ID,
      ROUTE_LAYER_ID,
      data.routeGeometry,
      ROUTE_COLORS[data.routeMode],
      4
    );
  } else if (data.greatCircleGeometry) {
    addLineLayer(
      map,
      GREAT_CIRCLE_SOURCE_ID,
      GREAT_CIRCLE_LAYER_ID,
      data.greatCircleGeometry,
      '#3b82f6',
      3
    );
  }

  if (data.origin) {
    createCityMarker(map, data.origin, '#22c55e', handles);
  }

  if (data.destination) {
    createCityMarker(map, data.destination, '#ef4444', handles);
  }

  data.visiblePois.forEach((poi) => {
    createPoiMarker(
      map,
      poi,
      data.openPoiId === poi.id,
      data.selectedStopIds.has(poi.id),
      data.onPoiOpen,
      data.onPoiClose,
      handles
    );
  });
}

export function createMapLayerHandles(): MapLayerHandles {
  return { markers: [], popups: [] };
}
