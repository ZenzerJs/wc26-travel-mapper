'use client';

import { useState } from 'react';
import { Marker, Popup } from 'react-map-gl';
import { POI_COLORS } from '@/lib/constants';
import type { RoutePOI } from '@/lib/types';

interface POIMarkerProps {
  poi: RoutePOI;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
}

export default function POIMarker({ poi, isOpen, onOpen, onClose }: POIMarkerProps) {
  const [hovered, setHovered] = useState(false);
  const showPopup = isOpen || hovered;
  const color = POI_COLORS[poi.categoryGroup];

  return (
    <>
      <Marker
        longitude={poi.lng}
        latitude={poi.lat}
        anchor="center"
        onClick={(event) => {
          event.originalEvent.stopPropagation();
          onOpen();
        }}
      >
        <button
          type="button"
          aria-label={`${poi.name} POI marker`}
          className="cursor-pointer border-none bg-transparent p-0"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onClick={() => onOpen()}
        >
          <span
            className="block h-3 w-3 rounded-full border border-white shadow-md"
            style={{ backgroundColor: color }}
          />
        </button>
      </Marker>

      {showPopup && (
        <Popup
          longitude={poi.lng}
          latitude={poi.lat}
          anchor="bottom"
          offset={8}
          closeOnClick={false}
          onClose={() => {
            setHovered(false);
            onClose();
          }}
        >
          <div className="min-w-[140px]">
            <p className="font-semibold text-gray-900">{poi.name}</p>
            <p className="text-sm text-gray-600">{poi.category}</p>
          </div>
        </Popup>
      )}
    </>
  );
}
