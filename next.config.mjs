/** @type {import('next').NextConfig} */

/**
 * Playwright-core ≥1.60 loads browsers.json via dynamic require(path.join(...)),
 * so @vercel/nft omits it unless explicitly traced. See:
 * https://github.com/microsoft/playwright/issues/41248
 */
const SCRAPER_TRACE_INCLUDES = [
  "./node_modules/playwright-core/**",
  "./node_modules/@sparticuz/chromium/**",
];

const nextConfig = {
  serverExternalPackages: ["@sparticuz/chromium", "playwright-core"],
  outputFileTracingIncludes: {
    "/api/tools/[toolId]": SCRAPER_TRACE_INCLUDES,
    "/api/tools/scraper-probe": SCRAPER_TRACE_INCLUDES,
    "/api/cron/scan-visibility": SCRAPER_TRACE_INCLUDES,
  },
  // Mirror secret-presence flags into the client bundle as booleans (never the
  // secrets themselves). Lets isShopifyLiveEnabled()/isAiConfigured() work in the UI.
  env: {
    SHOPIFY_LIVE_ENABLED: process.env.SHOPIFY_CLIENT_ID?.trim() ? "1" : "",
    AMAZON_LWA_LIVE_ENABLED:
      process.env.AMAZON_LWA_CLIENT_ID?.trim() && process.env.AMAZON_APPLICATION_ID?.trim() ? "1" : "",
    AI_CONFIGURED: (process.env.ANTHROPIC_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim()) ? "1" : "",
    STRIPE_LIVE_ENABLED:
      process.env.STRIPE_SECRET_KEY?.trim() && process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim()
        ? "1"
        : "",
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
