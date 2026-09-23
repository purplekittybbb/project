"use client";

/**
 * Shopify connect — real Partner-app OAuth (live path), not an API-key form.
 *
 * Collects store domain → POST /api/shopify/oauth/start → top-level redirect
 * to Shopify. Kept available for live OAuth flows; MarketplaceConnectStep
 * defaults to MarketplaceOAuthModal (demo) instead so Connect does not require
 * a session + SHOPIFY_CLIENT_ID.
 */

import { useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { normalizeShopDomain } from "@/lib/shopify-api/client";
import { LockIcon } from "@/components/trust/LockIcon";
import { SecurePaymentCapsule } from "@/components/trust/SecurePaymentCapsule";

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
          Shopify mağazanızı bağlayın
        </h2>
        <p className="text-zinc-600 text-[11px] leading-relaxed mb-4 border-l border-zinc-800 pl-3">
          Siparişlerinize salt-okunur erişimi onaylamak için Shopify&apos;a yönlendirileceksiniz. Şifrenizi asla görmeyiz.
        </p>

        <form onSubmit={handleContinue} className="space-y-3">
          <SecurePaymentCapsule hint="Mağaza alan adı · güvenli OAuth yönlendirmesi">
            <div>
              <label htmlFor="shopify-shop" className="block text-[11px] text-zinc-500 mb-1">
                Mağaza alan adı
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
          </SecurePaymentCapsule>

          {error && <p className="fin-loss text-[11px] font-mono">{error}</p>}

          <p className="text-zinc-600 text-[11px] leading-relaxed border-t border-zinc-800 pt-3">
            Bu bağlantıyı yalnızca sipariş verinizi OKUMAK için kullanırız. Asla sipariş vermez veya para hareketi yapmayız.
          </p>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="flex-1 h-10 border border-zinc-800 text-zinc-400 text-sm hover:border-zinc-600 hover:text-zinc-200 transition-colors disabled:opacity-50"
            >
              Vazgeç
            </button>
            <button
              type="submit"
              disabled={busy}
              className="flex-1 h-10 bg-zinc-100 text-zinc-950 text-sm font-semibold hover:bg-zinc-200 transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
            >
              <LockIcon />
              {busy ? "Yönlendiriliyor…" : "Shopify'a devam et"}
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
