import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { runVisibilityScan } from "@/lib/visibility/run-scan";

/**
 * POST /api/visibility/scan   { marketplace: "trendyol" | "hepsiburada" | "n11" }
 *
 * User-triggered visibility scan — the "Görünürlüğü tara" button. Scans the
 * signed-in seller's OWN SKUs for their current search rank and stores the
 * result (visibility_watches/checks), which is what makes the dashboard's
 * "kendi ürünlerinizin sırası" actually populate. Same core as the cron.
 *
 * Auth: the signed-in user's cookie session identifies WHO; a service-role
 * client then performs the scan (it must write the shared + personal tables).
 * Natural rate limit: run-scan's freshness queue skips SKUs scanned recently,
 * so repeated presses simply return nothingDue instead of re-scraping.
 */
export const runtime = "nodejs";
export const maxDuration = 300;

function serviceRoleClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function POST(req: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnon) {
    return NextResponse.json({ error: "Supabase yapılandırılmamış." }, { status: 500 });
  }

  // ── Identify the signed-in user from their cookie session ────────────────
  const cookieStore = await cookies();
  const authClient = createServerClient(supabaseUrl, supabaseAnon, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll() { /* route handler — no cookie mutation needed */ },
    },
  });
  const { data: userData } = await authClient.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  }

  // ── Parse marketplace ────────────────────────────────────────────────────
  let marketplace: string;
  try {
    const body = (await req.json()) as { marketplace?: string };
    marketplace = body.marketplace ?? "";
  } catch {
    return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  }
  if (!["trendyol", "hepsiburada", "n11"].includes(marketplace)) {
    return NextResponse.json(
      { error: "Görünürlük taraması yalnızca Trendyol, Hepsiburada ve N11 için desteklenir." },
      { status: 400 },
    );
  }

  const service = serviceRoleClient();
  if (!service) {
    return NextResponse.json({ error: "Sunucu yapılandırması eksik." }, { status: 500 });
  }

  const result = await runVisibilityScan(service, { userId, marketplace });
  return NextResponse.json(result);
}
