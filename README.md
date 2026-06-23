# WC26 Travel Mapper

Multi-modal travel planning tool for FIFA World Cup 2026 host cities in North America.

## Getting Started

1. Copy `.env.example` to `.env.local` and add your Mapbox token:

```bash
NEXT_PUBLIC_MAPBOX_TOKEN=your_mapbox_token_here
```

2. Install dependencies and run the dev server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

## Phase 1 (Current)

- Full-screen satellite map with origin/destination city selectors
- Great-circle route line between selected host cities
- City markers with stadium popups

## Upcoming Phases

- **Phase 2:** Google Directions API (driving/transit)
- **Phase 3:** RapidAPI Google Flights search
- **Phase 4:** Foursquare POI discovery along routes

## Tech Stack

- Next.js 14 App Router, TypeScript, Tailwind CSS
- react-map-gl + mapbox-gl
