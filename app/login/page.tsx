"use client";

/**
 * Sign-in screen.
 *
 * Design: light theme (matches landing), narrow card, single-column linear form.
 * Trust signal at the action point — not relegated to the footer.
 *
 * Auth: real Supabase email/password sign-in (signInWithPassword). If Supabase
 * env vars are not configured, falls back to demo behaviour (straight to
 * /dashboard) so the app still runs without keys.
 */

import { useState, useRef } from "react";
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

function FieldError({ msg }: { msg: string }) {
  return (
    <p role="alert" className="mt-1.5 text-[12px] text-[#c0392b] leading-snug">
      {msg}
    </p>
  );
}

// Lock icon — inline SVG, no dependency
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

// ─── main page ────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const router = useRouter();
  const passwordRef = useRef<HTMLInputElement>(null);

  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState("");
  const [formError, setFormError]   = useState("");
  const [loading, setLoading]   = useState(false);

  function validateEmail() {
    if (!email.trim()) {
      setEmailError("Please enter your email address.");
      return false;
    }
    if (!isValidEmail(email)) {
      setEmailError("That doesn't look like a valid email address.");
      return false;
    }
    setEmailError("");
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    if (!validateEmail()) {
      return;
    }
    if (!password) {
      setFormError("Please enter your password.");
      return;
    }
    setLoading(true);

    const supabase = getSupabaseClient();

    // Demo fallback: no Supabase keys configured → keep the app usable.
    if (!supabase) {
      await new Promise((r) => setTimeout(r, 500));
      router.push("/connect");
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setLoading(false);
      setFormError(
        error.message === "Invalid login credentials"
          ? "Email or password doesn't match our records."
          : error.message
      );
      return;
    }

    // /connect sends already-onboarded users straight to /dashboard.
    router.push("/connect");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-16">
      {/* Logo — links back to landing */}
      <div className="mb-10">
        <Logo />
      </div>

      {/* Card */}
      <div className="w-full max-w-[400px] bg-card border border-border p-8 sm:p-10">
        <h1 className="text-[22px] font-semibold tracking-tight text-foreground mb-8 leading-tight">
          Sign in to your account
        </h1>

        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          {/* Email */}
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-foreground mb-1.5"
            >
              Email address
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => { setEmail(e.target.value); if (emailError) setEmailError(""); }}
              onBlur={validateEmail}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); passwordRef.current?.focus(); } }}
              placeholder="you@company.com"
              aria-describedby={emailError ? "email-error" : undefined}
              aria-invalid={!!emailError}
              className={`w-full border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 transition-colors
                focus:outline-none focus:ring-2 focus:ring-ring focus:bg-card
                ${emailError ? "border-[#c0392b]" : "border-input hover:border-foreground/30"}`}
            />
            {emailError && <FieldError msg={emailError} />}
          </div>

          {/* Password */}
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <label htmlFor="password" className="block text-sm font-medium text-foreground">
                Password
              </label>
              <Link
                href="#"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                Forgot password?
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
              className="w-full border border-input bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 transition-colors
                focus:outline-none focus:ring-2 focus:ring-ring focus:bg-card hover:border-foreground/30"
            />
          </div>

          {/* Form-level error (auth failure) */}
          {formError && (
            <div
              role="alert"
              className="border border-[#c0392b]/40 bg-[#c0392b]/5 px-3 py-2.5 text-[12px] text-[#c0392b] leading-snug"
            >
              {formError}
            </div>
          )}

          {/* Submit + trust signal */}
          <div className="pt-1">
            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center h-10 bg-primary text-primary-foreground text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>

            {/* Trust signal — at the action point, not the footer */}
            <div className="mt-2.5 flex items-center justify-center gap-1.5 text-muted-foreground text-[11px]">
              <LockIcon />
              <span>Encrypted and secure</span>
            </div>
          </div>
        </form>

        {/* Footer link */}
        <p className="mt-8 text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link
            href="/signup"
            className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            Open account
          </Link>
        </p>
      </div>
    </div>
  );
}
