"use client";

/**
 * Real Stripe Payment Element for /connect step 3.
 * Falls back to nothing — parent renders the demo form when Stripe is off.
 */

import { useEffect, useMemo, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { getFreshAccessToken } from "@/lib/supabase/client";
import { LockIcon } from "@/components/trust/LockIcon";

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";

function PaymentForm({
  onSuccess,
  onError,
}: {
  onSuccess: () => void;
  onError: (message: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;

    setBusy(true);
    onError("");

    const { error, setupIntent } = await stripe.confirmSetup({
      elements,
      redirect: "if_required",
    });

    if (error) {
      onError(error.message ?? "Kart doğrulanamadı.");
      setBusy(false);
      return;
    }

    if (!setupIntent?.id) {
      onError("SetupIntent oluşturulamadı.");
      setBusy(false);
      return;
    }

    // Fetched fresh, right here — NOT the token the page had when this step
    // first mounted. Everything before this line (collecting marketplace API
    // keys, filling out the card form, Stripe's own confirmation round trip)
    // can take long enough for the session's access token to have rotated —
    // see getFreshAccessToken's doc comment. Using a stale one here would
    // reject a card Stripe just finished confirming, with a confusing
    // "session invalid" error despite the user never having signed out.
    const accessToken = await getFreshAccessToken();
    if (!accessToken) {
      onError("Oturum bulunamadı — lütfen tekrar giriş yapıp tekrar deneyin.");
      setBusy(false);
      return;
    }

    try {
      const res = await fetch("/api/billing/start-trial", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ setupIntentId: setupIntent.id }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok || !result.success) {
        onError(result.error ?? "Deneme aboneliği başlatılamadı.");
        setBusy(false);
        return;
      }
      onSuccess();
    } catch {
      onError("Sunucuya bağlanılamadı.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement
        options={{
          layout: "tabs",
        }}
      />
      <button
        type="submit"
        disabled={!stripe || busy}
        className="tm-btn-primary w-full disabled:opacity-50"
      >
        {busy ? "Doğrulanıyor…" : "Ücretsiz ayı başlat"}
      </button>
      <div className="flex items-center justify-center gap-1.5 text-muted-foreground text-[11px]">
        <LockIcon className="text-[var(--tm-copper)]" />
        <span>Stripe ile şifrelenmiş · bugün ücret yok</span>
      </div>
    </form>
  );
}

export function StripePaymentForm({
  onSuccess,
}: {
  onSuccess: () => void;
}) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const stripePromise = useMemo(() => {
    if (!publishableKey) return null;
    return loadStripe(publishableKey);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        // Fetched fresh here too (see PaymentForm.handleSubmit's comment) —
        // this component no longer trusts a token the parent captured at
        // page-mount time and threaded down as a prop.
        const accessToken = await getFreshAccessToken();
        if (!accessToken) {
          if (active) setLoadError("Oturum bulunamadı — lütfen tekrar giriş yapın.");
          return;
        }
        const res = await fetch("/api/billing/setup-intent", {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const result = await res.json().catch(() => ({}));
        if (!active) return;
        if (!res.ok || !result.clientSecret) {
          setLoadError(result.error ?? "Ödeme formu yüklenemedi.");
          return;
        }
        setClientSecret(result.clientSecret);
      } catch {
        if (active) setLoadError("Sunucuya bağlanılamadı.");
      }
    })();
    return () => { active = false; };
  }, []);

  if (!stripePromise) {
    // Bu koşula gerçekte hiç girilmemeli — StripePaymentForm zaten yalnızca
    // stripeLive true iken render ediliyor (bkz. app/connect/page.tsx). Yine
    // de ortam yapılandırması eksikse, kullanıcıya "publishable key" gibi bir
    // geliştirici hata mesajı yerine nötr bir mesaj gösteriyoruz.
    return (
      <p className="text-sm tm-field-error">
        Ödeme yöntemi şu anda kullanılamıyor. Lütfen daha sonra tekrar deneyin.
      </p>
    );
  }

  if (loadError) {
    return <p className="text-sm tm-field-error">{loadError}</p>;
  }

  if (!clientSecret) {
    return (
      <p className="text-muted-foreground text-sm py-4">
        Ödeme formu yükleniyor…
      </p>
    );
  }

  return (
    <>
      {(formError || loadError) && (
        <p role="alert" className="tm-field-error-box mb-3">{formError ?? loadError}</p>
      )}
      <Elements
        stripe={stripePromise}
        options={{
          clientSecret,
          appearance: {
            theme: "stripe",
            variables: {
              colorPrimary: "#9C6B3E",
              colorBackground: "#F7F6F2",
              colorText: "#12181B",
              colorDanger: "#B3442C",
              fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
              borderRadius: "4px",
            },
            rules: {
              ".Input": { border: "1px solid #DCD9D2", boxShadow: "none" },
              ".Label": { color: "#6B6560" },
            },
          },
        }}
      >
        <PaymentForm onSuccess={onSuccess} onError={setFormError} />
      </Elements>
    </>
  );
}
