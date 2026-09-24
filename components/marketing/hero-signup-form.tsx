"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
import { FIELD_ERROR_BORDER, FIELD_ERROR_TEXT_ON_DARK } from "@/lib/design/financial-ui";
import { TrustSubmitButton } from "@/components/trust/TrustSubmitButton";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function HeroSignupForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");

    const trimmedEmail = email.trim();
    if (!EMAIL_RE.test(trimmedEmail)) {
      setError("Geçerli bir e-posta girin.");
      return;
    }
    if (password.length < 8) {
      setError("Şifre en az 8 karakter olmalı.");
      return;
    }

    setLoading(true);
    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        router.push("/signup");
        return;
      }

      const signUp = supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/api/auth/callback?next=${encodeURIComponent("/connect")}`,
          data: {
            full_name: trimmedEmail.split("@")[0] || "Satıcı",
            company: "",
          },
        },
      });
      const timed = new Promise<Awaited<typeof signUp>>((_, reject) => {
        window.setTimeout(() => reject(new Error("timeout")), 15000);
      });
      const { data, error: signErr } = await Promise.race([signUp, timed]);

      if (signErr) {
        setError(
          /already registered|already exists/i.test(signErr.message)
            ? "Bu e-posta ile kayıtlı bir hesap var. Giriş yapmayı deneyin."
            : "Kayıt tamamlanamadı. Lütfen tekrar deneyin.",
        );
        return;
      }
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        setError("Bu e-posta ile kayıtlı bir hesap var. Giriş yapmayı deneyin.");
        return;
      }
      if (!data.session || !data.user?.email_confirmed_at) {
        window.location.assign(`/dogrula-email?email=${encodeURIComponent(trimmedEmail)}`);
        return;
      }
      window.location.assign("/connect");
    } catch (err) {
      setError(
        err instanceof Error && err.message === "timeout"
          ? "Sunucu yanıt vermedi. İnternetinizi kontrol edip tekrar deneyin."
          : "Bağlantı hatası. İnternetinizi kontrol edip tekrar deneyin.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-[var(--tm-r-ui)] border border-[color-mix(in_srgb,var(--tm-paper)_18%,transparent)] bg-[color-mix(in_srgb,var(--tm-paper)_8%,transparent)] p-6 lg:p-8">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-[color-mix(in_srgb,var(--tm-paper)_55%,transparent)]">
        Ücretsiz başla
      </p>
      <p className="mt-2 text-sm text-[color-mix(in_srgb,var(--tm-paper)_75%,transparent)]">
        E-posta ve şifre — tek adımda hesap açın.
      </p>
      <form onSubmit={onSubmit} className="mt-6 space-y-3" aria-describedby={error ? "hero-signup-error" : undefined}>
        <div>
          <label htmlFor="hero-signup-email" className="sr-only">
            E-posta
          </label>
          <input
            id="hero-signup-email"
            type="email"
            autoComplete="email"
            placeholder="E-posta"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={Boolean(error)}
            className={`w-full rounded-md border bg-[var(--tm-paper)] px-3 py-2.5 text-sm text-foreground ${error ? FIELD_ERROR_BORDER : "border-input"}`}
          />
        </div>
        <div>
          <label htmlFor="hero-signup-password" className="sr-only">
            Şifre
          </label>
          <input
            id="hero-signup-password"
            type="password"
            autoComplete="new-password"
            placeholder="Şifre (min. 8 karakter)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={Boolean(error)}
            className={`w-full rounded-md border bg-[var(--tm-paper)] px-3 py-2.5 text-sm text-foreground ${error ? FIELD_ERROR_BORDER : "border-input"}`}
          />
        </div>
        {error && (
          <p id="hero-signup-error" role="alert" className={`text-xs ${FIELD_ERROR_TEXT_ON_DARK}`}>
            {error}
          </p>
        )}
        {notice && <p className="text-xs text-[color-mix(in_srgb,var(--tm-paper)_85%,transparent)]">{notice}</p>}
        <TrustSubmitButton
          disabled={loading}
          showSeal={false}
          className="rounded-[var(--tm-r-ui)] bg-[var(--tm-copper)] py-3 text-sm font-medium text-[var(--tm-paper)] transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {loading ? "Kaydediliyor…" : "Ücretsiz Başla"}
        </TrustSubmitButton>

        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 pt-1 text-[11px] text-[color-mix(in_srgb,var(--tm-paper)_60%,transparent)]">
          <span className="inline-flex items-center gap-1">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <rect x="4" y="10" width="16" height="10" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
            256-bit SSL şifreleme
          </span>
          <span className="inline-flex items-center gap-1">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
            KVKK uyumlu
          </span>
          <span className="inline-flex items-center gap-1">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <rect x="2" y="6" width="20" height="12" rx="2" />
              <path d="M2 10h20" />
            </svg>
            Kredi kartı istenmez
          </span>
        </div>
      </form>
      <p className="mt-4 text-center text-xs text-[color-mix(in_srgb,var(--tm-paper)_55%,transparent)]">
        Zaten hesabınız var?{" "}
        <Link href="/login" className="underline underline-offset-2">
          Giriş yapın
        </Link>
      </p>
    </div>
  );
}
