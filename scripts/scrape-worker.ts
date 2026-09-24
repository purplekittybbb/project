/**
 * Long-running BullMQ scrape worker.
 *
 * Usage:
 *   REDIS_URL=redis://... npm run scrape-worker
 *
 * Vercel API routes only enqueue; this process opens Playwright and writes
 * results to the shared Supabase cache. Retries use 2s → 4s → 8s backoff.
 */

import { startScrapeWorker, isRedisConfigured } from "../lib/queue";
import { startMarketplaceSyncWorker } from "../lib/queues/marketplace-sync-queue";

async function main(): Promise<void> {
  if (!isRedisConfigured()) {
    console.error("[scrape-worker] Set REDIS_URL or UPSTASH_REDIS_URL before starting.");
    process.exit(1);
  }

  const scrapeWorker = startScrapeWorker();
  const syncWorker = startMarketplaceSyncWorker();
  if (!scrapeWorker) {
    console.error("[scrape-worker] Failed to start scrape worker.");
    process.exit(1);
  }

  const shutdown = async (signal: string) => {
    console.info("[scrape-worker] %s — closing…", signal);
    await scrapeWorker.close();
    if (syncWorker) await syncWorker.close();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

void main();
