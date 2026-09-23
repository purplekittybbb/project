import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { parseToolQuery } from "@/lib/tools/parse-query";
import {
  buildRateLimitSubject,
  checkAndIncrementToolUsage,
  refundToolUsage,
  refundToolUsageOnce,
  type RateLimitSubject,
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

async function resolveRefundSubject(
  preferred: RateLimitSubject | null,
  req: Request,
): Promise<RateLimitSubject> {
  if (preferred) return preferred;
  const { userId } = await getOptionalUser();
  return buildRateLimitSubject(req.headers, userId);
}

/**
 * Poll an enqueued scrape job. No rate-limit increment — the POST that created
 * the job already held a quota unit. Permanent failures refund once (idempotent).
 */
export async function GET(req: Request, context: RouteContext) {
  const { toolId: rawToolId } = await context.params;
  const toolId = rawToolId as Exclude<StandaloneToolId, "profit-calc">;

  if (!isScraperToolId(toolId)) {
    return NextResponse.json({ error: "Bilinmeyen veya mağaza gerektiren araç." }, { status: 404 });
  }

  const url = new URL(req.url);
  const jobId = url.searchParams.get("jobId")?.trim();
  const abandon = url.searchParams.get("abandon") === "1";
  if (!jobId) {
    return NextResponse.json(
      { error: "jobId gerekli. Önce POST ile sorgu gönderin." },
      { status: 400 },
    );
  }

  let resolved;
  try {
    resolved = await resolveQueuedScrapeJob(toolId, jobId, { abandon });
  } catch (err) {
    console.error("[tools GET] resolve failed:", err);
    return NextResponse.json({ error: "Kuyruk durumu okunamadı. Birazdan tekrar deneyin." }, { status: 503 });
  }

  if (resolved.shouldRefund) {
    const subject = await resolveRefundSubject(resolved.refundSubject, req);
    await refundToolUsageOnce(toolId, subject, jobId);
  }

  if (resolved.status === "error") {
    return NextResponse.json({ error: resolved.error }, { status: resolved.httpStatus });
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

  let result;
  try {
    result = await runStandaloneTool(toolId, parsed, { quotaSubject: subject });
  } catch (err) {
    console.error("[tools POST] run failed:", err);
    if (quota.enforced) await refundToolUsage(toolId, subject);
    return NextResponse.json(
      {
        error: "Şu an tarayamadık. Birazdan tekrar deneyin.",
        quota: {
          limit: quota.limit,
          remaining: Math.min(quota.limit, quota.remaining + (quota.enforced ? 1 : 0)),
          used: Math.max(0, quota.used - (quota.enforced ? 1 : 0)),
          enforced: quota.enforced,
        },
      },
      { status: 200 },
    );
  }

  let quotaOut = {
    limit: quota.limit,
    remaining: quota.remaining,
    used: quota.used,
    enforced: quota.enforced,
  };

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

  return NextResponse.json(
    {
      ...result,
      quota: quotaOut,
    },
    { status: 200 },
  );
}
