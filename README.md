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

### 3. Mobile — run it on your iPhone

The app targets **Expo SDK 54**, which is what the current Expo Go app on the
App Store supports (iPhone 17 / iOS 26 included). No Mac or Xcode needed.

1. Install **Expo Go** from the App Store on your iPhone.
2. Start the backend (step 2 above) on your computer.
3. Find your computer's LAN IP (`ipconfig getifaddr en0` on macOS,
   `ipconfig` on Windows) — your phone talks to the API over Wi-Fi, so
   `localhost` won't work from the device.
4. Start the dev server, pointing the app at that IP:

   ```bash
   cd mobile
   npm install
   EXPO_PUBLIC_API_URL=http://192.168.x.x:4000 npx expo start
   ```

5. Open the **Camera** app on your iPhone and scan the QR code in the
   terminal — it opens straight into Expo Go. Phone and computer must be on
   the same Wi-Fi network.

> If your network blocks device-to-laptop traffic (common on office/public
> Wi-Fi), use a tunnel instead: `npx expo start --tunnel`. The QR code then
> works from any network, but the API URL must also be reachable from the
> internet (e.g. via `ngrok http 4000`).

### Run the tests

Backend integration tests run against a real PostGIS database (they truncate
tables — point them at a throwaway DB):

```bash
cd backend
npm test        # 17 tests: scan/report/vote flows + geospatial radius/sort
```

## API surface

| Method | Path                | Purpose                                              |
| ------ | ------------------- | ---------------------------------------------------- |
| POST   | `/api/deals/scan`   | Barcode + storeId → deal status (creates product if unknown) |
| POST   | `/api/deals/report` | Crowdsource: upsert a $0.01 deal at a store          |
| GET    | `/api/deals/nearby` | Active penny deals within N miles, sorted by distance |
| POST   | `/api/deals/:id/vote` | Thumbs up/down verification                        |
