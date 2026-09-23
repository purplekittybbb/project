import { NextResponse } from "next/server";
import {
  getScrapeQueueCounts,
  getScrapeQueue,
  listDeadLetterJobs,
  SCRAPE_QUEUE_NAME,
  SCRAPE_DLQ_NAME,
} from "@/lib/queue";
import { isRedisConfigured } from "@/lib/queue";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * GET /api/admin/queues
 *
 * BullMQ + DLQ + (fallback) Postgres scrape_leases snapshot.
 * Auth: Authorization: Bearer ${CRON_SECRET}
 */

export const runtime = "nodejs";

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

async function leaseSnapshot() {
  const supabase = createServiceRoleClient();
  if (!supabase) return { available: false as const, rows: [] as unknown[] };
  const { data, error } = await supabase.from("scrape_leases").select("marketplace, started_at");
  if (error) return { available: false as const, rows: [], error: error.message };
  return { available: true as const, rows: data ?? [] };
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const bull = await getScrapeQueueCounts();
  const leases = await leaseSnapshot();

  let recentFailed: Array<{ id: string; failedReason?: string; attemptsMade?: number }> = [];
  let deadLetters: Awaited<ReturnType<typeof listDeadLetterJobs>> = [];

  if (isRedisConfigured()) {
    try {
      const q = getScrapeQueue();
      if (q) {
        const failed = await q.getJobs(["failed"], 0, 19);
        recentFailed = failed.map((j) => ({
          id: String(j.id),
          failedReason: j.failedReason,
          attemptsMade: j.attemptsMade,
        }));
      }
      deadLetters = await listDeadLetterJobs(40);
    } catch {
      /* ignore — counts still useful */
    }
  }

  return NextResponse.json({
    queueName: SCRAPE_QUEUE_NAME,
    dlqName: SCRAPE_DLQ_NAME,
    redisConfigured: isRedisConfigured(),
    bullmq: bull,
    postgresLeases: leases,
    recentFailed,
    deadLetters,
    backoff: { baseMs: 2000, factor: 2, sequence: [2000, 4000, 8000] },
  });
}
