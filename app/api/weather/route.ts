import { NextRequest, NextResponse } from 'next/server';
import { getOpenWeatherApiKey } from '@/lib/server-secrets';
import type { WeatherData, WeatherResponse } from '@/lib/types';
import { isValidCoordinate } from '@/lib/validate-request';

interface OpenWeatherResponse {
  weather?: Array<{ id: number; main: string; description: string; icon: string }>;
  main?: { temp: number };
}

/** Map an OpenWeatherMap icon code to a simple emoji. */
function iconToEmoji(icon: string): string {
  const code = icon.slice(0, 2);
  const map: Record<string, string> = {
    '01': '☀️',
    '02': '🌤️',
    '03': '⛅',
    '04': '☁️',
    '09': '🌧️',
    '10': '🌦️',
    '11': '⛈️',
    '13': '❄️',
    '50': '🌫️',
  };
  return map[code] ?? '🌡️';
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = getOpenWeatherApiKey();

    if (!apiKey) {
      return NextResponse.json({ weather: null } satisfies WeatherResponse);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }

    if (!isValidCoordinate(body)) {
      return NextResponse.json(
        { error: 'Request must include lat and lng coordinates.' },
        { status: 400 }
      );
    }

    const { lat, lng } = body as { lat: number; lng: number };

    const url = new URL('https://api.openweathermap.org/data/2.5/weather');
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lon', String(lng));
    url.searchParams.set('units', 'metric');
    url.searchParams.set('appid', apiKey);

    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
      next: { revalidate: 600 },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`OpenWeatherMap error ${response.status}:`, text.substring(0, 200));
      return NextResponse.json({ weather: null } satisfies WeatherResponse);
    }

    const data = (await response.json()) as OpenWeatherResponse;
    const condition = data.weather?.[0];

    if (!condition || data.main?.temp === undefined) {
      return NextResponse.json({ weather: null } satisfies WeatherResponse);
    }

    const weather: WeatherData = {
      tempC: Math.round(data.main.temp),
      description: condition.description,
      icon: condition.icon,
      emoji: iconToEmoji(condition.icon),
    };

    return NextResponse.json({ weather } satisfies WeatherResponse);
  } catch (error) {
    console.error('Weather route error:', error);
    return NextResponse.json({ weather: null } satisfies WeatherResponse);
  }
}
