"use client";

/**
 * Shopify connect — real OAuth (live path), not an API-key form.
 *
 * Opened from MarketplaceConnectStep when isShopifyLiveEnabled() is true
 * (SHOPIFY_CLIENT_ID set). Collects store domain → POST /api/shopify/oauth/start
 * → top-level redirect to Shopify. When env is missing, Connect falls back to
 * MarketplaceOAuthModal (demo) instead.
 */

import { useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { normalizeShopDomain } from "@/lib/shopify-api/client";

function LockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0">
      <rect x="3" y="7" width="10" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ShopifyConnectModal({ open, onClose }: Props) {
  const [shop, setShop] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  async function handleContinue(e: React.FormEvent) {
    e.preventDefault();
    if (!shop.trim()) {
      setError("Mağaza adresi gerekli.");
      return;
    }
    setError("");
    setBusy(true);

    const supabase = getSupabaseClient();
    const { data: sessionData } = supabase
      ? await supabase.auth.getSession()
      : { data: { session: null } };
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      setError("Oturum bulunamadı — lütfen tekrar giriş yapın.");
      setBusy(false);
      return;
    }

    let res: Response;
    try {
      res = await fetch("/api/shopify/oauth/start", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ shop: normalizeShopDomain(shop) }),
      });
    } catch {
      setError("Shopify'a bağlanılamadı. İnternet bağlantınızı kontrol edin.");
      setBusy(false);
      return;
    }

    const result = await res.json().catch(() => ({}));
    if (!res.ok || !result.redirectUrl) {
      setError(result.error ?? "Shopify'a bağlanılamadı.");
      setBusy(false);
      return;
    }

    // Real, full-page redirect to Shopify's own site — the merchant
    // approves access there, never inside this modal.
    window.location.href = result.redirectUrl;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shopify-modal-title"
    >
      <div className="w-full max-w-[440px] border border-zinc-800 bg-zinc-950 p-6">
        <div className="flex items-center gap-2 mb-3 pb-3 border-b border-zinc-800">
          <span className="text-zinc-100 font-mono text-sm font-medium">Shopify</span>
          <span className="text-zinc-600 text-[10px] uppercase tracking-widest">oauth</span>
        </div>
        <h2 id="shopify-modal-title" className="text-zinc-100 text-[15px] font-medium leading-snug mb-2">
          Connect your Shopify store
        </h2>
        <p className="text-zinc-600 text-[11px] leading-relaxed mb-4 border-l border-zinc-800 pl-3">
          You&apos;ll be redirected to Shopify to approve read-only access to your orders. We never see your password.
        </p>

        <form onSubmit={handleContinue} className="space-y-3">
          <div>
            <label htmlFor="shopify-shop" className="block text-[11px] text-zinc-500 mb-1">
              Store domain
            </label>
            <input
              id="shopify-shop"
              type="text"
              autoComplete="off"
              value={shop}
              onChange={(e) => setShop(e.target.value)}
              placeholder="mystore.myshopify.com"
              className="w-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 font-mono placeholder:text-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-600 focus:border-zinc-600"
            />
          </div>

          {error && <p className="text-red-400 text-[11px] font-mono">{error}</p>}

          <p className="text-zinc-600 text-[11px] leading-relaxed border-t border-zinc-800 pt-3">
            We only use this connection to READ your order data. We never place orders or move money.
          </p>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="flex-1 h-10 border border-zinc-800 text-zinc-400 text-sm hover:border-zinc-600 hover:text-zinc-200 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="flex-1 h-10 bg-zinc-100 text-zinc-950 text-sm font-semibold hover:bg-zinc-200 transition-colors disabled:opacity-50"
            >
              {busy ? "Redirecting…" : "Continue to Shopify"}
            </button>
          </div>
        </form>

        <div className="mt-3 flex items-center justify-center gap-1.5 text-zinc-600 text-[10px]">
          <LockIcon />
          <span>Real OAuth · read-only scope</span>
        </div>
      </div>
    </div>
  );
}
