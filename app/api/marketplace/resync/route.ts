import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resyncMarketplace, isResyncableMarketplace } from "@/lib/marketplace-resync";
import {
  enqueueMarketplaceSync,
  getMarketplaceSyncJobStatus,
} from "@/lib/queues/marketplace-sync-queue";
import { isRedisConfigured } from "@/lib/queue";

/**
 * POST /api/marketplace/resync — enqueue when Redis is up; otherwise inline.
 * GET  /api/marketplace/resync?jobId= — poll queued sync status.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

interface ResyncRequestBody {
  marketplace?: string;
}

function userScopedClient(accessToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function requireUser(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!accessToken) return { error: NextResponse.json({ error: "Oturum bulunamadı." }, { status: 401 }) };
  const supabase = userScopedClient(accessToken);
  if (!supabase) return { error: NextResponse.json({ error: "Supabase yapılandırılmamış." }, { status: 500 }) };
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { error: NextResponse.json({ error: "Oturum geçersiz." }, { status: 401 }) };
  }
  return { supabase, userId: userData.user.id };
}

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if ("error" in auth && auth.error) return auth.error;

  const jobId = new URL(req.url).searchParams.get("jobId")?.trim();
  if (!jobId) {
    return NextResponse.json({ error: "jobId gerekli." }, { status: 400 });
  }

  const status = await getMarketplaceSyncJobStatus(jobId);
  if (!status.ok) {
    return NextResponse.json(
      { error: status.reason === "not_found" ? "İş bulunamadı." : "Kuyruk kapalı." },
      { status: status.reason === "not_found" ? 404 : 503 },
    );
  }

  if (status.state === "completed") {
    return NextResponse.json({ status: "completed", result: status.result, mode: "queued" });
  }
  if (status.state === "failed") {
    return NextResponse.json({ status: "failed", mode: "queued" }, { status: 502 });
  }
  return NextResponse.json({
    status: status.state,
    mode: "queued",
    message: "İşleminiz sıraya alındı — mağaza senkronu devam ediyor.",
    retryAfterSeconds: 3,
  });
}

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if ("error" in auth && auth.error) return auth.error;
  const { supabase, userId } = auth as {
    supabase: NonNullable<ReturnType<typeof userScopedClient>>;
    userId: string;
  };

  let body: ResyncRequestBody;
  try {
    body = (await req.json()) as ResyncRequestBody;
  } catch {
    return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  }

  const marketplace = body.marketplace?.trim();
  if (!marketplace || !isResyncableMarketplace(marketplace)) {
    return NextResponse.json({ error: "Geçerli bir marketplace gerekli." }, { status: 400 });
  }

  if (isRedisConfigured()) {
    const enq = await enqueueMarketplaceSync({ userId, marketplace });
    if (enq.queued) {
      return NextResponse.json({
        success: true,
        mode: "queued",
        jobId: enq.jobId,
        message: "İşleminiz sıraya alındı. Mağaza verileriniz arka planda güncelleniyor.",
        retryAfterSeconds: 3,
      });
    }
  }

  const result = await resyncMarketplace(supabase, userId, marketplace);
  if (!result.success) {
    return NextResponse.json(result, { status: result.authError ? 401 : 502 });
  }
  return NextResponse.json({ ...result, mode: "inline" });
}
