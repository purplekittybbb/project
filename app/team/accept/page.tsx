"use client";

/** Ekip daveti kabul sayfası — /team/accept?token=... */

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getSupabaseClient, isAuthConfigured } from "@/lib/supabase/client";

type Status = "checking" | "needs-login" | "accepting" | "accepted" | "error";

export default function TeamAcceptPage() {
  return (
    <Suspense fallback={null}>
      <TeamAcceptContent />
    </Suspense>
  );
}

function TeamAcceptContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [status, setStatus] = useState<Status>("checking");
  const [message, setMessage] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("Geçersiz davet bağlantısı.");
      return;
    }
    if (!isAuthConfigured()) {
      setStatus("error");
      setMessage("Kimlik doğrulama yapılandırılmadı.");
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) {
      setStatus("error");
      setMessage("Sunucu yapılandırması eksik.");
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!data.user) {
        setStatus("needs-login");
        return;
      }
      setStatus("accepting");
      const res = await fetch("/api/team/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = await res.json().catch(() => ({}));
      if (cancelled) return;
      if (!res.ok) {
        setStatus("error");
        setMessage(body.error ?? "Davet kabul edilemedi.");
        return;
      }
      setOwnerEmail(body.ownerEmail ?? "");
      setStatus("accepted");
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="max-w-sm w-full text-center space-y-4">
        <span className="text-zinc-100 font-mono tracking-tight text-lg font-medium">TrueMargin</span>

        {status === "checking" && (
          <p className="text-zinc-500 text-sm font-mono">Kontrol ediliyor…</p>
        )}

        {status === "needs-login" && (
          <div className="space-y-3">
            <p className="text-zinc-300 text-sm">Daveti kabul etmek için önce giriş yapın.</p>
            <Link
              href="/login"
              className="inline-flex h-10 px-5 items-center justify-center bg-zinc-100 text-zinc-950 text-sm font-semibold hover:bg-zinc-200 transition-colors"
            >
              Giriş yap
            </Link>
            <p className="text-zinc-600 text-[11px]">Giriş yaptıktan sonra bu bağlantıyı tekrar açın.</p>
          </div>
        )}

        {status === "accepting" && <p className="text-zinc-500 text-sm font-mono">Davet kabul ediliyor…</p>}

        {status === "accepted" && (
          <div className="space-y-3">
            <p className="fin-profit text-sm font-medium">Davet kabul edildi ✓</p>
            <p className="text-zinc-500 text-sm">
              Artık {ownerEmail || "bu hesabın"} verilerini panelde salt-okunur olarak görüntüleyebilirsiniz.
            </p>
            <Link
              href="/dashboard"
              className="inline-flex h-10 px-5 items-center justify-center bg-zinc-100 text-zinc-950 text-sm font-semibold hover:bg-zinc-200 transition-colors"
            >
              Panele git
            </Link>
          </div>
        )}

        {status === "error" && <p className="fin-loss text-sm">{message}</p>}
      </div>
    </div>
  );
}
