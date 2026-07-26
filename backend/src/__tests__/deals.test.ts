/**
 * Integration tests — run against a real Postgres + PostGIS database.
 *
 * Prereqs (see README):
 *   1. DATABASE_URL points at a PostGIS-enabled database
 *   2. `npx prisma migrate dev` has been applied
 *   3. `psql $DATABASE_URL -f prisma/sql/setup_postgis.sql` has been run
 *      (the geospatial tests depend on the location-sync trigger)
 *
 * The suite truncates all tables up front and builds its own fixtures, so
 * it must NOT be pointed at a database with data you care about.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { prisma } from "../lib/prisma";

const app = createApp();

// --- Geographic fixtures ---------------------------------------------------
// User standing in downtown Austin. Store distances (great-circle):
//   NEAR  (N Austin)   ~8.6 mi
//   FAR   (Round Rock) ~17.5 mi
// So radius=12 returns only NEAR; radius=50 returns both, NEAR first.
const USER = { latitude: 30.2672, longitude: -97.7431 };

const NEAR_STORE = {
  id: "test-store-near",
  name: "Home Depot - Austin North",
  retailer: "HOME_DEPOT" as const,
  address: "10515 N Mopac Expy",
  city: "Austin",
  state: "TX",
  zipCode: "78759",
  latitude: 30.39051,
  longitude: -97.7259,
};

const FAR_STORE = {
  id: "test-store-far",
  name: "Lowe's - Round Rock",
  retailer: "LOWES" as const,
  address: "2801 S Interstate 35",
  city: "Round Rock",
  state: "TX",
  zipCode: "78664",
  latitude: 30.5205,
  longitude: -97.6899,
};

// Barcodes: mock external lookup resolves anything NOT ending in "00".
const KNOWN_BARCODE = "049206637887";
const UNKNOWN_UPSTREAM_BARCODE = "111111111100"; // ends in 00 -> upstream miss

beforeAll(async () => {
  // Fresh slate: TRUNCATE ... CASCADE clears children (deals, votes) too.
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "deal_votes", "deals", "products", "stores", "users" CASCADE'
  );
  await prisma.store.createMany({ data: [NEAR_STORE, FAR_STORE] });
  await prisma.user.create({
    data: {
      id: "test-user",
      email: "test@example.com",
      username: "tester",
      passwordHash: "x",
    },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /api/deals/scan", () => {
  it("rejects a non-numeric barcode with 400", async () => {
    const res = await request(app)
      .post("/api/deals/scan")
      .send({ barcode: "not-a-barcode", storeId: NEAR_STORE.id });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("ValidationError");
  });

  it("returns 404 for an unknown store", async () => {
    const res = await request(app)
      .post("/api/deals/scan")
      .send({ barcode: KNOWN_BARCODE, storeId: "nope" });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("StoreNotFound");
  });

  it("creates the product from the external catalog on first scan", async () => {
    const res = await request(app)
      .post("/api/deals/scan")
      .send({ barcode: KNOWN_BARCODE, storeId: NEAR_STORE.id });
    expect(res.status).toBe(200);
    expect(res.body.productSource).toBe("external");
    expect(res.body.product.upc).toBe(KNOWN_BARCODE);
    expect(res.body.deal).toBeNull(); // nothing reported here yet
    expect(res.body.isPenny).toBe(false);
  });

  it("serves the product from the DB on second scan", async () => {
    const res = await request(app)
      .post("/api/deals/scan")
      .send({ barcode: KNOWN_BARCODE, storeId: NEAR_STORE.id });
    expect(res.status).toBe(200);
    expect(res.body.productSource).toBe("database");
  });

  it("returns 404 when the barcode is unknown upstream too", async () => {
    const res = await request(app)
      .post("/api/deals/scan")
      .send({ barcode: UNKNOWN_UPSTREAM_BARCODE, storeId: NEAR_STORE.id });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("ProductNotFound");
  });
});

describe("POST /api/deals/report", () => {
  it("creates a PENNY deal at $0.01 and credits the reporter", async () => {
    const res = await request(app).post("/api/deals/report").send({
      barcode: KNOWN_BARCODE,
      storeId: NEAR_STORE.id,
      userId: "test-user",
    });
    expect(res.status).toBe(201);
    expect(res.body.deal.status).toBe("PENNY");
    expect(Number(res.body.deal.price)).toBe(0.01);

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: "test-user" },
    });
    expect(user.contributionsCount).toBe(1);
  });

  it("classifies a $5.00 report as ACTIVE (markdown, not penny)", async () => {
    const res = await request(app).post("/api/deals/report").send({
      barcode: "222222222222",
      storeId: FAR_STORE.id,
      price: 5.0,
    });
    expect(res.status).toBe(201);
    expect(res.body.deal.status).toBe("ACTIVE");
    expect(Number(res.body.deal.price)).toBe(5.0);
  });

  it("upserts instead of duplicating on a repeat report", async () => {
    await request(app)
      .post("/api/deals/report")
      .send({ barcode: KNOWN_BARCODE, storeId: NEAR_STORE.id });

    const count = await prisma.deal.count({
      where: { product: { upc: KNOWN_BARCODE }, storeId: NEAR_STORE.id },
    });
    expect(count).toBe(1); // @@unique([productId, storeId]) honored
  });

  it("creates a placeholder product for a barcode unknown everywhere", async () => {
    const res = await request(app).post("/api/deals/report").send({
      barcode: UNKNOWN_UPSTREAM_BARCODE,
      storeId: NEAR_STORE.id,
      title: "Mystery clearance widget",
    });
    expect(res.status).toBe(201);
    expect(res.body.deal.product.title).toBe("Mystery clearance widget");
  });

  it("scan now reports the penny deal", async () => {
    const res = await request(app)
      .post("/api/deals/scan")
      .send({ barcode: KNOWN_BARCODE, storeId: NEAR_STORE.id });
    expect(res.status).toBe(200);
    expect(res.body.isPenny).toBe(true);
    expect(res.body.deal.status).toBe("PENNY");
  });
});

describe("GET /api/deals/nearby (geospatial)", () => {
  beforeAll(async () => {
    // Add a penny deal at the FAR store so both stores have one.
    await request(app)
      .post("/api/deals/report")
      .send({ barcode: "333333333333", storeId: FAR_STORE.id });
  });

  it("rejects out-of-range coordinates with 400", async () => {
    const res = await request(app).get(
      "/api/deals/nearby?latitude=999&longitude=0"
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("ValidationError");
  });

  it("only returns PENNY deals inside the radius", async () => {
    // radius=12mi: NEAR (~8.6mi) is in, FAR (~17.5mi) is out.
    const res = await request(app).get(
      `/api/deals/nearby?latitude=${USER.latitude}&longitude=${USER.longitude}&radius=12`
    );
    expect(res.status).toBe(200);
    const storeIds = res.body.deals.map((d: any) => d.store.id);
    expect(storeIds).toContain(NEAR_STORE.id);
    expect(storeIds).not.toContain(FAR_STORE.id);
    // The $5.00 ACTIVE markdown must never appear in the penny feed.
    for (const deal of res.body.deals) {
      expect(deal.status).toBe("PENNY");
      expect(deal.price).toBe(0.01);
    }
  });

  it("sorts by proximity and reports accurate mileage", async () => {
    const res = await request(app).get(
      `/api/deals/nearby?latitude=${USER.latitude}&longitude=${USER.longitude}&radius=50`
    );
    expect(res.status).toBe(200);

    const distances = res.body.deals.map((d: any) => d.distanceMiles);
    expect(distances).toEqual([...distances].sort((a, b) => a - b));

    const near = res.body.deals.find((d: any) => d.store.id === NEAR_STORE.id);
    const far = res.body.deals.find((d: any) => d.store.id === FAR_STORE.id);
    // Great-circle distances computed independently: ~8.6 and ~17.5 miles.
    // ±0.5mi tolerance covers spheroid-vs-sphere and rounding differences.
    expect(near.distanceMiles).toBeGreaterThan(8.1);
    expect(near.distanceMiles).toBeLessThan(9.1);
    expect(far.distanceMiles).toBeGreaterThan(17.0);
    expect(far.distanceMiles).toBeLessThan(18.0);
  });
});

describe("POST /api/deals/:id/vote", () => {
  let dealId: string;

  beforeAll(async () => {
    const deal = await prisma.deal.findFirstOrThrow({
      where: { product: { upc: KNOWN_BARCODE }, storeId: NEAR_STORE.id },
    });
    dealId = deal.id;
  });

  it("records an upvote", async () => {
    const res = await request(app)
      .post(`/api/deals/${dealId}/vote`)
      .send({ userId: "test-user", value: 1 });
    expect(res.status).toBe(200);
    expect(res.body.deal.upvotes).toBe(1);
    expect(res.body.deal.downvotes).toBe(0);
  });

  it("is idempotent for the same vote", async () => {
    const res = await request(app)
      .post(`/api/deals/${dealId}/vote`)
      .send({ userId: "test-user", value: 1 });
    expect(res.body.changed).toBe(false);

    const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
    expect(deal.upvotes).toBe(1); // not double-counted
  });

  it("flips both counters when the user changes their vote", async () => {
    const res = await request(app)
      .post(`/api/deals/${dealId}/vote`)
      .send({ userId: "test-user", value: -1 });
    expect(res.body.deal.upvotes).toBe(0);
    expect(res.body.deal.downvotes).toBe(1);
  });

  it("expires a deal after enough independent downvotes", async () => {
    // 4 more distinct users voting "didn't ring up" (5 total downvotes).
    for (let i = 0; i < 4; i++) {
      await prisma.user.create({
        data: {
          id: `downvoter-${i}`,
          email: `down${i}@example.com`,
          username: `down${i}`,
          passwordHash: "x",
        },
      });
      await request(app)
        .post(`/api/deals/${dealId}/vote`)
        .send({ userId: `downvoter-${i}`, value: -1 });
    }
    const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
    expect(deal.downvotes).toBe(5);
    expect(deal.status).toBe("EXPIRED"); // community auto-expiry kicked in
  });
});
