"use client";

/**
 * Real Stripe Payment Element for /connect step 3.
 * Falls back to nothing — parent renders the demo form when Stripe is off.
 */

import { useEffect, useMemo, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { getFreshAccessToken } from "@/lib/supabase/client";
import { TrustSubmitButton } from "@/components/trust/TrustSubmitButton";
import { SecurePaymentCapsule } from "@/components/trust/SecurePaymentCapsule";

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
      // Parent navigates away; clear busy if soft-nav stalls.
      setBusy(false);
    } catch {
      onError("Sunucuya bağlanılamadı.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <SecurePaymentCapsule hint="Kart bilgileriniz Stripe tarafından şifrelenir; sunucularımızda saklanmaz.">
        <PaymentElement
          options={{
            layout: "tabs",
          }}
        />
      </SecurePaymentCapsule>
      <TrustSubmitButton
        disabled={!stripe || busy}
        className="disabled:opacity-50"
        seal="Stripe ile şifrelenmiş · bugün ücret yok"
      >
        {busy ? "Doğrulanıyor…" : "Ücretsiz ayı başlat"}
      </TrustSubmitButton>
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
  const [reloadKey, setReloadKey] = useState(0);

  const stripePromise = useMemo(() => {
    if (!publishableKey) return null;
    return loadStripe(publishableKey);
  }, []);

  useEffect(() => {
    let active = true;
    setLoadError(null);
    setClientSecret(null);
    (async () => {
      try {
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
  }, [reloadKey]);

  if (!stripePromise) {
    return (
      <p className="text-sm tm-field-error">
        Ödeme yöntemi şu anda kullanılamıyor. Lütfen daha sonra tekrar deneyin.
      </p>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-3">
        <p className="text-sm tm-field-error" role="alert">{loadError}</p>
        <button
          type="button"
          onClick={() => setReloadKey((k) => k + 1)}
          className="tm-btn-primary h-10 px-4 text-sm font-medium"
        >
          Tekrar dene
        </button>
      </div>
    );
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
              colorPrimary: "#2563C9",
              colorBackground: "#F7F6F2",
              colorText: "#12181B",
              colorDanger: "#C62828",
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
