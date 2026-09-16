import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

/** Signed-in kullanıcının salt-okunur erişimi olan sahip hesapların listesi. */

export const runtime = "nodejs";

async function getUserId(): Promise<string | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnon) return null;
  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseAnon, {
    cookies: { getAll: () => cookieStore.getAll(), setAll() {} },
  });
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  const supabase = serviceClient();
  if (!supabase) return NextResponse.json({ error: "Sunucu yapılandırması eksik." }, { status: 500 });

  const { data, error } = await supabase
    .from("tenant_members")
    .select("owner_user_id")
    .eq("member_user_id", userId)
    .eq("status", "accepted");

  if (error) return NextResponse.json({ owners: [] });

  const ownerIds = [...new Set((data ?? []).map((r) => r.owner_user_id as string))];
  const owners = await Promise.all(
    ownerIds.map(async (id) => {
      const { data: u } = await supabase.auth.admin.getUserById(id);
      return { ownerId: id, label: u?.user?.email ?? id };
    })
  );
  return NextResponse.json({ owners });
}
