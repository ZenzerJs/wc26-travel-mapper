# WC26 Travel Mapper

Multi-modal travel planning tool for FIFA World Cup 2026 host cities in North America.

## Getting Started

1. Copy `.env.example` to `.env.local` and add your keys:

```bash
NEXT_PUBLIC_MAPBOX_TOKEN=your_public_mapbox_token
MAPBOX_TOKEN=your_server_mapbox_token
RAPIDAPI_KEY=your_rapidapi_key
OPENWEATHER_API_KEY=your_openweathermap_key   # optional
```

2. Install dependencies and run the dev server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

## Environment variables

| Variable | Exposure | Purpose |
|---|---|---|
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Browser (public) | Map tiles & styles |
| `MAPBOX_TOKEN` | Server only | Directions & POI proxy routes |
| `RAPIDAPI_KEY` | Server only | Flight search |
| `OPENWEATHER_API_KEY` | Server only | Weather chips (optional) |

Use **two Mapbox tokens**: a URL-restricted public token for the map, and a separate server token for API routes. Never commit `.env.local`.

## Security

- API keys are proxied through Next.js API routes — RapidAPI and OpenWeather keys never reach the browser.
- `.env.local` is gitignored; only `.env.example` (placeholders) is tracked.
- If a key was ever shared in chat, email, or a screenshot, **rotate it** in the provider dashboard.
- On Mapbox, restrict the public token to your domain (e.g. `localhost:3000`, `*.vercel.app`).

## Deploying (Vercel)

1. Import the GitHub repo at [vercel.com/new](https://vercel.com/new)
2. Add all env vars from `.env.local` in **Project → Settings → Environment Variables**
3. Deploy — every push to `main` auto-deploys

## Tech Stack

- Next.js 14 App Router, TypeScript, Tailwind CSS
- react-map-gl + mapbox-gl
- Mapbox Directions & Search Box, RapidAPI Skyscanner, OpenWeatherMap
