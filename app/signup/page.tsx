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
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase/client";

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

function FieldError({ id, msg }: { id: string; msg: string }) {
  return (
    <p id={id} role="alert" className="mt-1.5 text-[12px] text-[#c0392b] leading-snug">
      {msg}
    </p>
  );
}

function LockIcon() {
  return (
    <svg
      width="12" height="12" viewBox="0 0 16 16" fill="none"
      aria-hidden="true" className="shrink-0"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="3" y="7" width="10" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
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
        className={`w-full border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 transition-colors
          focus:outline-none focus:ring-2 focus:ring-ring focus:bg-card
          ${error ? "border-[#c0392b]" : "border-input hover:border-foreground/30"}`}
      />
      {error && <FieldError id={`${id}-error`} msg={error} />}
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
  const router = useRouter();

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
    if (field === "fullName"  && !v) return "Please enter your full name.";
    if (field === "company"   && !v) return "Please enter your company or store name.";
    if (field === "email"     && !v) return "Please enter your email address.";
    if (field === "email"     && !isValidEmail(v)) return "That doesn't look like a valid email address.";
    if (field === "password"  && !v) return "Please choose a password.";
    if (field === "password"  && v.length < 8) return "Password must be at least 8 characters.";
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

    const supabase = getSupabaseClient();

    // Demo fallback: no Supabase keys configured → keep the app usable.
    if (!supabase) {
      await new Promise((r) => setTimeout(r, 600));
      router.push("/connect");
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password,
      options: {
        data: {
          full_name: form.fullName.trim(),
          company: form.company.trim(),
        },
      },
    });

    if (error) {
      setLoading(false);
      setFormError(
        /already registered|already exists/i.test(error.message)
          ? "An account with this email already exists. Try signing in instead."
          : error.message
      );
      return;
    }

    // If email confirmation is required, no session is returned yet.
    if (!data.session) {
      setLoading(false);
      setNotice("Account created. Please check your email to confirm your address, then sign in.");
      return;
    }

    // New accounts always go through /connect first.
    router.push("/connect");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-16">
      {/* Logo */}
      <div className="mb-10">
        <Logo />
      </div>

      {/* Card */}
      <div className="w-full max-w-[400px] bg-card border border-border p-8 sm:p-10">
        <h1 className="text-[22px] font-semibold tracking-tight text-foreground mb-2 leading-tight">
          Open your account
        </h1>
        <p className="text-sm text-muted-foreground mb-8">
          Start seeing your real margin — no integrations required for the demo.
        </p>

        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          <Field
            id="fullName"
            label="Full name"
            autoComplete="name"
            autoFocus
            value={form.fullName}
            placeholder="Ada Lovelace"
            error={errors.fullName}
            onChange={set("fullName")}
            onBlur={blurField("fullName")}
          />

          <Field
            id="email"
            label="Email address"
            type="email"
            autoComplete="email"
            value={form.email}
            placeholder="you@company.com"
            error={errors.email}
            onChange={set("email")}
            onBlur={blurField("email")}
          />

          <Field
            id="company"
            label="Company / store name"
            autoComplete="organization"
            value={form.company}
            placeholder="Acme Electronics"
            error={errors.company}
            onChange={set("company")}
            onBlur={blurField("company")}
          />

          <Field
            id="password"
            label="Password"
            type="password"
            autoComplete="new-password"
            value={form.password}
            placeholder="8+ characters"
            error={errors.password}
            onChange={set("password")}
            onBlur={blurField("password")}
          />

          {/* Form-level error (sign-up failure) */}
          {formError && (
            <div
              role="alert"
              className="border border-[#c0392b]/40 bg-[#c0392b]/5 px-3 py-2.5 text-[12px] text-[#c0392b] leading-snug"
            >
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
            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center h-10 bg-primary text-primary-foreground text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              {loading ? "Creating account…" : "Create account"}
            </button>

            {/* Trust signal at action point */}
            <div className="flex items-center justify-center gap-1.5 text-muted-foreground text-[11px]">
              <LockIcon />
              <span>Encrypted and secure</span>
            </div>

            {/* Transparent data-use statement */}
            <p className="text-center text-[11px] text-muted-foreground leading-relaxed">
              We use your data only to calculate your true margin.
            </p>
          </div>
        </form>

        {/* Footer link */}
        <p className="mt-8 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
