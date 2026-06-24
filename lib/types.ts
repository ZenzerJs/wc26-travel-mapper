export interface City {
  id: string;
  name: string;
  country: string;
  stadium: string;
  lat: number;
  lng: number;
  iata: string;
  timezone: string;
}

export interface RouteLeg {
  mode: 'driving' | 'transit' | 'walking' | 'flight';
  duration: string;
  distance: string;
  polyline?: string;
  steps?: { instruction: string; distance: string }[];
}

export interface POI {
  fsq_id: string;
  name: string;
  categories: { id: number; name: string }[];
  rating?: number;
  location: { lat: number; lng: number; address?: string };
}

export type GroundRouteMode = 'driving';
export type TravelMode = 'driving' | 'flight';

export type MapStyleOption = 'streets' | 'night';

export type POICategoryGroup = 'food' | 'arts' | 'outdoors' | 'gas' | 'hotels';

export type POIFilter = 'all' | POICategoryGroup;

export interface DirectionsRequest {
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  mode: GroundRouteMode;
  waypoints?: Array<{ lat: number; lng: number }>;
}

export interface RouteStep {
  instruction: string;
  distance: string;
}

export interface RouteResponse {
  distance: string;
  duration: string;
  durationSeconds: number;
  distanceMeters: number;
  geometry: GeoJSON.LineString;
  steps: RouteStep[];
}

export interface DirectionsErrorResponse {
  error: string;
}

export interface POISearchRequest {
  lat: number;
  lng: number;
  radius?: number;
  categoryId?: string;
}

export interface RoutePOI {
  id: string;
  name: string;
  category: string;
  categoryGroup: POICategoryGroup;
  rating?: number;
  lat: number;
  lng: number;
  address: string;
  distanceFromRoute?: number;
}

export interface HotelPOI extends RoutePOI {
  categoryGroup: 'hotels';
  distanceFromRoute: number;
}

export interface POIResponse {
  pois: RoutePOI[];
}

export interface POIErrorResponse {
  error: string;
}

export interface FlightResult {
  airline?: string;
  price?: number;
  priceLabel?: string;
  duration?: string;
  departureTime?: string;
  arrivalTime?: string;
  stops?: number;
}

export interface FlightSearchRequest {
  originCity: string;
  destinationCity: string;
  originIata?: string;
  destinationIata?: string;
  originCountry?: string;
  destinationCountry?: string;
  date?: string;
}

export interface FlightSearchResponse {
  flights: FlightResult[];
}

export interface FlightErrorResponse {
  error: string;
}

export interface WeatherData {
  tempC: number;
  description: string;
  icon: string;
  emoji: string;
}

export interface WeatherResponse {
  weather: WeatherData | null;
}

export interface WeatherErrorResponse {
  error: string;
}
