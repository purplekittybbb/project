// SANDBOX ONLY. Never set IYZICO_BASE_URL to the production URL without
// explicit user approval. Production URL: https://api.iyzipay.com
// Sandbox URL: https://sandbox-api.iyzipay.com

/**
 * POST /api/billing/iyzico/checkout
 *
 * Initialises an iyzico hosted checkout form for a subscription plan.
 *
 * Request body: { planId: "starter" | "pro", callbackUrl: string }
 * Response:     { checkoutFormContent: string }  — HTML to inject into the page
 *
 * Requires:
 *   - Valid Supabase auth session (user must be signed in)
 *   - IYZICO_API_KEY, IYZICO_SECRET_KEY environment variables
 *   - IYZICO_BASE_URL = https://sandbox-api.iyzipay.com  (sandbox ONLY)
 *
 * Guard: if IYZICO_BASE_URL is not the sandbox URL, this route throws
 * immediately to prevent accidental production billing.
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { initCheckoutForm, getIyzicoConfig } from "@/lib/iyzico/client";
import { IYZICO_PLANS } from "@/lib/iyzico/plans";

const SANDBOX_URL = "https://sandbox-api.iyzipay.com";

export const runtime = "nodejs";

export async function POST(req: Request) {
  // ── Sandbox guard ───────────────────────────────────────────────────────
  const configuredBaseUrl = process.env.IYZICO_BASE_URL ?? SANDBOX_URL;
  if (configuredBaseUrl !== SANDBOX_URL && configuredBaseUrl.includes("api.iyzipay.com")) {
    console.error("[iyzico/checkout] Production URL detected — rejecting to protect against live charges.");
    return NextResponse.json(
      { error: "IYZICO_BASE_URL must be sandbox URL in this environment" },
      { status: 500 }
    );
  }

  // ── Auth check ──────────────────────────────────────────────────────────
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: "Supabase yapılandırılmamış." }, { status: 500 });
  }

  const authHeader = req.headers.get("authorization");
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader ?? "" } },
  });

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Oturum açmanız gerekiyor." }, { status: 401 });
  }

  // ── Parse body ──────────────────────────────────────────────────────────
  let planId: "starter" | "pro";
  let callbackUrl: string;
  try {
    const body = (await req.json()) as { planId?: string; callbackUrl?: string };
    if (body.planId !== "starter" && body.planId !== "pro") {
      return NextResponse.json(
        { error: "planId must be 'starter' or 'pro'" },
        { status: 400 }
      );
    }
    if (!body.callbackUrl) {
      return NextResponse.json({ error: "callbackUrl is required" }, { status: 400 });
    }
    planId = body.planId;
    callbackUrl = body.callbackUrl;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const plan = IYZICO_PLANS[planId];

  // ── Init checkout form ──────────────────────────────────────────────────
  let config;
  try {
    config = getIyzicoConfig();
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }

  // Split "full_name" into iyzico's separate name/surname fields. The last
  // space-separated word is treated as the surname and everything before it
  // as the given name — this handles multi-part first names correctly
  // ("Ayşe Nur Yılmaz" → Ad: "Ayşe Nur", Soyad: "Yılmaz"), unlike the
  // previous first-word/rest split which broke on exactly that case.
  const fullNameParts = ((user.user_metadata?.full_name as string) ?? "").trim().split(/\s+/).filter(Boolean);
  const buyerName = fullNameParts.length > 1 ? fullNameParts.slice(0, -1).join(" ") : fullNameParts[0] || "Ad";
  const buyerSurname = fullNameParts.length > 1 ? fullNameParts[fullNameParts.length - 1] : "Soyad";

  const result = await initCheckoutForm(config, {
    price: String(plan.priceMonthly.toFixed(2)),
    paidPrice: String(plan.priceMonthly.toFixed(2)),
    currency: "TRY",
    basketId: `${user.id}-${planId}-${Date.now()}`,
    callbackUrl,
    buyerEmail: user.email ?? "",
    buyerName,
    buyerSurname,
    buyerId: user.id,
    planId,
  });

  if (result.status === "failure") {
    console.error("[iyzico/checkout] Checkout form init failed:", result.errorMessage);
    return NextResponse.json(
      { error: result.errorMessage ?? "Ödeme formu başlatılamadı." },
      { status: 502 }
    );
  }

  return NextResponse.json({ checkoutFormContent: result.checkoutFormContent });
}
