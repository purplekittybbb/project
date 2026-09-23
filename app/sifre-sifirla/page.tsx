"use client";

/** Şifre sıfırlama — /sifremi-unuttum e-postasındaki bağlantıdan gelinir. */

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseClient, isAuthConfigured } from "@/lib/supabase/client";
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

export default function SifreSifirlaPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Bağlantı doğrulanıyor…</div>}>
      <SifreSifirlaContent />
    </Suspense>
  );
}

function SifreSifirlaContent() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [linkInvalid, setLinkInvalid] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!isAuthConfigured()) {
      setLinkInvalid(true);
      setReady(true);
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) {
      setLinkInvalid(true);
      setReady(true);
      return;
    }
    // Supabase's client SDK reads the recovery token from the URL hash on
    // load and turns it into a session automatically (detectSessionInUrl,
    // default true) — we just need to confirm a session actually exists
    // before letting the user submit a new password.
    let cancelled = false;
    let sawRecovery = false;
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "PASSWORD_RECOVERY") {
        sawRecovery = true;
        setReady(true);
        setLinkInvalid(false);
        return;
      }
      // Only unlock for a normal session if we already saw PASSWORD_RECOVERY
      // (hash exchange). A stale logged-in session alone is not enough.
      if (sawRecovery && session) {
        setReady(true);
      }
    });
    // Give the URL hash a moment to fire PASSWORD_RECOVERY.
    const timer = setTimeout(() => {
      if (cancelled) return;
      if (!sawRecovery) {
        setLinkInvalid(true);
        setReady(true);
      }
    }, 1500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      sub.subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Şifreniz en az 8 karakter olmalı.");
      return;
    }
    if (password !== confirm) {
      setError("Şifreler eşleşmiyor.");
      return;
    }
    setLoading(true);
    const supabase = getSupabaseClient();
    if (!supabase) {
      setLoading(false);
      setError("Sunucu yapılandırması eksik.");
      return;
    }
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateError) {
      setError("Şifre güncellenemedi. Bağlantı süresi dolmuş olabilir — yeniden deneyin.");
      return;
    }
    setDone(true);
    setTimeout(() => router.push("/connect"), 1800);
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-16">
      <div className="mb-10">
        <Logo />
      </div>

      <div className="w-full max-w-[400px] bg-card border border-border rounded-[var(--tm-r-ui)] p-8 sm:p-10">
        {!ready ? (
          <p className="text-sm text-muted-foreground">Bağlantı doğrulanıyor…</p>
        ) : linkInvalid ? (
          <>
            <h1 className="font-heading text-[22px] font-semibold tracking-tight text-foreground mb-2 leading-tight">
              Bağlantı geçersiz veya süresi dolmuş
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Şifre sıfırlama bağlantıları 1 saat sonra geçerliliğini yitirir. Yeni bir bağlantı isteyin.
            </p>
            <Link
              href="/sifremi-unuttum"
              className="mt-8 inline-flex text-sm font-medium text-foreground underline-offset-4 hover:underline"
            >
              Yeniden dene
            </Link>
          </>
        ) : done ? (
          <>
            <h1 className="font-heading text-[22px] font-semibold tracking-tight text-foreground mb-2 leading-tight">
              Şifreniz güncellendi ✓
            </h1>
            <p className="text-sm text-muted-foreground">Panele yönlendiriliyorsunuz…</p>
          </>
        ) : (
          <>
            <h1 className="font-heading text-[22px] font-semibold tracking-tight text-foreground mb-2 leading-tight">
              Yeni şifre belirleyin
            </h1>
            <p className="text-sm text-muted-foreground mb-8">En az 8 karakter olmalı.</p>

            <form onSubmit={handleSubmit} noValidate className="space-y-5">
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-foreground mb-1.5">
                  Yeni şifre
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className={`w-full border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 rounded-[var(--tm-r-data)] transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:bg-card ${
                    error ? FIELD_ERROR_BORDER : "border-input hover:border-foreground/30"
                  }`}
                />
              </div>
              <div>
                <label htmlFor="confirm" className="block text-sm font-medium text-foreground mb-1.5">
                  Yeni şifre (tekrar)
                </label>
                <input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  className={`w-full border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 rounded-[var(--tm-r-data)] transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:bg-card ${
                    error ? FIELD_ERROR_BORDER : "border-input hover:border-foreground/30"
                  }`}
                />
              </div>

              {error && (
                <div role="alert" className="tm-field-error-box">
                  {error}
                </div>
              )}

              <div className="pt-1">
                <TrustSubmitButton
                  disabled={loading}
                  seal="256-bit şifreleme · oturum güvenliği"
                >
                  {loading ? "Kaydediliyor…" : "Şifreyi güncelle"}
                </TrustSubmitButton>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
