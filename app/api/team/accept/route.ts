import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/** Bir davetin kabul edilmesi — çağıran, o an giriş yapmış olan gerçek kullanıcıdır. */

export const runtime = "nodejs";

async function getUser(): Promise<{ id: string; email: string | null } | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnon) return null;
  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseAnon, {
    cookies: { getAll: () => cookieStore.getAll(), setAll() {} },
  });
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Önce giriş yapmalısınız." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const token = typeof body.token === "string" ? body.token : "";
  if (!token) return NextResponse.json({ error: "Geçersiz davet bağlantısı." }, { status: 400 });

  const supabase = createServiceRoleClient();
  if (!supabase) return NextResponse.json({ error: "Sunucu yapılandırması eksik." }, { status: 500 });

  const { data: invite, error: findError } = await supabase
    .from("tenant_members")
    .select("id, owner_user_id, member_email, status")
    .eq("invite_token", token)
    .maybeSingle();

  if (findError || !invite) return NextResponse.json({ error: "Davet bulunamadı." }, { status: 404 });
  if (invite.status === "revoked") return NextResponse.json({ error: "Bu davet iptal edildi." }, { status: 410 });
  if (user.email && invite.member_email.toLowerCase() !== user.email.toLowerCase()) {
    return NextResponse.json(
      { error: `Bu davet ${invite.member_email} adresine gönderildi — lütfen o hesapla giriş yapın.` },
      { status: 403 }
    );
  }

  const { data: owner } = await supabase.auth.admin.getUserById(invite.owner_user_id);

  await supabase
    .from("tenant_members")
    .update({ member_user_id: user.id, status: "accepted", accepted_at: new Date().toISOString() })
    .eq("id", invite.id);

  return NextResponse.json({ ok: true, ownerId: invite.owner_user_id, ownerEmail: owner?.user?.email ?? "Sahip" });
}
