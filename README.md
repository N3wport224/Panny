# Panny — Retail Penny-Deal & Markdown Tracker (MVP)

A crowdsourced penny-deal tracker: scan a barcode in-store to check if an item
has dropped to **$0.01**, browse a live feed of nearby deals, and report deals
you find so other hunters can verify them.

## Stack

| Layer    | Tech                                                    |
| -------- | ------------------------------------------------------- |
| Mobile   | React Native (Expo SDK 51+, Expo Router, expo-camera)   |
| API      | Node.js, Express 4, TypeScript, Zod validation          |
| Database | PostgreSQL 15+ with **PostGIS**, Prisma ORM             |

## Repo layout

```
Panny/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma          # Part 1 — data model
│   │   └── sql/setup_postgis.sql  # PostGIS extension + geography column + trigger
│   └── src/
│       ├── index.ts               # Express bootstrap
│       ├── lib/prisma.ts          # Singleton Prisma client
│       ├── services/productLookup.ts  # Mocked external UPC lookup
│       └── routes/dealRouter.ts   # Part 2 — /scan, /report, /nearby
└── mobile/
    ├── app/                       # Part 3 — Expo Router screens
    │   ├── _layout.tsx
    │   └── (tabs)/
    │       ├── _layout.tsx        # Tab bar (Feed / Scanner) with Lucide icons
    │       ├── index.tsx          # Live deal feed
    │       └── scanner.tsx        # Barcode scanner w/ camera overlay
    ├── components/DealCard.tsx    # Deal card + thumbs up/down widget
    └── lib/api.ts                 # Typed API client
```

## Getting started

### 1. Database

```bash
# Requires a Postgres instance with PostGIS available (e.g. the postgis/postgis docker image)
docker run -d --name panny-db -p 5432:5432 \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=panny postgis/postgis:15-3.4
```

### 2. Backend

```bash
cd backend
cp .env.example .env          # set DATABASE_URL
npm install
npx prisma migrate dev        # creates tables from schema.prisma
psql $DATABASE_URL -f prisma/sql/setup_postgis.sql   # PostGIS column + sync trigger
npm run dev                   # http://localhost:4000
```

> `setup_postgis.sql` enables the PostGIS extension, adds a
> `geography(Point, 4326)` column to `stores`, backfills it from lat/lng, and
> installs a trigger so the spatial column stays in sync automatically. Prisma
> models it as an `Unsupported` field; all radius queries go through
> `$queryRaw` (see `dealRouter.ts`).

### 3. Mobile

```bash
cd mobile
npm install
# Point the app at your machine's LAN IP so a physical device can reach the API:
EXPO_PUBLIC_API_URL=http://192.168.x.x:4000 npx expo start
```

## API surface

| Method | Path                | Purpose                                              |
| ------ | ------------------- | ---------------------------------------------------- |
| POST   | `/api/deals/scan`   | Barcode + storeId → deal status (creates product if unknown) |
| POST   | `/api/deals/report` | Crowdsource: upsert a $0.01 deal at a store          |
| GET    | `/api/deals/nearby` | Active penny deals within N miles, sorted by distance |
| POST   | `/api/deals/:id/vote` | Thumbs up/down verification                        |
