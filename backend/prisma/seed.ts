/**
 * Dev seed: big-box stores around Lone Tree, CO plus a handful of penny
 * deals so the feed and scanner have data on first run.
 *   npx tsx prisma/seed.ts
 *
 * Coordinates are the real store locations, so distances shown in the app
 * are meaningful when you're testing from the Lone Tree area.
 */
import { PrismaClient, Retailer, DealStatus } from "@prisma/client";

const prisma = new PrismaClient();

// Wipe deal/catalog/store data so re-running the seed is authoritative
// (users are left alone). Dev-only — never run against real data.
async function resetSeedData() {
  await prisma.dealVote.deleteMany();
  await prisma.deal.deleteMany();
  await prisma.product.deleteMany();
  await prisma.store.deleteMany();
}

const STORES = [
  {
    id: "seed-hd-lone-tree",
    name: "Home Depot - Lone Tree",
    retailer: Retailer.HOME_DEPOT,
    address: "8477 S Yosemite St",
    city: "Lone Tree",
    state: "CO",
    zipCode: "80124",
    latitude: 39.5666,
    longitude: -104.8846,
  },
  {
    id: "seed-lowes-highlands-ranch",
    name: "Lowe's - Highlands Ranch",
    retailer: Retailer.LOWES,
    address: "1284 Sergeant Jon Stiles Dr",
    city: "Highlands Ranch",
    state: "CO",
    zipCode: "80129",
    latitude: 39.5433,
    longitude: -105.0105,
  },
  {
    id: "seed-walmart-parker",
    name: "Walmart Supercenter - Parker",
    retailer: Retailer.WALMART,
    address: "11101 S Parker Rd",
    city: "Parker",
    state: "CO",
    zipCode: "80134",
    latitude: 39.535,
    longitude: -104.7738,
  },
  {
    id: "seed-target-southglenn",
    name: "Target - SouthGlenn",
    retailer: Retailer.TARGET,
    address: "6767 S University Blvd",
    city: "Centennial",
    state: "CO",
    zipCode: "80122",
    latitude: 39.5936,
    longitude: -104.9591,
  },
];

const PRODUCTS = [
  {
    upc: "049206637887",
    sku: "1004-512-887",
    title: "Husky 12-Piece SAE Wrench Set",
    imageUrl: "https://placehold.co/300x300?text=Wrench+Set",
    description: "Chrome vanadium steel wrench set with rack.",
  },
  {
    upc: "033287191574",
    sku: "1002-119-334",
    title: "Ryobi ONE+ 18V Work Light (Tool Only)",
    imageUrl: "https://placehold.co/300x300?text=Work+Light",
    description: "Compact LED work light, battery not included.",
  },
  {
    upc: "046335684393",
    sku: "1009-771-205",
    title: "Glacier Bay 8 in. Widespread Bathroom Faucet",
    imageUrl: "https://placehold.co/300x300?text=Faucet",
    description: "Brushed nickel two-handle bathroom faucet.",
  },
  {
    upc: "819272020193",
    sku: "1001-450-662",
    title: "HDX 27 Gal. Storage Tote",
    imageUrl: "https://placehold.co/300x300?text=Storage+Tote",
    description: "Heavy-duty stackable storage tote with lid.",
  },
  {
    upc: "045242508273",
    sku: "1006-223-918",
    title: "Milwaukee Demolition Work Gloves (L)",
    imageUrl: "https://placehold.co/300x300?text=Work+Gloves",
    description: "Reinforced palm demolition gloves, size large.",
  },
];

// (upc, storeId, price, status, votes) — mostly penny finds, plus one
// regular markdown to show the feed correctly filters to PENNY only.
const DEALS: Array<{
  upc: string;
  storeId: string;
  price: number;
  status: DealStatus;
  upvotes: number;
  downvotes: number;
}> = [
  { upc: "049206637887", storeId: "seed-hd-lone-tree", price: 0.01, status: DealStatus.PENNY, upvotes: 6, downvotes: 0 },
  { upc: "033287191574", storeId: "seed-hd-lone-tree", price: 0.01, status: DealStatus.PENNY, upvotes: 3, downvotes: 1 },
  { upc: "046335684393", storeId: "seed-lowes-highlands-ranch", price: 0.01, status: DealStatus.PENNY, upvotes: 2, downvotes: 0 },
  { upc: "819272020193", storeId: "seed-walmart-parker", price: 0.01, status: DealStatus.PENNY, upvotes: 4, downvotes: 2 },
  { upc: "045242508273", storeId: "seed-target-southglenn", price: 0.01, status: DealStatus.PENNY, upvotes: 1, downvotes: 0 },
  // Markdown, not a penny — must NOT appear in the penny feed.
  { upc: "045242508273", storeId: "seed-hd-lone-tree", price: 3.03, status: DealStatus.ACTIVE, upvotes: 0, downvotes: 0 },
];

async function main() {
  await resetSeedData();

  await prisma.store.createMany({ data: STORES });
  await prisma.product.createMany({ data: PRODUCTS });

  const products = await prisma.product.findMany({
    select: { id: true, upc: true },
  });
  const idByUpc = new Map(products.map((p) => [p.upc, p.id]));

  await prisma.deal.createMany({
    data: DEALS.map((d) => ({
      productId: idByUpc.get(d.upc)!,
      storeId: d.storeId,
      price: d.price,
      status: d.status,
      upvotes: d.upvotes,
      downvotes: d.downvotes,
      lastVerifiedAt: new Date(),
    })),
  });

  console.log(
    `Seed complete: ${STORES.length} stores, ${PRODUCTS.length} products, ${DEALS.length} deals around Lone Tree, CO.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
