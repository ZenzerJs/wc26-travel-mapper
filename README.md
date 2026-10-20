# ⚽ WC26 Travel Mapper

[![Next.js](https://img.shields.io/badge/Next.js-14+-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4-38B2AC?style=flat-square&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Mapbox GL JS](https://img.shields.io/badge/Map_Engine-Mapbox_GL_JS-4264FB?style=flat-square&logo=mapbox&logoColor=white)](https://docs.mapbox.com/mapbox-gl-js/)

> An interactive, multi-modal travel planning web application built for fans attending the **2026 FIFA World Cup**. Integrates host city maps, venue POIs, flight cost comparison, driving/transit routing, and live weather forecasts across North American host stadiums.

---

## 🌟 Key Features

- **World Cup 2026 Host City Explorer**: Interactive mapping interface (`MapView.tsx`) highlighting host stadium markers, match venues, and fan zones across USA, Canada, and Mexico.
- **Multi-Source Flight Aggregation**: Real-time flight search and price discovery using Amadeus API, Skyscanner integration, and Sky-Scrapper tools (`lib/flight-search.ts`).
- **Venue POI & Stadium Guides**: Search local attractions, accommodations, and points of interest (`lib/pois.ts`, `POIMarker.tsx`) near host venues.
- **Route & Directions Calculation**: Calculate transit and driving metrics between match cities (`lib/directions.ts`, `RoutePanel.tsx`).
- **Live Weather Projections**: Matchday weather forecasts and climate metrics (`lib/weather.ts`) tailored to individual stadium locations.
- **API Performance & Security**: Built-in rate limiting (`lib/rate-limit.ts`), server secrets sanitization (`lib/server-secrets.ts`), debounced inputs, and in-memory API caching (`lib/api-cache.ts`).

---

## 🏗️ Repository Architecture

```text
wc26-travel-mapper/
├── app/
│   ├── api/                # Next.js API routes for flights, directions, POIs, weather
│   │   ├── routes/
│   │   │   ├── directions/ # Routing calculation endpoint
│   │   │   ├── flights/    # Flight aggregator endpoint
│   │   │   └── pois/       # Points of Interest endpoint
│   │   └── weather/        # Stadium weather endpoint
│   ├── components/         # MapView, CityMarker, POIMarker, RoutePanel, Skeleton
│   ├── globals.css         # Global Tailwind styles & map styling
│   └── page.tsx            # Main interactive mapper application page
├── lib/                    # Travel calculation engines & API integrations
│   ├── amadeus-flights.ts  # Amadeus flight integration
│   ├── skyscanner.ts       # Skyscanner flight integration
│   ├── flight-search.ts    # Unified flight aggregator logic
│   ├── directions.ts       # Distance & route calculations
│   ├── pois.ts             # Host city POI finder
│   ├── weather.ts          # Stadium weather API
│   ├── rate-limit.ts       # Middleware rate-limiting
│   └── host-cities.json    # World Cup 2026 stadium & city database
└── public/data/            # Static geospatial data assets
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: `v18.0.0+`
- **npm** or **pnpm**

---

### Local Development Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/ZenzerJs/wc26-travel-mapper.git
   cd wc26-travel-mapper
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```

   Fill in API keys for flight search, mapping providers, and weather feeds:
   ```env
   # Mapbox (required for map rendering)
   NEXT_PUBLIC_MAPBOX_TOKEN=your_public_mapbox_token
   MAPBOX_TOKEN=your_server_mapbox_token
   # Flight & Travel APIs
   AMADEUS_CLIENT_ID=your_amadeus_client_id
   AMADEUS_CLIENT_SECRET=your_amadeus_client_secret
   # Weather
   OPENWEATHER_API_KEY=your_openweather_key
   ```

4. **Run the development server**:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🛠️ Verification & Scripts

| Command | Action |
| :--- | :--- |
| `npm run dev` | Launches Next.js development server |
| `npm run build` | Compiles production application build |
| `npm run start` | Runs production build server |
| `npm run lint` | Checks codebase for ESLint warnings/errors |

---

*Developed by [ZenzerJs](https://github.com/ZenzerJs)*
