/** @type {import('next').NextConfig} */
const nextConfig = {
  // Mirror secret-presence flags into the client bundle as booleans (never the
  // secrets themselves). Lets isShopifyLiveEnabled()/isAiConfigured() work in the UI.
  env: {
    SHOPIFY_LIVE_ENABLED: process.env.SHOPIFY_CLIENT_ID?.trim() ? "1" : "",
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
}

export default nextConfig
