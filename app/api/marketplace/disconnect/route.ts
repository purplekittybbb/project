import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/marketplace/disconnect
 *
 * The real, server-side half of "Disconnect" — until now the only disconnect
 * button (on /connect) just cleared a localStorage flag and left the row in
 * `marketplace_credentials` (and any synced rows in `user_transactions`)
 * untouched. This route actually DELETEs the stored credential row for the
 * signed-in user, and — only when the caller explicitly opts in via
 * `deleteData` — also deletes that marketplace's rows from
 * `user_transactions`. Both deletes go through a user-scoped client (the
 * caller's JWT), so Postgres RLS ("delete own credentials" / "delete own
 * rows") is what actually enforces the user can only ever touch their own
 * data — this route never uses a service-role key.
 *
 * Works for demo-only marketplaces too (no `marketplace_credentials` row to
 * delete, but demo connects can seed rows into `user_transactions` — see
 * lib/connect/demo-provider.ts — so `deleteData` still has something to do).
 */

export const runtime = "nodejs";

interface DisconnectRequestBody {
  marketplace?: string;
  /** When true, also deletes this marketplace's rows from user_transactions. */
  deleteData?: boolean;
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

export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!accessToken) {
    return NextResponse.json({ error: "Oturum bulunamadı — lütfen tekrar giriş yapın." }, { status: 401 });
  }

  let body: DisconnectRequestBody;
  try {
    body = (await req.json()) as DisconnectRequestBody;
  } catch {
    return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  }

  const marketplace = body.marketplace?.trim();
  if (!marketplace) {
    return NextResponse.json({ error: "marketplace gerekli." }, { status: 400 });
  }
  const deleteData = body.deleteData === true;

  const supabase = userScopedClient(accessToken);
  if (!supabase) {
    return NextResponse.json({ error: "Supabase yapılandırılmamış." }, { status: 500 });
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Oturum geçersiz — lütfen tekrar giriş yapın." }, { status: 401 });
  }
  const userId = userData.user.id;

  const { error: credDeleteError } = await supabase
    .from("marketplace_credentials")
    .delete()
    .eq("user_id", userId)
    .eq("marketplace", marketplace);
  if (credDeleteError) {
    console.error(`[marketplace/disconnect] failed to delete credentials for ${marketplace}:`, credDeleteError.message);
    return NextResponse.json({ error: "Bağlantı bilgisi silinemedi." }, { status: 502 });
  }

  let rowsDeleted = 0;
  if (deleteData) {
    const { data: deletedRows, error: dataDeleteError } = await supabase
      .from("user_transactions")
      .delete()
      .eq("user_id", userId)
      .eq("marketplace", marketplace)
      .select("id");
    if (dataDeleteError) {
      console.error(`[marketplace/disconnect] failed to delete transactions for ${marketplace}:`, dataDeleteError.message);
      return NextResponse.json({ error: "Bağlantı kesildi ama veriler silinemedi." }, { status: 502 });
    }
    rowsDeleted = deletedRows?.length ?? 0;
  }

  return NextResponse.json({ success: true, marketplace, deletedData: deleteData, rowsDeleted });
}
