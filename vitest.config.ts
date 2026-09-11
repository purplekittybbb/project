import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Scope test discovery to the merged engine tests under /tests only.
 * (Excludes the legacy truemargin-core/ subproject, which is being phased out.)
 */
export default defineConfig({
  resolve: {
    // Mirrors tsconfig.json's "@/*" path mapping so tests can import
    // app/api/**/route.ts files (which use "@/lib/..." imports) directly,
    // the same way Next.js itself resolves them.
    alias: { "@": path.resolve(__dirname, ".") },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    // Disable real scrape delays in tests — visibility scraper reads these env vars.
    // Production: SCRAPE_DELAY_MIN_MS / SCRAPE_DELAY_MAX_MS (default 2000–5000 ms).
    env: {
      SCRAPE_DELAY_MIN_MS: "0",
      SCRAPE_DELAY_MAX_MS: "0",
    },
    coverage: {
      provider: "v8",
      // Coverage is gated on the pure financial/demand/quality cores only. These are
      // deterministic computation modules that MUST stay fully exercised; the rest of
      // the app (UI, Next.js routes, adapters, scrapers) is not held to this bar yet.
      include: ["lib/calc/**/*.ts", "lib/demand/**/*.ts", "lib/quality/**/*.ts"],
      // Exclude skeleton/stub files — these are design placeholders that intentionally
      // throw NotImplementedError and have no test coverage by spec.
      exclude: ["lib/demand/top100.ts", "lib/quality/barcode.ts"],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
});
