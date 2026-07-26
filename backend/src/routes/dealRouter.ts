import { Router, type Request, type Response, type NextFunction } from "express";
import { DealStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { lookupProductByBarcode } from "../services/productLookup";

export const dealRouter = Router();

// ---------------------------------------------------------------------------
// Validation schemas (Zod)
// ---------------------------------------------------------------------------
// Every request body / query string is parsed BEFORE touching the DB. Zod
// gives us: type coercion for query strings (always strings on the wire),
// range checks on coordinates, and typed values downstream — no `as any`.

/** UPC-A is 12 digits, EAN-13 is 13; some scanners emit 8 (EAN-8). Digits
 *  only — reject anything else before it reaches a query. */
const barcodeSchema = z
  .string()
  .trim()
  .regex(/^\d{8,14}$/, "Barcode must be 8-14 digits");

const scanSchema = z.object({
  barcode: barcodeSchema,
  storeId: z.string().min(1, "storeId is required"),
});

const reportSchema = z.object({
  barcode: barcodeSchema,
  storeId: z.string().min(1),
  /** Reporter — in production this comes from the auth token (req.user),
   *  not the body. Optional so anonymous reports still work in the MVP. */
  userId: z.string().optional(),
  /** Defaults to a penny; allows reporting non-penny markdowns too. */
  price: z.coerce.number().positive().max(10_000).default(0.01),
  /** Optional product info for barcodes our catalog has never seen. */
  title: z.string().trim().min(1).max(200).optional(),
  imageUrl: z.string().url().optional(),
});

const nearbySchema = z.object({
  // Query params arrive as strings — z.coerce turns "30.26" into 30.26 and
  // rejects "abc". Lat/lng bounds reject garbage GPS data at the door.
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  /** Search radius in miles; clamped to 100 so nobody scans the planet. */
  radius: z.coerce.number().positive().max(100).default(10),
  limit: z.coerce.number().int().positive().max(100).default(50),
});

const voteSchema = z.object({
  userId: z.string().min(1),
  /** 1 = "still a penny", -1 = "didn't ring up". */
  value: z.union([z.literal(1), z.literal(-1)]),
});

/** Uniform 400 response for validation failures. */
function badRequest(res: Response, error: z.ZodError) {
  return res.status(400).json({
    error: "ValidationError",
    details: error.flatten().fieldErrors,
  });
}

/** Async route wrapper so thrown errors hit the Express error middleware. */
const asyncHandler =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

// ---------------------------------------------------------------------------
// POST /api/deals/scan
// ---------------------------------------------------------------------------
// In-store flow: user points camera at a shelf item. We answer one question
// fast: "is this a penny (or marked down) at THIS store?"
dealRouter.post(
  "/scan",
  asyncHandler(async (req, res) => {
    const parsed = scanSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error);
    const { barcode, storeId } = parsed.data;

    // Validate the store exists before doing any product work.
    const store = await prisma.store.findUnique({ where: { id: storeId } });
    if (!store) {
      return res.status(404).json({ error: "StoreNotFound" });
    }

    // 1. Do we already know this product?
    let product = await prisma.product.findUnique({ where: { upc: barcode } });
    let productSource: "database" | "external" = "database";

    if (!product) {
      // 2. Cache miss — hit the (mocked) external catalog API.
      const external = await lookupProductByBarcode(barcode);
      if (!external) {
        // Unknown everywhere: the client can prompt the user to add details
        // manually via /report.
        return res.status(404).json({
          error: "ProductNotFound",
          message: "Barcode not recognized. You can still report it as a deal.",
          barcode,
        });
      }
      productSource = "external";
      // upsert (not create) guards against a race where two users scan the
      // same new barcode simultaneously — second insert would violate the
      // unique(upc) constraint.
      product = await prisma.product.upsert({
        where: { upc: barcode },
        update: {},
        create: {
          upc: external.upc,
          sku: external.sku,
          title: external.title,
          imageUrl: external.imageUrl,
          description: external.description,
        },
      });
    }

    // 3. Any deal on record for this product at this store?
    const deal = await prisma.deal.findUnique({
      where: { productId_storeId: { productId: product.id, storeId } },
      select: {
        id: true,
        price: true,
        status: true,
        upvotes: true,
        downvotes: true,
        lastVerifiedAt: true,
        updatedAt: true,
      },
    });

    return res.json({
      product,
      productSource, // lets the client show "newly discovered item" UI
      deal, // null => no deal known here yet
      isPenny: deal?.status === DealStatus.PENNY,
    });
  })
);

// ---------------------------------------------------------------------------
// POST /api/deals/report
// ---------------------------------------------------------------------------
// Crowdsourcing write path: "this item rang up at $0.01 at this store."
// Upserts the (product, store) deal — the @@unique([productId, storeId])
// constraint guarantees one row per item per location.
dealRouter.post(
  "/report",
  asyncHandler(async (req, res) => {
    const parsed = reportSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error);
    const { barcode, storeId, userId, price, title, imageUrl } = parsed.data;

    const store = await prisma.store.findUnique({ where: { id: storeId } });
    if (!store) return res.status(404).json({ error: "StoreNotFound" });

    // Prices at or below a nickel are treated as penny deals; anything else
    // is a regular markdown. Comparison uses cents to dodge float noise.
    const cents = Math.round(price * 100);
    const status = cents <= 5 ? DealStatus.PENNY : DealStatus.ACTIVE;
    const priceDecimal = new Prisma.Decimal(cents).div(100);

    // Everything below is one transaction: product upsert, deal upsert, and
    // the contributor counter either all land or none do.
    const deal = await prisma.$transaction(async (tx) => {
      // Ensure the product exists — external lookup first, then any
      // user-supplied title, then a generic placeholder as last resort.
      let product = await tx.product.findUnique({ where: { upc: barcode } });
      if (!product) {
        const external = await lookupProductByBarcode(barcode);
        product = await tx.product.create({
          data: {
            upc: barcode,
            sku: external?.sku ?? null,
            title: title ?? external?.title ?? `Unknown item (${barcode})`,
            imageUrl: imageUrl ?? external?.imageUrl ?? null,
            description: external?.description ?? null,
          },
        });
      }

      const upserted = await tx.deal.upsert({
        where: { productId_storeId: { productId: product.id, storeId } },
        // New sighting of a known deal: refresh price/status, reset the
        // verification clock, and clear stale vote tallies since they
        // described the previous price.
        update: {
          price: priceDecimal,
          status,
          lastVerifiedAt: new Date(),
          upvotes: 0,
          downvotes: 0,
        },
        create: {
          productId: product.id,
          storeId,
          price: priceDecimal,
          status,
          reportedById: userId ?? null,
          lastVerifiedAt: new Date(),
        },
        include: { product: true, store: true },
      });

      // Credit the contributor's public counter.
      if (userId) {
        await tx.user
          .update({
            where: { id: userId },
            data: { contributionsCount: { increment: 1 } },
          })
          .catch(() => {
            /* unknown userId — don't fail the whole report over a counter */
          });
      }

      return upserted;
    });

    return res.status(201).json({ deal });
  })
);

// ---------------------------------------------------------------------------
// GET /api/deals/nearby?latitude=&longitude=&radius=
// ---------------------------------------------------------------------------
// The feed query. Raw SQL because Prisma can't express PostGIS operators.
//
// Geospatial logic:
//   * ST_MakePoint(lng, lat)::geography builds the user's position. NOTE the
//     order — PostGIS is (x, y) = (longitude, latitude), the #1 geo bug.
//   * ST_DWithin(a, b, meters) on *geography* does a spheroid-aware "within
//     distance" test AND — critically — it is index-assisted: the planner
//     uses the GiST index on stores.location to prune candidates instead of
//     computing distance to every store row.
//   * ST_Distance is only computed for rows that survive the filter, then
//     reused for ORDER BY via the alias-free subquery below.
//   * 1 mile = 1609.344 meters.
dealRouter.get(
  "/nearby",
  asyncHandler(async (req, res) => {
    const parsed = nearbySchema.safeParse(req.query);
    if (!parsed.success) return badRequest(res, parsed.error);
    const { latitude, longitude, radius, limit } = parsed.data;

    const radiusMeters = radius * 1609.344;

    // Prisma.sql template = fully parameterized ($1, $2…) — user input never
    // lands in the SQL string, so no injection surface.
    const rows = await prisma.$queryRaw<
      Array<{
        deal_id: string;
        price: string;
        status: DealStatus;
        upvotes: number;
        downvotes: number;
        last_verified_at: Date | null;
        product_id: string;
        upc: string;
        title: string;
        image_url: string | null;
        store_id: string;
        store_name: string;
        retailer: string;
        address: string;
        city: string;
        state: string;
        latitude: number;
        longitude: number;
        distance_meters: number;
      }>
    >(Prisma.sql`
      SELECT
        d.id                AS deal_id,
        d.price::text       AS price,
        d.status,
        d.upvotes,
        d.downvotes,
        d.last_verified_at,
        p.id                AS product_id,
        p.upc,
        p.title,
        p.image_url,
        s.id                AS store_id,
        s.name              AS store_name,
        s.retailer,
        s.address,
        s.city,
        s.state,
        s.latitude,
        s.longitude,
        ST_Distance(
          s.location,
          ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography
        )                   AS distance_meters
      FROM deals d
      JOIN stores   s ON s.id = d.store_id
      JOIN products p ON p.id = d.product_id
      WHERE d.status = 'PENNY'::"DealStatus"
        AND ST_DWithin(
          s.location,
          ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography,
          ${radiusMeters}
        )
      ORDER BY distance_meters ASC, d.updated_at DESC
      LIMIT ${limit}
    `);

    // Shape the flat SQL rows into the nested JSON the mobile app renders,
    // converting meters -> miles once here so the client stays dumb.
    const deals = rows.map((row) => ({
      id: row.deal_id,
      price: Number(row.price),
      status: row.status,
      upvotes: row.upvotes,
      downvotes: row.downvotes,
      lastVerifiedAt: row.last_verified_at,
      distanceMiles: Math.round((row.distance_meters / 1609.344) * 10) / 10,
      product: {
        id: row.product_id,
        upc: row.upc,
        title: row.title,
        imageUrl: row.image_url,
      },
      store: {
        id: row.store_id,
        name: row.store_name,
        retailer: row.retailer,
        address: row.address,
        city: row.city,
        state: row.state,
        latitude: row.latitude,
        longitude: row.longitude,
      },
    }));

    return res.json({ deals, radiusMiles: radius, count: deals.length });
  })
);

// ---------------------------------------------------------------------------
// POST /api/deals/:id/vote
// ---------------------------------------------------------------------------
// Thumbs up/down verification behind the feed widget. The unique
// (dealId, userId) constraint on deal_votes makes votes idempotent per user;
// changing your vote flips both counters atomically.
dealRouter.post(
  "/:id/vote",
  asyncHandler(async (req, res) => {
    const parsed = voteSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error);
    const { userId, value } = parsed.data;
    const dealId = req.params.id as string;

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.dealVote.findUnique({
        where: { dealId_userId: { dealId, userId } },
      });

      if (existing?.value === value) return null; // same vote — no-op

      await tx.dealVote.upsert({
        where: { dealId_userId: { dealId, userId } },
        update: { value },
        create: { dealId, userId, value },
      });

      // Adjust denormalized tallies: add the new vote, remove the old one.
      const upDelta = (value === 1 ? 1 : 0) - (existing?.value === 1 ? 1 : 0);
      const downDelta =
        (value === -1 ? 1 : 0) - (existing?.value === -1 ? 1 : 0);

      const updated = await tx.deal.update({
        where: { id: dealId },
        data: {
          upvotes: { increment: upDelta },
          downvotes: { increment: downDelta },
          // An upvote is a fresh in-store confirmation.
          ...(value === 1 ? { lastVerifiedAt: new Date() } : {}),
        },
        select: { id: true, upvotes: true, downvotes: true, status: true },
      });

      // Community expiry: enough independent "nope" votes retire the deal.
      if (updated.downvotes >= 5 && updated.downvotes > updated.upvotes * 2) {
        return tx.deal.update({
          where: { id: dealId },
          data: { status: DealStatus.EXPIRED },
          select: { id: true, upvotes: true, downvotes: true, status: true },
        });
      }
      return updated;
    });

    if (!result) return res.status(200).json({ changed: false });
    return res.json({ changed: true, deal: result });
  })
);
