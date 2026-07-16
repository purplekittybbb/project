"use client";

/**
 * /connect — post-signup onboarding + free-trial flow.
 *
 * Route contract: only for a signed-in user who has NOT connected a
 * marketplace / entered data yet. AuthGuard sends signed-out visitors to
 * /login; a returning user who already has real data is bounced straight to
 * /dashboard (see the effect below) — this page never re-shows itself to
 * someone who's already past it.
 *
 * Step 1: Plaid/Rutter-style marketplace connect (OAuth demo modal per channel)
 * Step 2: Free trial plan
 * Step 3: Card — Stripe Payment Element when configured, else demo (no charge)
 * → /dashboard
 */

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { MarketplaceConnectStep } from "@/components/MarketplaceConnectStep";
import { addConnection, getConnections } from "@/lib/connect/store";
import { getSupabaseClient, getFreshAccessToken, isAuthConfigured } from "@/lib/supabase/client";
import { loadUserRows } from "@/lib/supabase/user-data";
import {
  completeOnboarding, isOnboardingDone, setConnectedMarketplaces,
  getConnectedMarketplaces, TRIAL_DAYS,
} from "@/lib/onboarding";
import { isStripeLiveEnabled } from "@/lib/billing/is-stripe-live-enabled";
import { StripePaymentForm } from "@/components/StripePaymentForm";
import { launchPlanDisplay } from "@/lib/product-market";

/**
 * Silently re-syncs every marketplace this signed-in user has stored (but
 * currently unused) credentials for — see /api/marketplace/auto-reconnect
 * and lib/marketplace-resync.ts. Only ever called when user_transactions is
 * already known to be empty (see the caller). Returns true iff at least one
 * marketplace was successfully reconnected (caller should skip the connect
 * form and go straight to /dashboard).
 */
async function tryAutoReconnect(): Promise<boolean> {
  const supabase = getSupabaseClient();
  if (!supabase) return false;
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) return false;

  let result: { connected?: string[] };
  try {
    const res = await fetch("/api/marketplace/auto-reconnect", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    result = await res.json().catch(() => ({}));
  } catch {
    return false;
  }

  const connected = Array.isArray(result.connected) ? result.connected : [];
  if (connected.length === 0) return false;

  // Mirror what a manual connect does, so the dashboard's tabs/connected
  // list reflect exactly what's really connected (see components/
  // MarketplaceApiKeyModal.tsx's addConnection calls for the same pattern).
  for (const marketplaceId of connected) {
    addConnection(marketplaceId, "live", { tokenRef: `tm_key_${marketplaceId}_resync`, method: "api_key" });
  }
  setConnectedMarketplaces(getConnections().map((c) => c.marketplaceId));
  return true;
}

function LockIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0">
      <rect x="3" y="7" width="10" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

type Step = "connect" | "plan" | "card";

function StepRail({ step }: { step: Step }) {
  const order: Step[] = ["connect", "plan", "card"];
  const idx = order.indexOf(step);
  const labels = { connect: "Connect", plan: "Trial", card: "Payment" };
  return (
    <div className="flex items-center gap-2 mb-10">
      {order.map((s, i) => (
        <div key={s} className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <span className={`w-5 h-5 flex items-center justify-center font-mono text-[10px] tabular-nums border ${i <= idx ? "border-zinc-100 text-zinc-100" : "border-zinc-800 text-zinc-600"}`}>
              {i + 1}
            </span>
            <span className={`text-[11px] uppercase tracking-[0.15em] font-sans ${i <= idx ? "text-zinc-300" : "text-zinc-600"}`}>{labels[s]}</span>
          </div>
          {i < order.length - 1 && <span className={`w-6 h-px ${i < idx ? "bg-zinc-500" : "bg-zinc-800"}`} />}
        </div>
      ))}
    </div>
  );
}

function ConnectFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const previewConnect = searchParams.get("preview") === "connect";

  const [step, setStep] = useState<Step>("connect");
  const [ready, setReady] = useState(false);
  const [cardNo, setCardNo] = useState("");
  const [exp, setExp] = useState("");
  const [cvc, setCvc] = useState("");
  const [cardBusy, setCardBusy] = useState(false);
  const [cardError, setCardError] = useState("");
  const stripeLive = isStripeLiveEnabled();

  useEffect(() => {
    let active = true;
    (async () => {
      // Explicit preview mode always shows the connect step, regardless of state.
      if (previewConnect) {
        const ids = getConnections().map((c) => c.marketplaceId);
        if (ids.length) setConnectedMarketplaces(ids);
        setReady(true);
        return;
      }

      if (isAuthConfigured()) {
        // Real deployment: trust actual Supabase data, never a stale local flag —
        // a returning user with real rows goes straight in; one with none (even
        // if some earlier browser session marked onboarding "done") sees connect.
        const rows = await loadUserRows();
        if (!active) return;
        if (rows.length > 0) {
          router.replace("/dashboard");
          return;
        }

        // No data yet — but this user may have previously connected a live
        // marketplace whose stored credentials (marketplace_credentials) were
        // never read back (e.g. after "Clear", or a fresh sign-in elsewhere).
        // Try a silent reconnect BEFORE ever showing a form; only fall back
        // to the connect UI if that fails or there's nothing to try.
        const reconnected = await tryAutoReconnect();
        if (!active) return;
        if (reconnected) {
          router.replace("/dashboard");
          return;
        }

        const ids = getConnections().map((c) => c.marketplaceId);
        if (ids.length) setConnectedMarketplaces(ids);
        setReady(true);
        return;
      }

      // Demo/local mode (no Supabase keys) — original local-flag behaviour, untouched.
      if (isOnboardingDone()) {
        router.replace("/dashboard");
        return;
      }
      const ids = getConnections().map((c) => c.marketplaceId);
      if (ids.length) setConnectedMarketplaces(ids);
      setReady(true);
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, previewConnect]);

  function handleConnectContinue() {
    const ids = getConnections().map((c) => c.marketplaceId);
    setConnectedMarketplaces(ids);
    setStep("plan");
  }

  async function finish() {
    const ids = getConnections().map((c) => c.marketplaceId);
    setConnectedMarketplaces(ids);

    if (isAuthConfigured() && !stripeLive) {
      setCardBusy(true);
      setCardError("");
      // Fetched fresh, right before use — not a token captured back when this
      // page first mounted. A user can spend real time on step 1 gathering a
      // Trendyol/Hepsiburada/N11 API key from their own seller panel before
      // ever reaching this step; see getFreshAccessToken's doc comment for
      // why holding a token in state across that gap is the wrong pattern.
      const accessToken = await getFreshAccessToken();
      if (!accessToken) {
        setCardError("Oturum bulunamadı — lütfen tekrar giriş yapıp tekrar deneyin.");
        setCardBusy(false);
        return;
      }
      try {
        const res = await fetch("/api/billing/start-demo-trial", {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const result = await res.json().catch(() => ({}));
        if (!res.ok || !result.success) {
          setCardError(result.error ?? "Deneme kaydı oluşturulamadı.");
          setCardBusy(false);
          return;
        }
      } catch {
        setCardError("Sunucuya bağlanılamadı.");
        setCardBusy(false);
        return;
      }
      setCardBusy(false);
    }

    completeOnboarding(ids[0]);
    router.push("/dashboard");
  }

  function onCardNo(v: string) {
    setCardNo(v.replace(/\D/g, "").slice(0, 16).replace(/(.{4})/g, "$1 ").trim());
  }
  function onExp(v: string) {
    const d = v.replace(/\D/g, "").slice(0, 4);
    setExp(d.length >= 3 ? `${d.slice(0, 2)}/${d.slice(2)}` : d);
  }

  if (!ready) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <span className="text-zinc-600 font-mono text-[11px] uppercase tracking-[0.2em]">Loading…</span>
      </div>
    );
  }

  const plan = launchPlanDisplay();

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200 font-sans flex flex-col items-center px-4 py-14">
      <style>{`.ob-input:focus-visible { outline: 2px solid #52525b; outline-offset: 2px; }`}</style>

      <div className="mb-10">
        <span className="text-zinc-100 font-mono tracking-tight text-lg font-medium">TrueMargin</span>
      </div>

      <div className={`w-full ${step === "connect" ? "max-w-[600px]" : "max-w-[440px]"}`}>
        <StepRail step={step} />

        {step === "connect" && (
          <MarketplaceConnectStep onContinue={handleConnectContinue} />
        )}

        {step === "plan" && (
          <section>
            <h1 className="text-[22px] font-semibold tracking-tight text-zinc-100 mb-2">Start your free trial</h1>
            <div className="inline-flex items-center gap-2 border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 mb-6">
              <span className="w-1.5 h-1.5 bg-emerald-400" />
              <span className="text-emerald-300 text-[12px] font-medium tracking-wide">1 month free — no charge today</span>
            </div>
            <div className="border border-zinc-800 bg-zinc-900/30 p-5">
              <div className="flex items-baseline justify-between mb-4">
                <div>
                  <div className="text-zinc-100 text-sm font-medium">Growth</div>
                  <div className="text-zinc-600 text-[11px]">Full engine · all marketplaces</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-zinc-100 text-lg tabular-nums">{plan.symbol}0<span className="text-zinc-500 text-sm">/mo</span></div>
                  <div className="text-zinc-600 text-[11px] font-mono tabular-nums">then {plan.formattedAfterTrial}</div>
                </div>
              </div>
              <ul className="space-y-2 border-t border-zinc-800 pt-4">
                {["True per-SKU margin across every marketplace", "Underwriting + backtest vs incumbent", "Campaign & cash-flow simulators", "Analyst Copilot"].map((f) => (
                  <li key={f} className="flex items-start gap-2 text-[13px] text-zinc-400">
                    <span className="text-zinc-500 mt-0.5">—</span><span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
            <p className="mt-4 text-[12px] text-zinc-500 leading-relaxed">
              You won&apos;t be charged during your {TRIAL_DAYS}-day trial. Cancel anytime.
            </p>
            <button type="button" onClick={() => setStep("card")} className="ob-input mt-5 w-full h-11 bg-zinc-100 text-zinc-950 text-sm font-semibold hover:bg-zinc-200 transition-colors">
              Start free trial
            </button>
          </section>
        )}

        {step === "card" && (
          <section>
            <h1 className="text-[22px] font-semibold tracking-tight text-zinc-100 mb-2">Add a payment method</h1>
            <p className="text-sm text-zinc-500 mb-6 leading-relaxed">
              Required to start the trial. <span className="text-zinc-300">No charge today — your first month is free.</span>
            </p>
            {!stripeLive && (
              <p className="mb-4 text-[11px] font-mono text-amber-400/90 border border-amber-500/30 bg-amber-500/5 px-3 py-2">
                Demo card form — Stripe not configured (no real charge or saved payment method).
              </p>
            )}
            <div className="border border-zinc-800 bg-zinc-900/30 p-5">
              <div className="flex items-center gap-1.5 text-zinc-500 text-[11px] mb-4 pb-3 border-b border-zinc-800">
                <LockIcon /><span>No charge today. First month free.</span>
              </div>
              {isAuthConfigured() && stripeLive ? (
                <StripePaymentForm onSuccess={finish} />
              ) : (
                <form onSubmit={(e) => { e.preventDefault(); void finish(); }} className="space-y-4">
                  <div>
                    <label htmlFor="cardno" className="block text-[12px] font-medium text-zinc-400 mb-1.5">Card number</label>
                    <input id="cardno" inputMode="numeric" autoComplete="off" value={cardNo} onChange={(e) => onCardNo(e.target.value)} placeholder="4242 4242 4242 4242" className="ob-input w-full border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-700 font-mono tabular-nums" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="exp" className="block text-[12px] font-medium text-zinc-400 mb-1.5">Expiry</label>
                      <input id="exp" inputMode="numeric" autoComplete="off" value={exp} onChange={(e) => onExp(e.target.value)} placeholder="MM/YY" className="ob-input w-full border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm font-mono tabular-nums" />
                    </div>
                    <div>
                      <label htmlFor="cvc" className="block text-[12px] font-medium text-zinc-400 mb-1.5">CVC</label>
                      <input id="cvc" inputMode="numeric" autoComplete="off" value={cvc} onChange={(e) => setCvc(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="123" className="ob-input w-full border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm font-mono tabular-nums" />
                    </div>
                  </div>
                  <button type="submit" disabled={cardBusy} className="ob-input w-full h-11 bg-zinc-100 text-zinc-950 text-sm font-semibold hover:bg-zinc-200 disabled:opacity-50 transition-colors">
                    {cardBusy ? "Starting trial…" : "Start free month"}
                  </button>
                  {cardError && (
                    <p className="text-red-400 text-[11px] font-mono">{cardError}</p>
                  )}
                  <div className="flex items-center justify-center gap-1.5 text-zinc-500 text-[11px]">
                    <LockIcon /><span>Encrypted &amp; secure · demo — no real payment</span>
                  </div>
                </form>
              )}
            </div>
            <button type="button" onClick={() => setStep("plan")} className="mt-4 text-[11px] font-mono text-zinc-600 hover:text-zinc-400 uppercase tracking-widest">← Back</button>
          </section>
        )}
      </div>
    </div>
  );
}

export default function ConnectPage() {
  return (
    <AuthGuard>
      <Suspense fallback={
        <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
          <span className="text-zinc-600 font-mono text-[11px] uppercase tracking-[0.2em]">Loading…</span>
        </div>
      }>
        <ConnectFlow />
      </Suspense>
    </AuthGuard>
  );
}
