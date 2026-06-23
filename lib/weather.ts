import type { WeatherData, WeatherResponse } from '@/lib/types';

export async function fetchWeather(lat: number, lng: number): Promise<WeatherData | null> {
  try {
    const response = await fetch('/api/weather', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat, lng }),
    });

    if (!response.ok) {
      console.error('Weather fetch failed:', await response.text());
      return null;
    }

    const data = (await response.json()) as WeatherResponse;
    return data.weather;
  } catch (error) {
    console.error('Weather request error:', error);
    return null;
  }
}
