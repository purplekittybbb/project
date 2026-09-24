"use client";

/**
 * Giriş — PDF §3 kapsülleme, §6 Türkçe mikro-metin, §4 clay hata rengi.
 */

import { Suspense, useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getSupabaseClient, allowUnauthedDemoBypass } from "@/lib/supabase/client";
import { safeNextPath } from "@/lib/auth/safe-next-path";
import { TrustSubmitButton } from "@/components/trust/TrustSubmitButton";
import { SecurePaymentCapsule } from "@/components/trust/SecurePaymentCapsule";
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

function LoginForm() {
  const searchParams = useSearchParams();
  const nextPath = safeNextPath(searchParams.get("next"), "/connect");
  const passwordRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState("");
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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
    if (!password) {
      setFormError("Şifrenizi girin.");
      return;
    }
    setLoading(true);

    const supabase = getSupabaseClient();
    if (!supabase) {
      if (!allowUnauthedDemoBypass()) {
        setLoading(false);
        setFormError("Kimlik doğrulama yapılandırılmamış. Lütfen daha sonra tekrar deneyin.");
        return;
      }
      await new Promise((r) => setTimeout(r, 500));
      window.location.assign(nextPath);
      return;
    }

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        const msg = error.message ?? "";
        if (/email not confirmed|Email not confirmed/i.test(msg)) {
          window.location.assign(`/dogrula-email?email=${encodeURIComponent(email.trim())}`);
          return;
        }
        setFormError(
          msg === "Invalid login credentials"
            ? "E-posta veya şifre kayıtlarımızla eşleşmiyor."
            : "Giriş yapılamadı. Lütfen tekrar deneyin.",
        );
        return;
      }

      const { data: userData } = await supabase.auth.getUser();
      if (userData.user && !userData.user.email_confirmed_at) {
        window.location.assign(
          `/dogrula-email?email=${encodeURIComponent(userData.user.email ?? email.trim())}`,
        );
        return;
      }

      window.location.assign(nextPath);
    } catch {
      setFormError("Bağlantı hatası. İnternetinizi kontrol edip tekrar deneyin.");
    } finally {
      setLoading(false);
    }
  }

  if (!mounted) {
    return (
      <div className="w-full max-w-[400px] text-center text-muted-foreground text-sm py-12">
        Yükleniyor…
      </div>
    );
  }

  return (
    <div className="w-full max-w-[400px] bg-card border border-border rounded-[var(--tm-r-ui)] p-8 sm:p-10">
      <h1 className="font-heading text-[22px] font-semibold tracking-tight text-foreground mb-2 leading-tight">
        Hesabınıza giriş yapın
      </h1>
      <p className="text-sm text-muted-foreground mb-8">
        Pazaryeri kâr verilerinize güvenli erişim.
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
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (emailError) setEmailError("");
            }}
            onBlur={validateEmail}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                passwordRef.current?.focus();
              }
            }}
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

        <SecurePaymentCapsule hint="Şifreniz şifrelenmiş bağlantı ile iletilir.">
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <label htmlFor="password" className="block text-sm font-medium text-foreground">
                Şifre
              </label>
              <Link
                href="/sifremi-unuttum"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Şifremi unuttum
              </Link>
            </div>
            <input
              ref={passwordRef}
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full border border-input bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 rounded-[var(--tm-r-data)] transition-colors focus:outline-none focus:ring-2 focus:ring-ring hover:border-foreground/30"
            />
          </div>
        </SecurePaymentCapsule>

        {formError && (
          <div role="alert" className="tm-field-error-box">
            {formError}
          </div>
        )}

        <div className="pt-1">
          <TrustSubmitButton disabled={loading} seal="256-bit şifreleme · oturum güvenliği">
            {loading ? "Giriş yapılıyor…" : "Giriş yap"}
          </TrustSubmitButton>
        </div>
      </form>

      <p className="mt-8 text-center text-sm text-muted-foreground">
        Hesabınız yok mu?{" "}
        <Link href="/signup" className="font-medium text-foreground underline-offset-4 hover:underline">
          Kaydol
        </Link>
      </p>
    </div>
  );
}

function LoginShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-16">
      <div className="mb-10">
        <Logo />
      </div>
      {children}
    </div>
  );
}

export default function LoginPage() {
  return (
    <LoginShell>
      <Suspense
        fallback={
          <div className="w-full max-w-[400px] text-center text-muted-foreground text-sm py-12">
            Yükleniyor…
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </LoginShell>
  );
}
