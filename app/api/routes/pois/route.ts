import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_POI_RADIUS_METERS } from '@/lib/constants';
import {
  ALLOWED_POI_CATEGORY_IDS,
  getCategoryGroup,
  searchPoisWithCache,
} from '@/lib/poi-search';
import { SERVICE_UNAVAILABLE } from '@/lib/safe-errors';
import { getCaminoApiKey, getMapboxServerToken } from '@/lib/server-secrets';
import type { POIResponse, POISearchRequest, RoutePOI } from '@/lib/types';
import { isValidCoordinate } from '@/lib/validate-request';

export async function POST(request: NextRequest) {
  try {
    const mapboxToken = getMapboxServerToken();
    const caminoKey = getCaminoApiKey();

    if (!mapboxToken && !caminoKey) {
      console.error('POI search not configured: missing Mapbox and Camino credentials');
      return NextResponse.json({ error: SERVICE_UNAVAILABLE.pois }, { status: 503 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }

    if (typeof body !== 'object' || body === null) {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }

    const payload = body as Partial<POISearchRequest>;
    const { categoryId, radius: requestedRadius } = payload;

    if (!isValidCoordinate(payload)) {
      return NextResponse.json(
        { error: 'Request must include lat and lng coordinates.' },
        { status: 400 }
      );
    }

    const { lat, lng } = payload;
    const radius =
      typeof requestedRadius === 'number' && requestedRadius > 0
        ? requestedRadius
        : DEFAULT_POI_RADIUS_METERS;

    if (!categoryId || !ALLOWED_POI_CATEGORY_IDS.has(categoryId)) {
      return NextResponse.json({ error: 'Unsupported category ID.' }, { status: 400 });
    }

    const categoryGroup = getCategoryGroup(categoryId);
    if (!categoryGroup) {
      return NextResponse.json({ pois: [] satisfies RoutePOI[] });
    }

    const { pois } = await searchPoisWithCache(categoryId, categoryGroup, lat, lng, radius);

    const response: POIResponse = { pois };
    return NextResponse.json(response);
  } catch (error) {
    console.error('POI route error:', error);
    return NextResponse.json({ pois: [], error: SERVICE_UNAVAILABLE.pois }, { status: 500 });
  }
}
