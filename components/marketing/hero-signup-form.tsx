"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
import { FIELD_ERROR_BORDER, FIELD_ERROR_TEXT_ON_DARK } from "@/lib/design/financial-ui";

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
    const supabase = getSupabaseClient();
    if (!supabase) {
      router.push("/signup");
      return;
    }

    const { data, error: signErr } = await supabase.auth.signUp({
      email: trimmedEmail,
      password,
    });

    setLoading(false);
    if (signErr) {
      setError(signErr.message);
      return;
    }
    if (!data.session) {
      setNotice("Hesap oluşturuldu. E-postanızdaki onay bağlantısına tıklayın.");
      return;
    }
    router.push("/connect");
  }

  return (
    <div className="rounded-[var(--tm-r-ui)] border border-[color-mix(in_srgb,var(--tm-paper)_18%,transparent)] bg-[color-mix(in_srgb,var(--tm-paper)_8%,transparent)] p-6 lg:p-8">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-[color-mix(in_srgb,var(--tm-paper)_55%,transparent)]">
        Ücretsiz başla
      </p>
      <p className="mt-2 text-sm text-[color-mix(in_srgb,var(--tm-paper)_75%,transparent)]">
        E-posta ve şifre — tek adımda hesap açın.
      </p>
      <form onSubmit={onSubmit} className="mt-6 space-y-3">
        <input
          type="email"
          autoComplete="email"
          placeholder="E-posta"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={`w-full rounded-md border bg-[var(--tm-paper)] px-3 py-2.5 text-sm text-foreground ${error ? FIELD_ERROR_BORDER : "border-input"}`}
        />
        <input
          type="password"
          autoComplete="new-password"
          placeholder="Şifre (min. 8 karakter)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={`w-full rounded-md border bg-[var(--tm-paper)] px-3 py-2.5 text-sm text-foreground ${error ? FIELD_ERROR_BORDER : "border-input"}`}
        />
        {error && <p className={`text-xs ${FIELD_ERROR_TEXT_ON_DARK}`}>{error}</p>}
        {notice && <p className="text-xs text-[color-mix(in_srgb,var(--tm-paper)_85%,transparent)]">{notice}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-[var(--tm-copper)] py-3 text-sm font-medium text-[var(--tm-paper)] disabled:opacity-60"
        >
          {loading ? "Kaydediliyor…" : "Ücretsiz Başla"}
        </button>
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
