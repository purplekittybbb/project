"use client";

/**
 * Open account screen.
 *
 * Design: light theme (matches landing), narrow card, single-column linear form.
 * Transparent data-use statement near the action point — not buried.
 *
 * Auth: real Supabase email/password sign-up (signUp), with full name + company
 * stored in user_metadata. Passwords are hashed & stored by Supabase. If env vars
 * are not configured, falls back to demo behaviour (straight to /dashboard).
 */

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getSupabaseClient, allowUnauthedDemoBypass } from "@/lib/supabase/client";
import { TrustSubmitButton } from "@/components/trust/TrustSubmitButton";
import { SecurePaymentCapsule } from "@/components/trust/SecurePaymentCapsule";
import { FIELD_ERROR_BORDER } from "@/lib/design/financial-ui";
import { Suspense } from "react";

// ─── helpers ─────────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(v: string) {
  return EMAIL_RE.test(v.trim());
}

// ─── small components ────────────────────────────────────────────────────────

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

// ─── field component ─────────────────────────────────────────────────────────

interface FieldProps {
  id: string;
  label: string;
  type?: string;
  autoComplete?: string;
  value: string;
  placeholder?: string;
  error?: string;
  autoFocus?: boolean;
  onChange: (v: string) => void;
  onBlur?: () => void;
}

function Field({
  id, label, type = "text", autoComplete, value, placeholder,
  error, autoFocus, onChange, onBlur,
}: FieldProps) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-foreground mb-1.5">
        {label}
      </label>
      <input
        id={id}
        type={type}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        value={value}
        placeholder={placeholder}
        aria-describedby={error ? `${id}-error` : undefined}
        aria-invalid={!!error}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        className={`w-full border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 rounded-[var(--tm-r-data)] transition-colors
          focus:outline-none focus:ring-2 focus:ring-ring focus:bg-card
          ${error ? FIELD_ERROR_BORDER : "border-input hover:border-foreground/30"}`}
      />
      {error && (
        <p id={`${id}-error`} role="alert" className="tm-field-error">
          {error}
        </p>
      )}
    </div>
  );
}

// ─── main page ────────────────────────────────────────────────────────────────

interface FormState {
  fullName: string;
  email: string;
  company: string;
  password: string;
}

interface ErrorState {
  fullName: string;
  email: string;
  company: string;
  password: string;
}

const EMPTY: FormState  = { fullName: "", email: "", company: "", password: "" };
const NO_ERR: ErrorState = { fullName: "", email: "", company: "", password: "" };

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <SignupForm />
    </Suspense>
  );
}

function SignupForm() {
  const searchParams = useSearchParams();
  const planParam = searchParams.get("plan");
  const paidPlan = planParam === "pro" || planParam === "starter" ? planParam : null;
  /** After auth: paid plans land on settings billing; others on connect. */
  const afterAuthPath = paidPlan
    ? `/settings?tab=abonelik&plan=${paidPlan}`
    : "/connect";

  const [form, setForm]     = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<ErrorState>(NO_ERR);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  function set(field: keyof FormState) {
    return (v: string) => {
      setForm((f) => ({ ...f, [field]: v }));
      if (errors[field]) setErrors((e) => ({ ...e, [field]: "" }));
    };
  }

  function validateField(field: keyof FormState): string {
    const v = form[field].trim();
    if (field === "fullName"  && !v) return "Ad soyad girin.";
    if (field === "company"   && !v) return "Şirket veya mağaza adını girin.";
    if (field === "email"     && !v) return "E-posta adresinizi girin.";
    if (field === "email"     && !isValidEmail(v)) return "Geçerli bir e-posta adresi girin.";
    if (field === "password"  && !v) return "Bir şifre belirleyin.";
    if (field === "password"  && v.length < 8) return "Şifre en az 8 karakter olmalı.";
    return "";
  }

  function blurField(field: keyof FormState) {
    return () => {
      const msg = validateField(field);
      setErrors((e) => ({ ...e, [field]: msg }));
    };
  }

  function validateAll(): boolean {
    const next: ErrorState = {
      fullName: validateField("fullName"),
      email:    validateField("email"),
      company:  validateField("company"),
      password: validateField("password"),
    };
    setErrors(next);
    return Object.values(next).every((v) => !v);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setNotice("");
    if (!validateAll()) return;
    setLoading(true);
    try {
      const supabase = getSupabaseClient();

      // Demo fallback only when explicitly enabled (never in production).
      if (!supabase) {
        if (!allowUnauthedDemoBypass()) {
          setFormError("Kimlik doğrulama yapılandırılmamış. Lütfen daha sonra tekrar deneyin.");
          return;
        }
        await new Promise((r) => setTimeout(r, 600));
        window.location.assign(afterAuthPath);
        return;
      }

      const email = form.email.trim();
      const origin = window.location.origin;
      const apiRes = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password: form.password,
          fullName: form.fullName.trim(),
          company: form.company.trim(),
          plan: paidPlan,
          emailRedirectTo: `${origin}/api/auth/callback?next=${encodeURIComponent(afterAuthPath)}`,
        }),
        signal: AbortSignal.timeout(15000),
      });
      const apiJson = (await apiRes.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
        needsConfirm?: boolean;
        afterAuth?: string;
        session?: {
          access_token: string;
          refresh_token: string;
        } | null;
      };

      if (!apiRes.ok) {
        setFormError(
          apiJson.error ||
            (apiJson.code === "already_registered"
              ? "Bu e-posta ile kayıtlı bir hesap var. Giriş yapmayı deneyin."
              : "Kayıt tamamlanamadı. Lütfen tekrar deneyin."),
        );
        return;
      }

      if (apiJson.needsConfirm || !apiJson.session) {
        const q = new URLSearchParams({ email });
        if (paidPlan) q.set("plan", paidPlan);
        window.location.assign(`/dogrula-email?${q.toString()}`);
        return;
      }

      const { error: sessionErr } = await supabase.auth.setSession({
        access_token: apiJson.session.access_token,
        refresh_token: apiJson.session.refresh_token,
      });
      if (sessionErr) {
        // Account exists; fall back to password sign-in so cookies still land.
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email,
          password: form.password,
        });
        if (signInErr) {
          setFormError("Hesap oluştu ama oturum açılamadı. Giriş yapmayı deneyin.");
          return;
        }
      }

      window.location.assign(apiJson.afterAuth || afterAuthPath);
    } catch (err) {
      const timedOut =
        (err instanceof Error && (err.name === "TimeoutError" || err.message === "timeout")) ||
        (typeof DOMException !== "undefined" && err instanceof DOMException && err.name === "TimeoutError");
      setFormError(
        timedOut
          ? "Sunucu yanıt vermedi. İnternetinizi kontrol edip tekrar deneyin."
          : "Bağlantı hatası. İnternetinizi kontrol edip tekrar deneyin.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-16">
      {/* Logo */}
      <div className="mb-10">
        <Logo />
      </div>

      {/* Card */}
      <div className="w-full max-w-[400px] bg-card border border-border rounded-[var(--tm-r-ui)] p-8 sm:p-10">
        <h1 className="font-heading text-[22px] font-semibold tracking-tight text-foreground mb-2 leading-tight">
          Hesap oluşturun
        </h1>
        <p className="text-sm text-muted-foreground mb-8">
          Gerçek net kârınızı görmeye başlayın — demo için entegrasyon zorunlu değil.
        </p>

        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          <Field
            id="fullName"
            label="Ad soyad"
            autoComplete="name"
            autoFocus
            value={form.fullName}
            placeholder="Ad Soyad"
            error={errors.fullName}
            onChange={set("fullName")}
            onBlur={blurField("fullName")}
          />

          <Field
            id="email"
            label="E-posta"
            type="email"
            autoComplete="email"
            value={form.email}
            placeholder="siz@sirket.com"
            error={errors.email}
            onChange={set("email")}
            onBlur={blurField("email")}
          />

          <Field
            id="company"
            label="Şirket / mağaza adı"
            autoComplete="organization"
            value={form.company}
            placeholder="Mağaza Adı"
            error={errors.company}
            onChange={set("company")}
            onBlur={blurField("company")}
          />

          <SecurePaymentCapsule hint="Şifreniz hashlenerek saklanır; düz metin tutulmaz.">
            <Field
              id="password"
              label="Şifre"
              type="password"
              autoComplete="new-password"
              value={form.password}
              placeholder="En az 8 karakter"
              error={errors.password}
              onChange={set("password")}
              onBlur={blurField("password")}
            />
          </SecurePaymentCapsule>

          {/* Form-level error (sign-up failure) */}
          {formError && (
            <div role="alert" className="tm-field-error-box">
              {formError}
            </div>
          )}

          {/* Confirmation notice (email verification required) */}
          {notice && (
            <div
              role="status"
              className="border border-border bg-muted px-3 py-2.5 text-[12px] text-foreground leading-snug"
            >
              {notice}
            </div>
          )}

          {/* Submit + trust signals */}
          <div className="pt-1 space-y-3">
            <TrustSubmitButton
              disabled={loading}
              seal="256-bit şifreleme · KVKK uyumlu veri işleme"
            >
              {loading ? "Hesap oluşturuluyor…" : "Kaydol"}
            </TrustSubmitButton>

            <p className="text-center text-[11px] text-muted-foreground leading-relaxed">
              Kaydolarak{" "}
              <Link href="/kullanim-kosullari" className="text-foreground underline underline-offset-2 hover:no-underline">
                Kullanım Koşulları
              </Link>{" "}
              ve{" "}
              <Link href="/gizlilik" className="text-foreground underline underline-offset-2 hover:no-underline">
                Gizlilik Politikası
              </Link>
              'nı kabul etmiş olursunuz.
            </p>

            <p className="text-center text-[11px] text-muted-foreground leading-relaxed">
              Verileriniz yalnızca net kâr hesaplaması için kullanılır; üçüncü tarafla paylaşılmaz.
            </p>
          </div>
        </form>

        {/* Footer link */}
        <p className="mt-8 text-center text-sm text-muted-foreground">
          Zaten hesabınız var mı?{" "}
          <Link
            href="/login"
            className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            Giriş yap
          </Link>
        </p>
      </div>
    </div>
  );
}
