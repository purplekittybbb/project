"use client";

/**
 * Plaid/Rutter-style OAuth consent modal (demo).
 *
 * Phases: redirecting → consent (Authorize/Cancel) → connecting → fetching → connected
 * No password fields. Read-only scopes shown explicitly.
 */

import { useCallback, useEffect, useState } from "react";
import { completeDemoLink, simulateInitialSync } from "@/lib/connect/demo-provider";
import type { MarketplaceConnection, OAuthPhase } from "@/lib/connect/types";
import { READ_ONLY_SCOPES } from "@/lib/connect/types";
import { getMarketplaceOption } from "@/lib/marketplaces";
import { LockIcon } from "@/components/trust/LockIcon";

const READ_ONLY_COPY =
  "Verinizi yalnızca OKUYABİLİRİZ. Asla değiştirmeyiz, sipariş vermeyiz veya ödemelere erişmeyiz.";

interface Props {
  marketplaceId: string | null;
  open: boolean;
  onClose: () => void;
  onConnected: (conn: MarketplaceConnection) => void;
}

export function MarketplaceOAuthModal({ marketplaceId, open, onClose, onConnected }: Props) {
  const [phase, setPhase] = useState<OAuthPhase>("redirecting");
  const [syncError, setSyncError] = useState("");
  const opt = marketplaceId ? getMarketplaceOption(marketplaceId) : undefined;
  const platformName = opt?.label ?? "Marketplace";

  const reset = useCallback(() => setPhase("redirecting"), []);

  useEffect(() => {
    if (!open || !marketplaceId) return;
    reset();
    setSyncError("");
    const t = setTimeout(() => setPhase("consent"), 900);
    return () => clearTimeout(t);
  }, [open, marketplaceId, reset]);

  async function handleAuthorize() {
    if (!marketplaceId) return;
    setSyncError("");
    setPhase("connecting");
    await new Promise((r) => setTimeout(r, 700));
    setPhase("fetching");
    const conn = await completeDemoLink(marketplaceId);
    const sync = await simulateInitialSync(conn);
    if (sync.error) {
      setSyncError(sync.error);
      setPhase("consent");
      return;
    }
    setPhase("connected");
    onConnected(conn);
    setTimeout(onClose, 1100);
  }

  function handleCancel() {
    setPhase("cancelled");
    onClose();
  }

  if (!open || !marketplaceId) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="oauth-modal-title"
    >
      <div className="w-full max-w-[420px] border border-zinc-800 bg-zinc-950 shadow-none">
        {/* Redirecting */}
        {phase === "redirecting" && (
          <div className="p-8 text-center">
            <div className="text-zinc-500 font-mono text-[11px] uppercase tracking-[0.2em] mb-4">Güvenli yönlendirme</div>
            <p className="text-zinc-200 text-sm mb-2">{platformName}&apos;e yönlendiriliyorsunuz…</p>
            <p className="text-zinc-600 text-[12px]">Salt okunur erişimi kendi sitelerinde onaylayacaksınız.</p>
            <div className="mt-6 h-1 w-full bg-zinc-800 overflow-hidden">
              <div
                className="h-full w-1/3"
                style={{ background: "var(--tm-copper)", animation: "progress-sweep 1.4s ease-in-out infinite" }}
              />
            </div>
          </div>
        )}

        {/* Consent — Plaid-style permission screen (demo, not real platform) */}
        {phase === "consent" && (
          <div className="p-6">
            {/* Unmissable disclosure: this does NOT reach the real platform. No
                integration exists yet for {platformName} here. Authorize no
                longer writes any fabricated data anywhere (see
                lib/connect/demo-provider.ts) — it only marks the marketplace
                as "connected" locally so the onboarding flow can continue;
                the dashboard's own honest empty state takes over from there. */}
            <div className="mb-4 border border-amber-500/40 bg-amber-500/10 px-3 py-2.5">
              <p className="text-amber-300 text-[12px] font-semibold leading-snug">
                Demo modu — gerçek bir {platformName} hesabına bağlanılmaz.
              </p>
              <p className="text-amber-200/80 text-[11px] leading-relaxed mt-1">
                Bu, ürünü önizleyebilmeniz için yalnızca yerel bir bağlantı kaydı oluşturur — {platformName}&apos;dan
                hiçbir şifre, sipariş veya hakediş verisi okunmaz ve hiçbir sahte veri hesabınıza yazılmaz.
                Kendi gerçek rakamlarınız için &quot;CSV yükle&quot; veya &quot;Elle ekle&quot; seçeneklerini kullanın.
              </p>
            </div>
            <div className="tm-secure-field-group border border-zinc-800 bg-zinc-900/40 p-4 mb-4">
              <div className="flex items-center gap-2 mb-3 pb-3 border-b border-zinc-800">
                <span className="text-zinc-100 font-mono text-sm font-medium">{platformName}</span>
                <span className="text-zinc-600 text-[10px] uppercase tracking-widest">demo onayı</span>
              </div>
              <h2 id="oauth-modal-title" className="text-zinc-100 text-[15px] font-medium leading-snug mb-3">
                TrueMargin, satış ve hakediş verinize <span className="text-zinc-300">SALT OKUNUR</span> erişim talep ediyor.
              </h2>
              <ul className="space-y-1.5 mb-4">
                {READ_ONLY_SCOPES.map((s) => (
                  <li key={s} className="text-zinc-500 text-[12px] font-mono flex items-center gap-2">
                    <span className="fin-profit/80">+</span> {s}
                  </li>
                ))}
              </ul>
              <p className="text-zinc-600 text-[11px] leading-relaxed border-t border-zinc-800 pt-3">
                {READ_ONLY_COPY}
              </p>
              <p className="text-zinc-700 text-[10px] mt-2">
                {platformName}&apos;in kendi sitesinde giriş yaparsınız — şifrenizi asla istemeyiz.
              </p>
            </div>
            {syncError && (
              <p className="mb-3 fin-border-loss-subtle fin-bg-loss-subtle border px-3 py-2 text-[11px] fin-loss font-mono">
                {syncError}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCancel}
                className="flex-1 h-10 border border-zinc-800 text-zinc-400 text-sm hover:border-zinc-600 hover:text-zinc-200 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-zinc-500 focus-visible:outline-offset-2"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleAuthorize}
                className="flex-1 h-10 bg-zinc-100 text-zinc-950 text-sm font-semibold hover:bg-zinc-200 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-zinc-500 focus-visible:outline-offset-2 inline-flex items-center justify-center gap-1.5"
              >
                <LockIcon />
                Onayla
              </button>
            </div>
            <div className="mt-3 flex items-center justify-center gap-1.5 text-zinc-600 text-[10px]">
              <LockIcon />
              <span>Şifreli bağlantı · salt okunur</span>
            </div>
          </div>
        )}

        {/* Connecting / Fetching / Connected */}
        {(phase === "connecting" || phase === "fetching" || phase === "connected") && (
          <div className="p-8 text-center">
            {phase === "connecting" && (
              <>
                <p className="text-zinc-200 text-sm mb-1">Bağlanıyor…</p>
                <p className="text-zinc-600 text-[11px] font-mono">Güvenli bağlantı kuruluyor</p>
              </>
            )}
            {phase === "fetching" && (
              <>
                <p className="text-zinc-200 text-sm mb-1">Kontrol ediliyor…</p>
                <p className="text-zinc-600 text-[11px] font-mono">Demo bağlantı onaylanıyor</p>
              </>
            )}
            {phase === "connected" && (
              <>
                <p className="fin-profit text-sm font-medium mb-1">Bağlandı ✓</p>
                <p className="text-zinc-500 text-[11px] font-mono">{platformName} · demo bağlantı, gerçek veri yazılmadı</p>
              </>
            )}
            {phase !== "connected" && (
              <>
                <div className="mt-5 h-1 w-full bg-zinc-800 overflow-hidden">
                  <div
                    className="h-full w-2/3 mx-auto"
                    style={{ background: "var(--tm-copper)", animation: "progress-sweep 1.4s ease-in-out infinite" }}
                  />
                </div>
                {/* PDF §6.2 — işlem ne kadar sürecek, açıkça belirt. */}
                <p className="mt-3 text-zinc-500 text-[11px] font-mono">
                  Genellikle 5–10 saniye sürer — lütfen bu pencereyi kapatmayın.
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export { READ_ONLY_COPY };
