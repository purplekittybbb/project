"use client";

/**
 * Real Stripe Payment Element for /connect step 3.
 * Falls back to nothing — parent renders the demo form when Stripe is off.
 */

import { useEffect, useMemo, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { getFreshAccessToken } from "@/lib/supabase/client";

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";

function LockIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0">
      <rect x="3" y="7" width="10" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

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
        className="ob-input w-full h-11 bg-zinc-100 text-zinc-950 text-sm font-semibold hover:bg-zinc-200 transition-colors disabled:opacity-50"
      >
        {busy ? "Doğrulanıyor…" : "Start free month"}
      </button>
      <div className="flex items-center justify-center gap-1.5 text-zinc-500 text-[11px]">
        <LockIcon />
        <span>Powered by Stripe · no charge today</span>
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
    return <p className="text-sm text-red-400">Stripe publishable key yapılandırılmamış.</p>;
  }

  if (loadError) {
    return <p className="text-sm text-red-400">{loadError}</p>;
  }

  if (!clientSecret) {
    return (
      <p className="text-zinc-600 font-mono text-[11px] uppercase tracking-[0.2em] py-4">
        Loading payment form…
      </p>
    );
  }

  return (
    <>
      {(formError || loadError) && (
        <p className="text-sm text-red-400 mb-3">{formError ?? loadError}</p>
      )}
      <Elements
        stripe={stripePromise}
        options={{
          clientSecret,
          appearance: {
            theme: "night",
            variables: {
              colorPrimary: "#f4f4f5",
              colorBackground: "#09090b",
              colorText: "#e4e4e7",
              colorDanger: "#f87171",
              fontFamily: "ui-sans-serif, system-ui, sans-serif",
              borderRadius: "0px",
            },
            rules: {
              ".Input": { border: "1px solid #27272a", boxShadow: "none" },
              ".Label": { color: "#a1a1aa" },
            },
          },
        }}
      >
        <PaymentForm onSuccess={onSuccess} onError={setFormError} />
      </Elements>
    </>
  );
}
