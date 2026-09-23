"use client";

/** Şifre sıfırlama isteği — e-posta adresine sıfırlama bağlantısı gönderir. */

import { useState } from "react";
import Link from "next/link";
import { getSupabaseClient, isAuthConfigured } from "@/lib/supabase/client";
import { TrustSubmitButton } from "@/components/trust/TrustSubmitButton";
import { FIELD_ERROR_BORDER } from "@/lib/design/financial-ui";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

export default function SifremiUnuttumPage() {
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  function validateEmail() {
    if (!email.trim()) {
      setEmailError("E-posta adresinizi girin.");
      return false;
    }
    if (!EMAIL_RE.test(email.trim())) {
      setEmailError("Geçerli bir e-posta adresi girin.");
      return false;
    }
    setEmailError("");
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    if (!validateEmail()) return;
    setLoading(true);

    if (!isAuthConfigured()) {
      setLoading(false);
      setFormError("Kimlik doğrulama yapılandırılmadı.");
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) {
      setLoading(false);
      setFormError("Sunucu yapılandırması eksik.");
      return;
    }

    const redirectTo =
      typeof window !== "undefined" ? `${window.location.origin}/sifre-sifirla` : undefined;
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    setLoading(false);

    // Always show the same success state whether or not the email exists —
    // never let this endpoint reveal which addresses have an account.
    if (error) {
      console.warn("[sifremi-unuttum] resetPasswordForEmail error:", error.message);
    }
    setSent(true);
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-16">
      <div className="mb-10">
        <Logo />
      </div>

      <div className="w-full max-w-[400px] bg-card border border-border rounded-[var(--tm-r-ui)] p-8 sm:p-10">
        {sent ? (
          <>
            <h1 className="font-heading text-[22px] font-semibold tracking-tight text-foreground mb-2 leading-tight">
              E-postanızı kontrol edin
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {`${email.trim()} adresine kayıtlıysa, şifrenizi sıfırlamanız için bir bağlantı gönderdik. Bağlantı 1 saat içinde geçerliliğini yitirir.`}
            </p>
            <Link
              href="/login"
              className="mt-8 inline-flex text-sm font-medium text-foreground underline-offset-4 hover:underline"
            >
              Girişe dön
            </Link>
          </>
        ) : (
          <>
            <h1 className="font-heading text-[22px] font-semibold tracking-tight text-foreground mb-2 leading-tight">
              Şifrenizi sıfırlayın
            </h1>
            <p className="text-sm text-muted-foreground mb-8">
              E-posta adresinize bir sıfırlama bağlantısı gönderelim.
            </p>

            <form onSubmit={handleSubmit} noValidate className="space-y-5">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-foreground mb-1.5">
                  E-posta
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (emailError) setEmailError("");
                  }}
                  onBlur={validateEmail}
                  placeholder="siz@sirket.com"
                  aria-describedby={emailError ? "email-error" : undefined}
                  aria-invalid={!!emailError}
                  className={`w-full border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 rounded-[var(--tm-r-data)] transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:bg-card ${
                    emailError ? FIELD_ERROR_BORDER : "border-input hover:border-foreground/30"
                  }`}
                />
                {emailError && (
                  <p id="email-error" role="alert" className="tm-field-error">
                    {emailError}
                  </p>
                )}
              </div>

              {formError && (
                <div role="alert" className="tm-field-error-box">
                  {formError}
                </div>
              )}

              <div className="pt-1">
                <TrustSubmitButton
                  disabled={loading}
                  seal="256-bit şifreleme · oturum güvenliği"
                >
                  {loading ? "Gönderiliyor…" : "Sıfırlama bağlantısı gönder"}
                </TrustSubmitButton>
              </div>
            </form>

            <p className="mt-8 text-center text-sm text-muted-foreground">
              <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
                Girişe dön
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
