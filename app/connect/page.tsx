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
import { loadUserRowsWithStatus } from "@/lib/supabase/user-data";
import {
  completeOnboarding, isOnboardingDone, setConnectedMarketplaces,
  getConnectedMarketplaces, TRIAL_DAYS,
} from "@/lib/onboarding";
import { isStripeLiveEnabled } from "@/lib/billing/is-stripe-live-enabled";
import { StripePaymentForm } from "@/components/StripePaymentForm";
import { launchPlanDisplay } from "@/lib/product-market";
import { LockIcon } from "@/components/trust/LockIcon";
import { SecurePaymentCapsule } from "@/components/trust/SecurePaymentCapsule";

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

type Step = "connect" | "plan" | "card";

function StepRail({ step }: { step: Step }) {
  const order: Step[] = ["connect", "plan", "card"];
  const idx = order.indexOf(step);
  const labels = { connect: "Bağlantı", plan: "Deneme", card: "Ödeme" };
  return (
    <div className="flex items-center gap-2 mb-10" aria-label="Onboarding adımları">
      {order.map((s, i) => (
        <div key={s} className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <span
              className={`w-5 h-5 flex items-center justify-center font-mono text-[10px] tnum border rounded-[var(--tm-r-data)] ${
                i <= idx
                  ? "border-[var(--tm-copper)] text-[var(--tm-copper)] bg-[color-mix(in_srgb,var(--tm-copper)_8%,var(--tm-paper))]"
                  : "border-[var(--tm-mist)] text-muted-foreground"
              }`}
            >
              {i + 1}
            </span>
            <span
              className={`text-[11px] uppercase tracking-[0.15em] ${
                i <= idx ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              {labels[s]}
            </span>
          </div>
          {i < order.length - 1 && (
            <span className={`w-6 h-px ${i < idx ? "bg-[var(--tm-copper)]" : "bg-[var(--tm-mist)]"}`} />
          )}
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
  const [bootError, setBootError] = useState<string | null>(null);
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
        const { rows, error: loadError } = await loadUserRowsWithStatus();
        if (!active) return;
        if (loadError) {
          setBootError("Satış verileriniz okunamadı. Oturumu yenileyip tekrar deneyin.");
          setReady(true);
          return;
        }
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

  if (!ready) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <span className="text-muted-foreground text-sm">Hesabınız hazırlanıyor…</span>
      </div>
    );
  }

  if (bootError) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 px-4">
        <p className="tm-field-error-box max-w-md rounded-[var(--tm-r-ui)] p-4 text-sm text-center">{bootError}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="tm-btn-primary h-10 px-5 text-sm font-medium"
        >
          Tekrar dene
        </button>
      </div>
    );
  }

  const plan = launchPlanDisplay();

  return (
    <div className="min-h-screen bg-background text-foreground font-sans flex flex-col items-center px-4 py-14">
      <div className="mb-10">
        <span className="font-heading text-lg font-bold tracking-tight">TrueMargin</span>
      </div>

      <div className={`w-full ${step === "connect" ? "max-w-[600px]" : "max-w-[440px]"}`}>
        <StepRail step={step} />

        {step === "connect" && (
          <MarketplaceConnectStep onContinue={handleConnectContinue} />
        )}

        {step === "plan" && (
          <section>
            <h1 className="font-heading text-[22px] font-semibold tracking-tight mb-2">Ücretsiz denemeyi başlatın</h1>
            <div className="inline-flex items-center gap-2 fin-border-profit-subtle fin-bg-profit-subtle border px-3 py-1 mb-6 rounded-[var(--tm-r-data)]">
              <span className="w-1.5 h-1.5 fin-dot-profit rounded-full" />
              <span className="text-[12px] font-medium fin-profit">1 ay ücretsiz — bugün ücret yok</span>
            </div>
            <div className="border border-[var(--tm-mist)] bg-card rounded-[var(--tm-r-ui)] p-5">
              <div className="flex items-baseline justify-between mb-4">
                <div>
                  <div className="text-sm font-medium">Profesyonel</div>
                  <div className="text-[11px] text-muted-foreground">Tüm araçlar · tam motor</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-lg tnum">{plan.symbol}0<span className="text-muted-foreground text-sm">/ay</span></div>
                  <div className="text-[11px] text-muted-foreground tnum">sonra {plan.formattedAfterTrial}</div>
                </div>
              </div>
              <ul className="space-y-2 border-t border-[var(--tm-mist)] pt-4 text-[13px] text-muted-foreground">
                {[
                  "SKU bazlı gerçek net kâr",
                  "Zarar alarmı ve güvenli fiyat",
                  "Görünürlük ve talep sinyalleri",
                  "Yapay zeka asistan (açıklamalı öneriler)",
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <span className="mt-0.5 fin-profit">—</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
            <p className="mt-4 text-[12px] text-muted-foreground leading-relaxed">
              {TRIAL_DAYS} günlük deneme süresince ücret alınmaz. İstediğiniz zaman iptal edebilirsiniz.
            </p>
            <button type="button" onClick={() => setStep("card")} className="tm-btn-primary mt-5 w-full">
              Denemeyi başlat
            </button>
          </section>
        )}

        {step === "card" && (
          <section>
            <h1 className="font-heading text-[22px] font-semibold tracking-tight mb-2">Ödeme yöntemi ekleyin</h1>
            <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
              Denemeyi başlatmak için gerekli. <span className="text-foreground">Bugün ücret yok — ilk ay ücretsiz.</span>
            </p>
            {isAuthConfigured() && stripeLive ? (
              <SecurePaymentCapsule
                hint="Bugün ücret alınmaz. Kart bilgileri kapsüllenmiş alanda işlenir."
                footerHint="Stripe ile şifrelenmiş ödeme"
              >
                <StripePaymentForm onSuccess={finish} />
              </SecurePaymentCapsule>
            ) : (
              // Ödeme sağlayıcısı henüz bu ortamda aktif değil. Daha önce burada
              // gerçek bir kart formuna (numara/son kullanma/CVC alanları,
              // "4242 4242 4242 4242" placeholder'ıyla) birebir benzeyen ama hiçbir
              // yere göndermeyen bir "demo" form vardı — küçük punto bir uyarı
              // dışında gerçek bir ödeme formundan görsel olarak ayırt edilemiyordu,
              // bu da bir kullanıcıyı gerçek kart bilgisini yazmaya davet edebilirdi.
              // Bir fintek ürününde asla kart numarası/CVC toplayan bir arayüz
              // gösterilmemeli, gönderilmese bile. Bunun yerine açık, dürüst bir
              // bilgilendirme + tek bir devam butonu gösteriyoruz.
              <div className="border border-[var(--tm-mist)] bg-card rounded-[var(--tm-r-ui)] p-5">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Bu ortamda ödeme sağlayıcısı henüz etkin değil — kart bilgisi
                  istemiyoruz. Deneme sürenizi kartsız başlatabilirsiniz;
                  ödeme yalnızca gerçek abonelik sırasında, güvenli bir
                  sağlayıcı üzerinden alınır.
                </p>
                <button
                  type="button"
                  disabled={cardBusy}
                  onClick={() => void finish()}
                  className="tm-btn-primary w-full mt-4"
                >
                  {cardBusy ? "Deneme başlatılıyor…" : "Kartsız devam et — ücretsiz ayı başlat"}
                </button>
                {cardError && <p role="alert" className="tm-field-error mt-2">{cardError}</p>}
              </div>
            )}
            <button type="button" onClick={() => setStep("plan")} className="mt-4 text-[11px] text-muted-foreground hover:text-foreground uppercase tracking-widest">
              ← Geri
            </button>
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
        <div className="min-h-screen bg-background flex items-center justify-center">
          <span className="text-muted-foreground text-sm">Yükleniyor…</span>
        </div>
      }>
        <ConnectFlow />
      </Suspense>
    </AuthGuard>
  );
}
