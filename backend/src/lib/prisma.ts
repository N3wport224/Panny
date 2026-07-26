import { PrismaClient } from "@prisma/client";

/**
 * Singleton Prisma client. In dev, `tsx watch` re-imports modules on hot
 * reload; caching the client on globalThis prevents exhausting the Postgres
 * connection pool with orphaned clients.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "production" ? ["error"] : ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
