import { NextResponse } from "next/server";
import { bearerToken, userScopedClient } from "@/lib/billing/auth";
import { cancelSubscriptionAtPeriodEnd } from "../callback/route";

/**
 * POST /api/billing/iyzico/cancel
 *
 * Cancels the signed-in user's active/trialing iyzico subscription AT PERIOD END
 * (access continues until current_period_end — see cancelSubscriptionAtPeriodEnd).
 * This is the frontend-callable endpoint the Terms/Refund pages promise
 * ("Aboneliğinizi Ayarlar → Faturalandırma bölümünden istediğiniz zaman iptal
 * edebilirsiniz") — previously the cancel helper existed but had no route/caller.
 */
export const runtime = "nodejs";

export async function POST(req: Request) {
  const accessToken = bearerToken(req);
  if (!accessToken) {
    return NextResponse.json({ error: "Oturum bulunamadı — lütfen tekrar giriş yapın." }, { status: 401 });
  }

  const supabase = userScopedClient(accessToken);
  if (!supabase) {
    return NextResponse.json({ error: "Supabase yapılandırılmamış." }, { status: 500 });
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Oturum geçersiz." }, { status: 401 });
  }

  const { error } = await cancelSubscriptionAtPeriodEnd(supabase, userData.user.id);
  if (error) {
    return NextResponse.json({ error }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
