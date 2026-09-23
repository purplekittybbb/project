"use client";

/**
 * Real paid-plan purchase flow — the missing piece behind the user complaint
 * "paket üyeliği aldıklarında bir yere yönlendirilmiyor" (nothing happens
 * after buying a plan). Before this component existed, the iyzico
 * checkout/callback backend (app/api/billing/iyzico/*) was fully functional
 * but had ZERO frontend callers anywhere in the app — there was no button,
 * no page, nothing that actually called it. This is that missing caller.
 *
 * Flow:
 *  1. User picks Başlangıç (₺400) or Profesyonel (₺800) and clicks "Yükselt".
 *  2. We POST /api/billing/iyzico/checkout with a fresh access token → get
 *     back `checkoutFormContent` (iyzico's hosted-form HTML+<script>).
 *  3. We open a modal and inject that HTML, manually re-executing the
 *     <script> tag (dangerouslySetInnerHTML does not run scripts) — this
 *     renders iyzico's real hosted card-entry iframe. We never see or touch
 *     card data ourselves.
 *  4. iyzico's callback route (already implemented) posts
 *     {type:"IYZICO_PAYMENT_SUCCESS"} to window.parent when done — we listen
 *     for that, close the modal, and refetch billing status.
 *
 * Sandbox only — the checkout route itself refuses to run against iyzico's
 * production URL, so this can never trigger a real charge.
 */

import { useEffect, useRef, useState } from "react";
import { getFreshAccessToken } from "@/lib/supabase/client";
import { IYZICO_PLANS, type PlanId } from "@/lib/iyzico/plans";

type CancelState = "idle" | "confirm" | "cancelling" | "done" | "error";

export interface PaidPlanStatus {
  planId: "starter" | "pro";
  status: string;
  currentPeriodEnd: string | null;
  cancelledAt: string | null;
}

// Single source of truth for plan names/prices — lib/iyzico/plans.ts is what
// the checkout route itself charges, so the UI can never drift from it.
const PLAN_OPTIONS: PlanId[] = ["starter", "pro"];

const STATUS_TR: Record<string, string> = {
  active: "Aktif",
  pending: "Ödeme bankaya iletildi — onay bekleniyor (genelde birkaç dakika)",
  cancelled: "İptal edildi",
  failed: "Başarısız",
};

export function UpgradePlanPanel({
  paidPlan,
  onChanged,
}: {
  paidPlan: PaidPlanStatus | null;
  onChanged: () => void;
}) {
  const [pendingPlanId, setPendingPlanId] = useState<"starter" | "pro" | null>(null);
  const [checkoutHtml, setCheckoutHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelState, setCancelState] = useState<CancelState>("idle");
  const formHostRef = useRef<HTMLDivElement>(null);

  async function cancelSubscription() {
    setCancelState("cancelling");
    try {
      const token = await getFreshAccessToken();
      if (!token) {
        setCancelState("error");
        return;
      }
      const res = await fetch("/api/billing/iyzico/cancel", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setCancelState("error");
        return;
      }
      setCancelState("done");
      onChanged();
    } catch {
      setCancelState("error");
    }
  }

  async function startCheckout(planId: "starter" | "pro") {
    setError(null);
    setPendingPlanId(planId);
    try {
      const token = await getFreshAccessToken();
      if (!token) {
        setError("Devam etmek için giriş yapmanız gerekiyor.");
        setPendingPlanId(null);
        return;
      }
      const res = await fetch("/api/billing/iyzico/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          planId,
          callbackUrl: `${window.location.origin}/api/billing/iyzico/callback`,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { checkoutFormContent?: string; error?: string };
      if (!res.ok || !json.checkoutFormContent) {
        setError(json.error ?? "Ödeme formu başlatılamadı. Lütfen tekrar deneyin.");
        setPendingPlanId(null);
        return;
      }
      setCheckoutHtml(json.checkoutFormContent);
    } catch {
      setError("Bağlantı hatası. Lütfen tekrar deneyin.");
      setPendingPlanId(null);
    }
  }

  // Inject the checkout HTML and manually re-execute its <script> tag(s) —
  // dangerouslySetInnerHTML never runs embedded scripts, and iyzico's hosted
  // form only renders once its script actually executes in the DOM.
  useEffect(() => {
    if (!checkoutHtml || !formHostRef.current) return;
    const host = formHostRef.current;
    host.innerHTML = checkoutHtml;
    const scripts = Array.from(host.querySelectorAll("script"));
    for (const oldScript of scripts) {
      const newScript = document.createElement("script");
      for (const attr of Array.from(oldScript.attributes)) {
        newScript.setAttribute(attr.name, attr.value);
      }
      newScript.textContent = oldScript.textContent;
      oldScript.parentNode?.replaceChild(newScript, oldScript);
    }
  }, [checkoutHtml]);

  // iyzico's callback route posts this message to window.parent on success
  // when embedded (see app/api/billing/iyzico/callback/route.ts).
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      // Only trust messages from our own origin (the callback iframe posts with
      // targetOrigin = window.location.origin — see billing/iyzico/callback).
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === "IYZICO_PAYMENT_SUCCESS") {
        setCheckoutHtml(null);
        setPendingPlanId(null);
        onChanged();
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function closeModal() {
    setCheckoutHtml(null);
    setPendingPlanId(null);
  }

  const activePlan = paidPlan && paidPlan.status === "active" ? paidPlan : null;

  return (
    <div className="mt-8 border border-zinc-900 bg-zinc-950/50 p-6">
      <div className="text-zinc-600 text-[10px] uppercase tracking-[0.2em] font-sans mb-4">Paket</div>

      {activePlan ? (
        <div className="space-y-3 text-sm font-mono">
          <div className="flex justify-between gap-4">
            <span className="text-zinc-600">Aktif paket</span>
            <span className="fin-profit tabular-nums capitalize">
              {IYZICO_PLANS[activePlan.planId].name} — {STATUS_TR[activePlan.status] ?? activePlan.status}
            </span>
          </div>
          {activePlan.currentPeriodEnd && (
            <div className="flex justify-between gap-4">
              <span className="text-zinc-600">Yenilenme tarihi</span>
              <span className="text-zinc-200 tabular-nums">{activePlan.currentPeriodEnd.slice(0, 10)}</span>
            </div>
          )}

          {/* Cancel-at-period-end — the flow the Terms/Refund pages promise. */}
          <div className="pt-3 mt-1 border-t border-zinc-900">
            {cancelState === "done" ? (
              <p className="text-[12px] text-zinc-400">
                Aboneliğiniz dönem sonunda iptal edilecek. Bu tarihe kadar erişiminiz devam eder.
              </p>
            ) : cancelState === "confirm" ? (
              <div className="flex flex-col gap-2">
                <span className="text-[12px] text-zinc-400">
                  Emin misiniz? Erişiminiz dönem sonuna ({activePlan.currentPeriodEnd?.slice(0, 10) ?? "mevcut dönem sonu"}) kadar sürer.
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={cancelSubscription}
                    className="h-8 px-3 border border-[var(--tm-alert-clay,#c0563e)]/50 text-[var(--tm-alert-clay,#c0563e)] text-[12px] hover:bg-[var(--tm-alert-clay,#c0563e)]/10 transition-colors"
                  >
                    Evet, iptal et
                  </button>
                  <button
                    type="button"
                    onClick={() => setCancelState("idle")}
                    className="h-8 px-3 text-zinc-500 text-[12px] hover:text-zinc-300 transition-colors"
                  >
                    Vazgeç
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setCancelState("confirm")}
                  disabled={cancelState === "cancelling"}
                  className="text-[12px] text-zinc-500 underline underline-offset-2 hover:text-zinc-300 transition-colors disabled:opacity-50"
                >
                  {cancelState === "cancelling" ? "İptal ediliyor…" : "Aboneliği iptal et"}
                </button>
                {cancelState === "error" && (
                  <span className="text-[11px] text-[var(--tm-alert-clay,#c0563e)]">İptal edilemedi — tekrar deneyin</span>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          {paidPlan && paidPlan.status !== "active" && (
            <p className="mb-4 text-zinc-600 font-mono text-[12px]">
              Son paket durumu: {STATUS_TR[paidPlan.status] ?? paidPlan.status}. Devam etmek için yeniden satın alabilirsiniz.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {PLAN_OPTIONS.map((id) => {
              const plan = IYZICO_PLANS[id];
              return (
                <div key={id} className="border border-zinc-900 p-4">
                  <div className="flex items-baseline justify-between">
                    <span className="text-zinc-200 font-mono text-sm">{plan.name}</span>
                    <span className="text-zinc-200 font-mono text-sm tabular-nums">₺{plan.priceMonthly}/ay</span>
                  </div>
                  <ul className="mt-2 space-y-0.5">
                    {plan.features.map((f) => (
                      <li key={f} className="text-zinc-600 text-[11px] font-mono">• {f}</li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => startCheckout(id)}
                    disabled={pendingPlanId !== null}
                    className="tm-btn-primary mt-4 inline-flex h-9 w-full items-center justify-center text-sm font-medium disabled:opacity-60"
                  >
                    {pendingPlanId === id ? "Yönlendiriliyor…" : "Yükselt"}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {error && <p className="fin-loss mt-4 font-mono text-[12px]">{error}</p>}

      {checkoutHtml && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="relative w-full max-w-lg rounded-[var(--tm-r-ui)] bg-card p-4 sm:p-6">
            <button
              type="button"
              onClick={closeModal}
              className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
              aria-label="Kapat"
            >
              ✕
            </button>
            <p className="mb-4 text-sm font-medium text-foreground">Ödeme — iyzico güvenli form</p>
            <div ref={formHostRef} id="iyzipay-checkout-form" />
          </div>
        </div>
      )}
    </div>
  );
}
