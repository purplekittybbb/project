import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { parseToolQuery } from "@/lib/tools/parse-query";
import {
  buildRateLimitSubject,
  checkAndIncrementToolUsage,
} from "@/lib/tools/guest-rate-limit";
import { isScraperToolId, type StandaloneToolId } from "@/lib/tools/registry";
import { runStandaloneTool } from "@/lib/tools/run-standalone";

export const runtime = "nodejs";
/** 3-page scrape + anti-bot delays; requires Vercel Pro for >60s. */
export const maxDuration = 120;

interface RouteContext {
  params: Promise<{ toolId: string }>;
}

async function getOptionalUserId(): Promise<string | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnon) return null;

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
  return data.user?.id ?? null;
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

  const userId = await getOptionalUserId();
  const subject = buildRateLimitSubject(req.headers, userId);
  const quota = await checkAndIncrementToolUsage(toolId, subject);

  if (!quota.allowed) {
    return NextResponse.json(
      {
        error: "Günlük ücretsiz sorgu limitine ulaştınız.",
        limit: quota.limit,
        used: quota.used,
        upgradeHint: userId ? null : "Daha fazla sorgu için giriş yapın veya yarın tekrar deneyin.",
      },
      { status: 429 },
    );
  }

  const parsed = parseToolQuery(query, body.marketplace);
  const result = await runStandaloneTool(toolId, parsed);

  return NextResponse.json({
    ...result,
    quota: {
      limit: quota.limit,
      remaining: quota.remaining,
      used: quota.used,
      enforced: quota.enforced,
    },
  });
}
