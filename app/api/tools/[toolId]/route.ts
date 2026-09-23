import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { parseToolQuery } from "@/lib/tools/parse-query";
import {
  buildRateLimitSubject,
  checkAndIncrementToolUsage,
  refundToolUsage,
} from "@/lib/tools/guest-rate-limit";
import { isScraperToolId, type StandaloneToolId } from "@/lib/tools/registry";
import { resolveQueuedScrapeJob } from "@/lib/tools/resolve-queued-job";
import { runStandaloneTool } from "@/lib/tools/run-standalone";
import { isUsableStandaloneResult } from "@/lib/tools/usable-result";
import { getSubscriptionStatus } from "@/lib/iyzico/subscription";

export const runtime = "nodejs";
/** Cache hit or enqueue only — live scrape runs in the BullMQ worker. */
export const maxDuration = 30;

interface RouteContext {
  params: Promise<{ toolId: string }>;
}

async function getOptionalUser(): Promise<{ userId: string | null; supabase: SupabaseClient | null }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnon) return { userId: null, supabase: null };

  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseAnon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll() {
        // Route handler — session refresh handled by middleware on page routes.
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  return { userId: data.user?.id ?? null, supabase };
}

/**
 * True when a signed-in user has an active/trialing subscription.
 * Best-effort: any failure degrades to `false` (free-tier limit), never
 * throws — this must never block a standalone-tool query from running.
 */
async function isPaidUser(supabase: SupabaseClient | null, userId: string | null): Promise<boolean> {
  if (!supabase || !userId) return false;
  try {
    const sub = await getSubscriptionStatus(supabase, userId);
    return sub.hasAccess;
  } catch {
    return false;
  }
}

function extractQueuedJobId(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const jobId = (data as { jobId?: unknown }).jobId;
  return typeof jobId === "string" && jobId.length > 0 ? jobId : null;
}

/**
 * Poll an enqueued scrape job. No rate-limit increment — the POST that created
 * the job already held a quota unit. Permanent failures refund.
 */
export async function GET(req: Request, context: RouteContext) {
  const { toolId: rawToolId } = await context.params;
  const toolId = rawToolId as Exclude<StandaloneToolId, "profit-calc">;

  if (!isScraperToolId(toolId)) {
    return NextResponse.json({ error: "Bilinmeyen veya mağaza gerektiren araç." }, { status: 404 });
  }

  const jobId = new URL(req.url).searchParams.get("jobId")?.trim();
  if (!jobId) {
    return NextResponse.json(
      { error: "jobId gerekli. Önce POST ile sorgu gönderin." },
      { status: 400 },
    );
  }

  const resolved = await resolveQueuedScrapeJob(toolId, jobId);
  if (resolved.status === "error") {
    if (resolved.shouldRefund) {
      const { userId } = await getOptionalUser();
      const subject = buildRateLimitSubject(req.headers, userId);
      await refundToolUsage(toolId, subject);
    }
    return NextResponse.json({ error: resolved.error }, { status: resolved.httpStatus });
  }

  if (resolved.shouldRefund) {
    const { userId } = await getOptionalUser();
    const subject = buildRateLimitSubject(req.headers, userId);
    await refundToolUsage(toolId, subject);
  }

  return NextResponse.json(resolved.envelope, { status: 200 });
}

export async function POST(req: Request, context: RouteContext) {
  const { toolId: rawToolId } = await context.params;
  const toolId = rawToolId as Exclude<StandaloneToolId, "profit-calc">;

  if (!isScraperToolId(toolId)) {
    return NextResponse.json({ error: "Bilinmeyen veya mağaza gerektiren araç." }, { status: 404 });
  }

  let body: { query?: string; marketplace?: string };
  try {
    body = (await req.json()) as { query?: string; marketplace?: string };
  } catch {
    return NextResponse.json({ error: "Geçersiz JSON." }, { status: 400 });
  }

  const query = body.query?.trim();
  if (!query || query.length < 2) {
    return NextResponse.json(
      { error: "Ürün adı, anahtar kelime veya pazaryeri linki girin (en az 2 karakter)." },
      { status: 400 },
    );
  }

  const { userId, supabase } = await getOptionalUser();
  const paid = await isPaidUser(supabase, userId);
  const subject = buildRateLimitSubject(req.headers, userId);
  const quota = await checkAndIncrementToolUsage(toolId, subject, undefined, paid);

  if (!quota.allowed) {
    return NextResponse.json(
      {
        error: "Günlük ücretsiz sorgu limitine ulaştınız.",
        limit: quota.limit,
        used: quota.used,
        upgradeHint: paid
          ? null
          : userId
            ? "Daha fazla sorgu için Profesyonel pakete geçin."
            : "Daha fazla sorgu için giriş yapın veya yarın tekrar deneyin.",
      },
      { status: 429 },
    );
  }

  const parsed = parseToolQuery(query, body.marketplace);
  const result = await runStandaloneTool(toolId, parsed);

  let quotaOut = {
    limit: quota.limit,
    remaining: quota.remaining,
    used: quota.used,
    enforced: quota.enforced,
  };

  // Free-tier honesty: don't charge empty / blocked / preview results.
  // In-flight queue jobs WITH jobId keep the charge (poll delivers or refunds).
  // Slot-full queued without jobId still refunds so retries aren't free forever.
  const queuedJobId = result.mode === "queued" ? extractQueuedJobId(result.data) : null;
  const holdQuotaForJob = Boolean(queuedJobId);
  if (quota.enforced && !isUsableStandaloneResult(toolId, result) && !holdQuotaForJob) {
    await refundToolUsage(toolId, subject);
    quotaOut = {
      ...quotaOut,
      used: Math.max(0, quota.used - 1),
      remaining: Math.min(quota.limit, quota.remaining + 1),
    };
  }

  // Always 200: cache hit, enqueue ack, or short sync fallback.
  return NextResponse.json(
    {
      ...result,
      quota: quotaOut,
    },
    { status: 200 },
  );
}
