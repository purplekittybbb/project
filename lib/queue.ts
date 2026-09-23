/**
 * BullMQ scrape queue — Redis (ioredis) + Worker + Dead Letter Queue.
 *
 * Vercel API routes ONLY enqueue (never scrape). A long-running worker
 * (`npm run scrape-worker`) consumes jobs.
 *
 * Retry: exponential backoff 2s → 4s → 8s (attempts=4).
 * After all attempts fail → Dead Letter Queue (`truemargin-scrape-dlq`) for triage.
 *
 * Without REDIS_URL / UPSTASH_REDIS_URL the queue stays disabled.
 */

import { Queue, Worker, type Job, type JobsOptions } from "bullmq";
import IORedis from "ioredis";
import {
  SCRAPE_BACKOFF_BASE_MS,
  SCRAPE_JOB_ATTEMPTS,
  SCRAPE_JOB_BACKOFF,
} from "@/lib/queues/backoff";

export const SCRAPE_QUEUE_NAME = "truemargin-scrape";
/** Permanently failed scrape jobs land here for inspection (Dead Letter Pattern). */
export const SCRAPE_DLQ_NAME = "truemargin-scrape-dlq";

export type ScrapeJobToolId = "price-track" | "visibility" | "index-check" | "top100";

export type ScrapeJobPayload = {
  toolId: ScrapeJobToolId;
  marketplace: string;
  keyword: string;
  targetTitle?: string;
  reason?: "rate_limit_429" | "slot_full" | "cache_miss" | "manual";
};

/** Payload stored on the DLQ after retries are exhausted. */
export type DeadLetterPayload = ScrapeJobPayload & {
  originalJobId: string;
  originalQueue: string;
  failedReason: string;
  attemptsMade: number;
  failedAt: string;
  stacktrace?: string[];
};

export function getRedisUrl(): string | null {
  const url = process.env.REDIS_URL?.trim() || process.env.UPSTASH_REDIS_URL?.trim();
  return url && url.length > 0 ? url : null;
}

export function isRedisConfigured(): boolean {
  return getRedisUrl() != null;
}

/** Shared ioredis connection for Queue + Worker (BullMQ requires maxRetriesPerRequest: null). */
export function createRedisConnection(): IORedis | null {
  const url = getRedisUrl();
  if (!url) return null;
  return new IORedis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}

let queueSingleton: Queue<ScrapeJobPayload> | null = null;
let dlqSingleton: Queue<DeadLetterPayload> | null = null;
let workerSingleton: Worker<ScrapeJobPayload> | null = null;
let queueConnection: IORedis | null = null;

export function getScrapeQueue(): Queue<ScrapeJobPayload> | null {
  if (!isRedisConfigured()) return null;
  if (queueSingleton) return queueSingleton;

  queueConnection = createRedisConnection();
  if (!queueConnection) return null;

  queueSingleton = new Queue<ScrapeJobPayload>(SCRAPE_QUEUE_NAME, {
    connection: queueConnection,
    defaultJobOptions: {
      attempts: SCRAPE_JOB_ATTEMPTS,
      backoff: SCRAPE_JOB_BACKOFF,
      removeOnComplete: 100,
      // Keep a short failed trail on the primary queue; permanent copy goes to DLQ.
      removeOnFail: 50,
    },
  });
  return queueSingleton;
}

/**
 * Dead-letter queue — jobs that exhausted all retries.
 * Kept indefinitely (no removeOnComplete) so ops can inspect / requeue.
 */
export function getDeadLetterQueue(): Queue<DeadLetterPayload> | null {
  if (!isRedisConfigured()) return null;
  if (dlqSingleton) return dlqSingleton;

  const connection = queueConnection ?? createRedisConnection();
  if (!connection) return null;
  queueConnection = connection;

  dlqSingleton = new Queue<DeadLetterPayload>(SCRAPE_DLQ_NAME, {
    connection,
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: false,
      removeOnFail: false,
    },
  });
  return dlqSingleton;
}

/**
 * True when this failure is the final attempt (no more BullMQ retries).
 * Exported for unit tests.
 */
export function isFinalAttempt(job: Pick<Job, "attemptsMade" | "opts">): boolean {
  const max = job.opts.attempts ?? SCRAPE_JOB_ATTEMPTS;
  return job.attemptsMade >= max;
}

/**
 * Enqueue a permanently failed scrape job onto the DLQ for later inspection.
 */
export async function moveToDeadLetter(
  job: Job<ScrapeJobPayload>,
  err: Error,
): Promise<{ ok: true; dlqJobId: string } | { ok: false; reason: string }> {
  const dlq = getDeadLetterQueue();
  if (!dlq) return { ok: false, reason: "redis_unavailable" };

  const payload: DeadLetterPayload = {
    ...job.data,
    originalJobId: String(job.id),
    originalQueue: SCRAPE_QUEUE_NAME,
    failedReason: err.message || job.failedReason || "unknown",
    attemptsMade: job.attemptsMade,
    failedAt: new Date().toISOString(),
    stacktrace: job.stacktrace?.length ? [...job.stacktrace] : undefined,
  };

  const dlqJob = await dlq.add(`dlq:${job.data.toolId}:${job.data.marketplace}`, payload, {
    jobId: `dlq-${job.id}-${Date.now()}`,
  });

  console.error(
    "[queue] dead-letter originalId=%s dlqId=%s tool=%s reason=%s",
    job.id,
    dlqJob.id,
    job.data.toolId,
    payload.failedReason,
  );

  return { ok: true, dlqJobId: String(dlqJob.id) };
}

export type DeadLetterListItem = {
  id: string;
  toolId: string;
  marketplace: string;
  keyword: string;
  originalJobId: string;
  failedReason: string;
  attemptsMade: number;
  failedAt: string;
};

/** List recent dead-letter jobs for admin triage. */
export async function listDeadLetterJobs(limit = 50): Promise<DeadLetterListItem[]> {
  const dlq = getDeadLetterQueue();
  if (!dlq) return [];

  const jobs = await dlq.getJobs(["waiting", "delayed", "completed", "failed"], 0, Math.max(0, limit - 1));
  return jobs.map((j) => {
    const d = j.data;
    return {
      id: String(j.id),
      toolId: d.toolId,
      marketplace: d.marketplace,
      keyword: d.keyword,
      originalJobId: d.originalJobId,
      failedReason: d.failedReason,
      attemptsMade: d.attemptsMade,
      failedAt: d.failedAt,
    };
  });
}

/**
 * Enqueue a scrape job. Returns immediately — the worker runs the browser scrape.
 */
export async function enqueueScrapeJob(
  payload: ScrapeJobPayload,
  opts?: JobsOptions,
): Promise<{ queued: true; jobId: string } | { queued: false; reason: string }> {
  const q = getScrapeQueue();
  if (!q) return { queued: false, reason: "redis_unavailable" };

  const job = await q.add(`${payload.toolId}:${payload.marketplace}`, payload, {
    attempts: SCRAPE_JOB_ATTEMPTS,
    backoff: SCRAPE_JOB_BACKOFF,
    ...opts,
  });
  return { queued: true, jobId: String(job.id) };
}

export type ScrapeJobStatus =
  | {
      ok: true;
      state: "waiting" | "active" | "delayed" | "paused" | "prioritized";
      payload: ScrapeJobPayload;
    }
  | {
      ok: true;
      state: "completed";
      payload: ScrapeJobPayload;
      finishedOn: number | null;
    }
  | {
      ok: true;
      state: "failed";
      payload: ScrapeJobPayload;
      failedReason: string;
      attemptsMade: number;
    }
  | { ok: false; reason: "not_found" | "redis_unavailable" };

/**
 * Poll a scrape job by BullMQ id — used by GET /api/tools/[toolId]?jobId=.
 */
export async function getScrapeJobStatus(jobId: string): Promise<ScrapeJobStatus> {
  const q = getScrapeQueue();
  if (!q) return { ok: false, reason: "redis_unavailable" };

  const job = await q.getJob(jobId);
  if (!job) return { ok: false, reason: "not_found" };

  const state = await job.getState();
  const payload = job.data;

  if (state === "completed") {
    return { ok: true, state: "completed", payload, finishedOn: job.finishedOn ?? null };
  }
  if (state === "failed") {
    return {
      ok: true,
      state: "failed",
      payload,
      failedReason: job.failedReason || "Tarama başarısız oldu.",
      attemptsMade: job.attemptsMade,
    };
  }
  if (state === "active") {
    return { ok: true, state: "active", payload };
  }
  if (state === "delayed") {
    return { ok: true, state: "delayed", payload };
  }
  if (state === "prioritized") {
    return { ok: true, state: "prioritized", payload };
  }

  // waiting | waiting-children | unknown | paused — keep UI polling.
  return { ok: true, state: "waiting", payload };
}

export type QueueCounts = {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
};

export async function getScrapeQueueCounts(): Promise<
  | { ok: true; redis: true; name: string; counts: QueueCounts; dlqWaiting: number }
  | { ok: true; redis: false; name: string; counts: null; dlqWaiting: null; message: string }
  | { ok: false; error: string }
> {
  if (!isRedisConfigured()) {
    return {
      ok: true,
      redis: false,
      name: SCRAPE_QUEUE_NAME,
      counts: null,
      dlqWaiting: null,
      message: "REDIS_URL yok — BullMQ kapalı; Postgres scrape_leases kullanılıyor.",
    };
  }
  try {
    const q = getScrapeQueue();
    if (!q) {
      return {
        ok: true,
        redis: false,
        name: SCRAPE_QUEUE_NAME,
        counts: null,
        dlqWaiting: null,
        message: "Kuyruk başlatılamadı.",
      };
    }
    const counts = await q.getJobCounts(
      "waiting",
      "active",
      "completed",
      "failed",
      "delayed",
      "paused",
    );
    const dlq = getDeadLetterQueue();
    const dlqCounts = dlq ? await dlq.getJobCounts("waiting", "completed", "failed") : null;
    const dlqWaiting =
      (dlqCounts?.waiting ?? 0) + (dlqCounts?.completed ?? 0) + (dlqCounts?.failed ?? 0);

    return {
      ok: true,
      redis: true,
      name: SCRAPE_QUEUE_NAME,
      counts: {
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        completed: counts.completed ?? 0,
        failed: counts.failed ?? 0,
        delayed: counts.delayed ?? 0,
        paused: counts.paused ?? 0,
      },
      dlqWaiting,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Process one scrape job (browser + cache write). Throws on failure so BullMQ retries.
 */
export async function processScrapeJob(job: Job<ScrapeJobPayload>): Promise<void> {
  const { processQueuedScrape } = await import("@/lib/tools/process-queued-scrape");
  await processQueuedScrape(job.data);
}

/**
 * Start the BullMQ worker (long-running process — not for Vercel serverless handlers).
 */
export function startScrapeWorker(): Worker<ScrapeJobPayload> | null {
  if (workerSingleton) return workerSingleton;
  const connection = createRedisConnection();
  if (!connection) {
    console.warn("[queue] REDIS_URL missing — scrape worker not started");
    return null;
  }

  // Ensure DLQ exists when the worker starts.
  getDeadLetterQueue();

  workerSingleton = new Worker<ScrapeJobPayload>(
    SCRAPE_QUEUE_NAME,
    async (job) => {
      console.info(
        "[queue] job start id=%s tool=%s marketplace=%s attempt=%d",
        job.id,
        job.data.toolId,
        job.data.marketplace,
        job.attemptsMade + 1,
      );
      await processScrapeJob(job);
    },
    {
      connection,
      concurrency: 1,
    },
  );

  workerSingleton.on("completed", (job) => {
    console.info("[queue] job completed id=%s", job.id);
  });

  workerSingleton.on("failed", (job, err) => {
    if (!job) {
      console.error("[queue] job failed (no job ref) err=%s", err.message);
      return;
    }
    console.error(
      "[queue] job failed id=%s attempt=%s/%s err=%s",
      job.id,
      job.attemptsMade,
      job.opts.attempts ?? SCRAPE_JOB_ATTEMPTS,
      err.message,
    );

    // Dead Letter Pattern: only after the last retry.
    if (isFinalAttempt(job)) {
      void moveToDeadLetter(job, err).catch((dlqErr) => {
        console.error("[queue] DLQ write failed:", dlqErr);
      });
    }
  });

  console.info(
    "[queue] worker listening on %s (backoff %dms ×2, attempts=%d, dlq=%s)",
    SCRAPE_QUEUE_NAME,
    SCRAPE_BACKOFF_BASE_MS,
    SCRAPE_JOB_ATTEMPTS,
    SCRAPE_DLQ_NAME,
  );

  return workerSingleton;
}

export async function stopScrapeWorker(): Promise<void> {
  if (workerSingleton) {
    await workerSingleton.close();
    workerSingleton = null;
  }
}

/** Test helper — reset singletons between unit tests. */
export function __resetScrapeQueueForTests(): void {
  queueSingleton = null;
  dlqSingleton = null;
  workerSingleton = null;
  queueConnection = null;
}
