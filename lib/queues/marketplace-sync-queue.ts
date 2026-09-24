/**
 * BullMQ marketplace sync queue — protects /api/marketplace/resync under load.
 * API enqueues; worker decrypts credentials and runs resyncMarketplace.
 */

import { Queue, Worker, type JobsOptions } from "bullmq";
import {
  createRedisConnection,
  isRedisConfigured,
} from "@/lib/queue";
import {
  SCRAPE_JOB_ATTEMPTS,
  SCRAPE_JOB_BACKOFF,
} from "@/lib/queues/backoff";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { resyncMarketplace, isResyncableMarketplace } from "@/lib/marketplace-resync";

export const MARKETPLACE_SYNC_QUEUE_NAME = "truemargin-marketplace-sync";

export type MarketplaceSyncJobPayload = {
  userId: string;
  marketplace: string;
};

let syncQueue: Queue<MarketplaceSyncJobPayload> | null = null;
let syncWorker: Worker<MarketplaceSyncJobPayload> | null = null;

export function getMarketplaceSyncQueue(): Queue<MarketplaceSyncJobPayload> | null {
  if (!isRedisConfigured()) return null;
  if (syncQueue) return syncQueue;
  const connection = createRedisConnection();
  if (!connection) return null;
  syncQueue = new Queue<MarketplaceSyncJobPayload>(MARKETPLACE_SYNC_QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 200,
    },
  });
  return syncQueue;
}

export async function enqueueMarketplaceSync(
  payload: MarketplaceSyncJobPayload,
  opts?: JobsOptions,
): Promise<{ queued: true; jobId: string } | { queued: false; reason: string }> {
  if (!isResyncableMarketplace(payload.marketplace)) {
    return { queued: false, reason: "invalid_marketplace" };
  }
  const q = getMarketplaceSyncQueue();
  if (!q) return { queued: false, reason: "redis_unavailable" };

  const job = await q.add(
    `sync:${payload.marketplace}:${payload.userId}`,
    payload,
    {
      attempts: SCRAPE_JOB_ATTEMPTS,
      backoff: SCRAPE_JOB_BACKOFF,
      jobId: `sync-${payload.userId}-${payload.marketplace}-${Date.now()}`,
      ...opts,
    },
  );
  return { queued: true, jobId: String(job.id) };
}

export async function getMarketplaceSyncJobStatus(jobId: string): Promise<
  | { ok: true; state: string; result?: unknown }
  | { ok: false; reason: "not_found" | "redis_unavailable" }
> {
  const q = getMarketplaceSyncQueue();
  if (!q) return { ok: false, reason: "redis_unavailable" };
  const job = await q.getJob(jobId);
  if (!job) return { ok: false, reason: "not_found" };
  const state = await job.getState();
  if (state === "completed") {
    return { ok: true, state, result: job.returnvalue };
  }
  return { ok: true, state };
}

export function startMarketplaceSyncWorker(): Worker<MarketplaceSyncJobPayload> | null {
  if (!isRedisConfigured()) return null;
  if (syncWorker) return syncWorker;

  const connection = createRedisConnection();
  if (!connection) return null;

  const concurrency = Math.max(1, Number(process.env.SYNC_WORKER_CONCURRENCY) || 2);

  syncWorker = new Worker<MarketplaceSyncJobPayload>(
    MARKETPLACE_SYNC_QUEUE_NAME,
    async (job) => {
      const svc = createServiceRoleClient();
      if (!svc) throw new Error("Service role unavailable");
      const { userId, marketplace } = job.data;
      if (!isResyncableMarketplace(marketplace)) {
        throw new Error(`Invalid marketplace: ${marketplace}`);
      }
      const result = await resyncMarketplace(svc, userId, marketplace);
      if (!result.success) {
        throw new Error(result.error ?? "Resync failed");
      }
      return result;
    },
    { connection, concurrency },
  );

  syncWorker.on("failed", (job, err) => {
    console.error(
      "[marketplace-sync-worker] job %s failed: %s",
      job?.id,
      err.message,
    );
  });

  console.info(
    "[marketplace-sync-worker] listening on %s (concurrency=%d)",
    MARKETPLACE_SYNC_QUEUE_NAME,
    concurrency,
  );
  return syncWorker;
}
