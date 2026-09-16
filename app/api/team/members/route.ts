import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { sendEmail, isEmailConfigured } from "@/lib/email/resend";
import { siteOrigin } from "@/lib/seo";

/**
 * Ekip erişimi yönetimi — hesap sahibinin daveti (owner-only).
 * Aynı auth deseni: app/api/account/extension-token/route.ts.
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
    .select("id, member_email, role, status, created_at, accepted_at")
    .eq("owner_user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ members: [], migrationPending: true });
  }
  return NextResponse.json({ members: data ?? [] });
}

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Geçerli bir e-posta girin." }, { status: 400 });
  }

  const supabase = serviceClient();
  if (!supabase) return NextResponse.json({ error: "Sunucu yapılandırması eksik." }, { status: 500 });

  const { data: inviter } = await supabase.auth.admin.getUserById(userId);
  if (inviter?.user?.email?.toLowerCase() === email) {
    return NextResponse.json({ error: "Kendinizi davet edemezsiniz." }, { status: 400 });
  }

  const { data: inserted, error } = await supabase
    .from("tenant_members")
    .upsert(
      { owner_user_id: userId, member_email: email, status: "pending", role: "viewer" },
      { onConflict: "owner_user_id,member_email" }
    )
    .select("invite_token")
    .single();

  if (error || !inserted) {
    return NextResponse.json(
      { error: "Davet oluşturulamadı — ekip erişimi özelliği henüz etkinleştirilmedi (migration 0036)." },
      { status: 500 }
    );
  }

  const acceptUrl = `${siteOrigin()}/team/accept?token=${inserted.invite_token}`;
  if (isEmailConfigured()) {
    const ownerLabel = inviter?.user?.email ?? "Bir TrueMargin hesabı";
    await sendEmail(
      email,
      `${ownerLabel} sizi TrueMargin'e davet etti`,
      `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
         <p>${ownerLabel}, TrueMargin hesabına salt-okunur erişim için sizi davet etti.</p>
         <a href="${acceptUrl}" style="display:inline-block;background:#18181b;color:#fafafa;padding:10px 20px;text-decoration:none;">Daveti kabul et</a>
       </div>`
    );
  }

  return NextResponse.json({ ok: true, acceptUrl, emailSent: isEmailConfigured() });
}

export async function DELETE(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id gerekli." }, { status: 400 });

  const supabase = serviceClient();
  if (!supabase) return NextResponse.json({ error: "Sunucu yapılandırması eksik." }, { status: 500 });

  await supabase.from("tenant_members").update({ status: "revoked" }).eq("id", id).eq("owner_user_id", userId);
  return NextResponse.json({ ok: true });
}
