"use client";

/**
 * E-posta onay bekleme ekranı — kayıt sonrası veya proxy engeliyle buraya düşülür.
 */

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseClient, allowUnauthedDemoBypass } from "@/lib/supabase/client";
import { TrustSubmitButton } from "@/components/trust/TrustSubmitButton";
import { FIELD_ERROR_BORDER } from "@/lib/design/financial-ui";

function Logo() {
  return (
    <Link
      href="/"
      className="font-heading text-lg font-bold tracking-tight text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
    >
      TrueMargin
    </Link>
  );
}

function VerifyEmailInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialEmail = searchParams.get("email")?.trim() ?? "";
  const linkError = searchParams.get("error") === "link";
  const planParam = searchParams.get("plan");
  const paidPlan = planParam === "pro" || planParam === "starter" ? planParam : null;
  const afterAuthPath = paidPlan
    ? `/settings?tab=abonelik&plan=${paidPlan}`
    : "/connect";

  const [email, setEmail] = useState(initialEmail);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState(
    linkError
      ? "Onay bağlantısı geçersiz veya süresi dolmuş. Yeni bir e-posta isteyin."
      : "Hesabınızı kullanmadan önce e-posta adresinizi onaylamanız gerekir.",
  );

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      if (allowUnauthedDemoBypass()) router.replace(afterAuthPath);
      return;
    }
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      if (data.user?.email_confirmed_at) {
        router.replace(afterAuthPath);
        return;
      }
      if (data.user?.email && !email) setEmail(data.user.email);
    });
    return () => {
      active = false;
    };
  }, [router, email, afterAuthPath]);

  async function resend() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed.includes("@")) {
      setStatus("error");
      setMessage("Geçerli bir e-posta girin.");
      return;
    }
    setStatus("sending");
    try {
      const res = await fetch("/api/auth/resend-confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      if (!res.ok) {
        setStatus("error");
        setMessage(body.error ?? "Gönderilemedi. Biraz sonra tekrar deneyin.");
        return;
      }
      setStatus("sent");
      setMessage(body.message ?? "Onay e-postası gönderildi.");
    } catch {
      setStatus("error");
      setMessage("Bağlantı hatası. İnternetinizi kontrol edin.");
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-16">
      <div className="mb-10">
        <Logo />
      </div>

      <div className="w-full max-w-[420px] bg-card border border-border rounded-[var(--tm-r-ui)] p-8 sm:p-10">
        <h1 className="font-heading text-[22px] font-semibold tracking-tight text-foreground mb-2 leading-tight">
          E-postanızı onaylayın
        </h1>
        <p className="text-sm text-muted-foreground mb-6 leading-relaxed">{message}</p>

        <label htmlFor="verify-email" className="block text-sm font-medium text-foreground mb-1.5">
          E-posta
        </label>
        <input
          id="verify-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={`w-full border bg-muted px-3 py-2.5 text-sm text-foreground rounded-[var(--tm-r-data)] mb-5
            focus:outline-none focus:ring-2 focus:ring-ring focus:bg-card
            ${status === "error" ? FIELD_ERROR_BORDER : "border-input"}`}
        />

        <TrustSubmitButton
          type="button"
          disabled={status === "sending"}
          onClick={() => void resend()}
        >
          {status === "sending" ? "Gönderiliyor…" : "Onay e-postasını yeniden gönder"}
        </TrustSubmitButton>

        <p className="mt-6 text-[12px] text-muted-foreground leading-relaxed">
          E-postadaki bağlantıya tıkladıktan sonra otomatik olarak devam edersiniz. Spam
          klasörünü de kontrol edin.
        </p>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Yanlış hesap mı?{" "}
          <Link href="/login" className="text-foreground font-medium underline-offset-4 hover:underline">
            Giriş yap
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function DogrulaEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center text-sm text-muted-foreground">
          Yükleniyor…
        </div>
      }
    >
      <VerifyEmailInner />
    </Suspense>
  );
}
