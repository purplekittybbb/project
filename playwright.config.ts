import { defineConfig, devices } from "@playwright/test";

/**
 * Experience smoke — catches 404s, fake-social-proof regressions, and
 * broken first-value routes. Pixel diffs live in a later pass.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  fullyParallel: true,
  retries: 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "off",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "phone", use: { ...devices["iPhone 12"], viewport: { width: 375, height: 812 } } },
  ],
});
