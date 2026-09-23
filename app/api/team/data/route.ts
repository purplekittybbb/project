import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { toStored, type DbRow } from "@/lib/supabase/user-data";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * Bir ekip üyesinin, kabul ettiği bir sahibin verisini salt-okunur olarak
 * okuması. user_transactions'ın kendi RLS'i hâlâ yalnızca auth.uid() = owner
 * ile sınırlı — bu route, service-role ile okuyup önce tenant_members'ta
 * gerçek bir "accepted" üyelik olduğunu doğruluyor, böylece mevcut hiçbir
 * tablonun RLS politikasına dokunmadan güvenli bir okuma-yolu sağlanıyor.
 */

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

export async function GET(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const ownerId = searchParams.get("ownerId");
  if (!ownerId) return NextResponse.json({ error: "ownerId gerekli." }, { status: 400 });

  const supabase = createServiceRoleClient();
  if (!supabase) return NextResponse.json({ error: "Sunucu yapılandırması eksik." }, { status: 500 });

  const { data: membership } = await supabase
    .from("tenant_members")
    .select("id")
    .eq("owner_user_id", ownerId)
    .eq("member_user_id", userId)
    .eq("status", "accepted")
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "Bu hesaba erişiminiz yok." }, { status: 403 });
  }

  const { data: txRows, error } = await supabase
    .from("user_transactions")
    .select("*")
    .eq("user_id", ownerId)
    .order("sale_date", { ascending: true });

  if (error) return NextResponse.json({ error: "Veri okunamadı." }, { status: 500 });

  const rows = ((txRows ?? []) as DbRow[]).map(toStored);
  return NextResponse.json({ rows });
}
