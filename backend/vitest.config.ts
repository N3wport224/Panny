import "dotenv/config"; // load DATABASE_URL from .env for the test run
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Integration tests share one database — run files sequentially so
    // truncation in one file can't race another file's fixtures.
    fileParallelism: false,
    environment: "node",
    include: ["src/**/*.test.ts"],
    // DB round-trips + the mocked 150ms external lookup add up.
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
