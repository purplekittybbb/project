import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { parseToolQuery } from "@/lib/tools/parse-query";
import {
  buildRateLimitSubject,
  checkAndIncrementToolUsage,
} from "@/lib/tools/guest-rate-limit";
import { isScraperToolId, type StandaloneToolId } from "@/lib/tools/registry";
import { runStandaloneTool } from "@/lib/tools/run-standalone";
import { getSubscriptionStatus } from "@/lib/iyzico/subscription";

export const runtime = "nodejs";
/** 3-page scrape + anti-bot delays; requires Vercel Pro for >60s. */
export const maxDuration = 120;

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

  // 202: the request is valid and will succeed on retry — this is not an
  // error, just "no scrape capacity this instant." Lets the frontend tell
  // a queued state apart from a real failure without parsing the body.
  const status = result.mode === "queued" ? 202 : 200;

  return NextResponse.json(
    {
      ...result,
      quota: {
        limit: quota.limit,
        remaining: quota.remaining,
        used: quota.used,
        enforced: quota.enforced,
      },
    },
    { status },
  );
}
