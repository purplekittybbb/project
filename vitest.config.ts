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
  },
});
