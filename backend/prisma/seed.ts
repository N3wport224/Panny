/**
 * Dev seed: a couple of Austin, TX stores plus one known penny deal so the
 * feed and scanner have data on first run.
 *   npx tsx prisma/seed.ts
 */
import { PrismaClient, Retailer, DealStatus } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const homeDepot = await prisma.store.upsert({
    where: { id: "seed-hd-austin-n" },
    update: {},
    create: {
      id: "seed-hd-austin-n",
      name: "Home Depot #6839 - Austin North",
      retailer: Retailer.HOME_DEPOT,
      address: "10515 N Mopac Expy",
      city: "Austin",
      state: "TX",
      zipCode: "78759",
      latitude: 30.39051,
      longitude: -97.7259,
    },
  });

  await prisma.store.upsert({
    where: { id: "seed-lowes-austin" },
    update: {},
    create: {
      id: "seed-lowes-austin",
      name: "Lowe's #1615 - Austin Central",
      retailer: Retailer.LOWES,
      address: "13000 N Interstate 35",
      city: "Austin",
      state: "TX",
      zipCode: "78753",
      latitude: 30.42077,
      longitude: -97.67083,
    },
  });

  const product = await prisma.product.upsert({
    where: { upc: "049206637887" },
    update: {},
    create: {
      upc: "049206637887",
      sku: "1004-512-887",
      title: "Husky 12-Piece SAE Wrench Set",
      imageUrl: "https://placehold.co/300x300?text=Wrench+Set",
      description: "Chrome vanadium steel wrench set with rack.",
    },
  });

  await prisma.deal.upsert({
    where: {
      productId_storeId: { productId: product.id, storeId: homeDepot.id },
    },
    update: {},
    create: {
      productId: product.id,
      storeId: homeDepot.id,
      price: 0.01,
      status: DealStatus.PENNY,
      upvotes: 4,
      downvotes: 0,
      lastVerifiedAt: new Date(),
    },
  });

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
