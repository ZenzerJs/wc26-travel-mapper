'use client';

import { useState } from 'react';
import { Marker, Popup } from 'react-map-gl';
import type { City } from '@/lib/types';

interface CityMarkerProps {
  city: City;
  color?: string;
}

export default function CityMarker({ city, color = '#ef4444' }: CityMarkerProps) {
  const [showPopup, setShowPopup] = useState(false);

  return (
    <>
      <Marker
        longitude={city.lng}
        latitude={city.lat}
        anchor="bottom"
        onClick={(event) => {
          event.originalEvent.stopPropagation();
          setShowPopup(true);
        }}
      >
        <button
          type="button"
          aria-label={`${city.name} marker`}
          className="cursor-pointer border-none bg-transparent p-0"
          onClick={() => setShowPopup(true)}
        >
          <span
            className="block h-4 w-4 rounded-full border-2 border-white shadow-md"
            style={{ backgroundColor: color }}
          />
        </button>
      </Marker>

      {showPopup && (
        <Popup
          longitude={city.lng}
          latitude={city.lat}
          anchor="bottom"
          offset={12}
          closeOnClick={false}
          onClose={() => setShowPopup(false)}
        >
          <div className="min-w-[140px]">
            <p className="font-semibold text-gray-900">{city.name}</p>
            <p className="text-sm text-gray-600">{city.stadium}</p>
          </div>
        </Popup>
      )}
    </>
  );
}
