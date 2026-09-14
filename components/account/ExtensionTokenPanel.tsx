"use client";

import { useEffect, useState } from "react";
import { getFreshAccessToken } from "@/lib/supabase/client";

/**
 * "Uzantı" settings panel — lets the user generate a personal access token
 * for the Chrome uzantısı (chrome-extension:// origin, can't share the site's
 * session cookie) and paste it into the extension's popup once.
 *
 * The raw token is shown exactly once, right after generation — the server
 * only ever stores its SHA-256 hash (see supabase/migrations/0033_extension_
 * tokens.sql and app/api/account/extension-token/route.ts), so it can't be
 * re-displayed on a later visit; only "Bağlı" / "Bağlı değil" status + last
 * used time is shown after that.
 */

interface StatusResponse {
  connected: boolean;
  createdAt: string | null;
  lastUsedAt: string | null;
}

export function ExtensionTokenPanel() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadStatus() {
    try {
      const token = await getFreshAccessToken();
      if (!token) return;
      const res = await fetch("/api/account/extension-token", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) setStatus(json as StatusResponse);
      else setStatusError(json.error ?? "Durum yüklenemedi.");
    } catch {
      setStatusError("Durum yüklenemedi.");
    }
  }

  useEffect(() => {
    loadStatus();
  }, []);

  async function generateToken() {
    setError(null);
    setPending(true);
    setCopied(false);
    try {
      const token = await getFreshAccessToken();
      if (!token) {
        setError("Devam etmek için giriş yapmanız gerekiyor.");
        setPending(false);
        return;
      }
      const res = await fetch("/api/account/extension-token", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Token oluşturulamadı.");
        setPending(false);
        return;
      }
      setFreshToken(json.token as string);
      await loadStatus();
    } catch {
      setError("Bağlantı hatası. Lütfen tekrar deneyin.");
    } finally {
      setPending(false);
    }
  }

  async function revokeToken() {
    setError(null);
    setPending(true);
    try {
      const token = await getFreshAccessToken();
      if (!token) {
        setError("Devam etmek için giriş yapmanız gerekiyor.");
        setPending(false);
        return;
      }
      await fetch("/api/account/extension-token", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setFreshToken(null);
      await loadStatus();
    } catch {
      setError("Bağlantı hatası. Lütfen tekrar deneyin.");
    } finally {
      setPending(false);
    }
  }

  async function copyToken() {
    if (!freshToken) return;
    try {
      await navigator.clipboard.writeText(freshToken);
      setCopied(true);
    } catch {
      setError("Kopyalanamadı — token'ı elle seçip kopyalayın.");
    }
  }

  return (
    <div className="border border-zinc-900 bg-zinc-950/50 p-6">
      <div className="text-zinc-600 text-[10px] uppercase tracking-[0.2em] font-sans mb-4">
        Chrome Uzantısı — Hesabı Bağla
      </div>

      <p className="text-zinc-500 font-mono text-[12px] leading-relaxed mb-4">
        Uzantı, gerçek satış verinizle net kâr göstermek için bu token'ı kullanır. Token'ı
        oluşturduktan sonra uzantının popup'ındaki &quot;Hesabı Bağla&quot; alanına yapıştırın.
      </p>

      {statusError && <p className="fin-loss font-mono text-[12px] mb-4">{statusError}</p>}

      {status && (
        <p className="text-zinc-500 font-mono text-[12px] mb-4">
          Durum:{" "}
          <span className={status.connected ? "fin-profit" : "text-zinc-600"}>
            {status.connected ? "Bağlı" : "Bağlı değil"}
          </span>
          {status.connected && status.lastUsedAt && (
            <> — son kullanım {new Date(status.lastUsedAt).toLocaleString("tr-TR")}</>
          )}
        </p>
      )}

      {freshToken && (
        <div className="mb-4 border border-[var(--tm-copper)]/30 bg-[var(--tm-copper)]/5 p-4">
          <p className="text-[var(--tm-copper)] font-mono text-[11px] uppercase tracking-wide mb-2">
            Bu token yalnızca bir kez gösterilir — şimdi kopyalayın
          </p>
          <code className="block break-all text-zinc-300 font-mono text-[12px] mb-3">
            {freshToken}
          </code>
          <button
            type="button"
            onClick={copyToken}
            className="border border-zinc-800 px-3 py-1.5 font-mono text-[11px] text-zinc-300 hover:bg-zinc-900"
          >
            {copied ? "Kopyalandı ✓" : "Kopyala"}
          </button>
        </div>
      )}

      {error && <p className="fin-loss font-mono text-[12px] mb-4">{error}</p>}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={generateToken}
          disabled={pending}
          className="tm-btn-primary inline-flex h-9 items-center justify-center px-4 text-sm font-medium disabled:opacity-60"
        >
          {status?.connected ? "Token'ı Yenile" : "Bağlan"}
        </button>
        {status?.connected && (
          <button
            type="button"
            onClick={revokeToken}
            disabled={pending}
            className="border border-zinc-800 px-4 text-sm text-zinc-400 hover:bg-zinc-900 disabled:opacity-60"
          >
            Bağlantıyı Kaldır
          </button>
        )}
      </div>
    </div>
  );
}
