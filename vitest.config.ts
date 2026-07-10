import { defineConfig } from "vitest/config";

/**
 * Scope test discovery to the merged engine tests under /tests only.
 * (Excludes the legacy truemargin-core/ subproject, which is being phased out.)
 */
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
