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

function LockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0">
      <rect x="3" y="7" width="10" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

const READ_ONLY_COPY =
  "We can only READ your data. We never modify, place orders, or access payments.";

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
            <div className="text-zinc-500 font-mono text-[11px] uppercase tracking-[0.2em] mb-4">Secure redirect</div>
            <p className="text-zinc-200 text-sm mb-2">Redirecting to {platformName}…</p>
            <p className="text-zinc-600 text-[12px]">You will authorize read-only access on their site.</p>
            <div className="mt-6 h-1 w-full bg-zinc-800 overflow-hidden">
              <div className="h-full bg-zinc-400 w-1/3 animate-pulse" />
            </div>
          </div>
        )}

        {/* Consent — Plaid-style permission screen (demo, not real platform) */}
        {phase === "consent" && (
          <div className="p-6">
            <div className="border border-zinc-800 bg-zinc-900/40 p-4 mb-4">
              <div className="flex items-center gap-2 mb-3 pb-3 border-b border-zinc-800">
                <span className="text-zinc-100 font-mono text-sm font-medium">{platformName}</span>
                <span className="text-zinc-600 text-[10px] uppercase tracking-widest">demo consent</span>
              </div>
              <h2 id="oauth-modal-title" className="text-zinc-100 text-[15px] font-medium leading-snug mb-3">
                TrueMargin is requesting <span className="text-zinc-300">READ-ONLY</span> access to your sales and settlement data.
              </h2>
              <ul className="space-y-1.5 mb-4">
                {READ_ONLY_SCOPES.map((s) => (
                  <li key={s} className="text-zinc-500 text-[12px] font-mono flex items-center gap-2">
                    <span className="text-emerald-500/80">+</span> {s}
                  </li>
                ))}
              </ul>
              <p className="text-zinc-600 text-[11px] leading-relaxed border-t border-zinc-800 pt-3">
                {READ_ONLY_COPY}
              </p>
              <p className="text-zinc-700 text-[10px] mt-2">
                You sign in on {platformName}&apos;s site — we never ask for your password.
              </p>
            </div>
            {syncError && (
              <p className="mb-3 border border-[#c0392b]/40 bg-[#c0392b]/10 px-3 py-2 text-[11px] text-red-400 font-mono">
                {syncError}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCancel}
                className="flex-1 h-10 border border-zinc-800 text-zinc-400 text-sm hover:border-zinc-600 hover:text-zinc-200 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-zinc-500 focus-visible:outline-offset-2"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAuthorize}
                className="flex-1 h-10 bg-zinc-100 text-zinc-950 text-sm font-semibold hover:bg-zinc-200 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-zinc-500 focus-visible:outline-offset-2"
              >
                Authorize
              </button>
            </div>
            <div className="mt-3 flex items-center justify-center gap-1.5 text-zinc-600 text-[10px]">
              <LockIcon />
              <span>Encrypted connection · read-only</span>
            </div>
          </div>
        )}

        {/* Connecting / Fetching / Connected */}
        {(phase === "connecting" || phase === "fetching" || phase === "connected") && (
          <div className="p-8 text-center">
            {phase === "connecting" && (
              <>
                <p className="text-zinc-200 text-sm mb-1">Connecting…</p>
                <p className="text-zinc-600 text-[11px] font-mono">Establishing secure link</p>
              </>
            )}
            {phase === "fetching" && (
              <>
                <p className="text-zinc-200 text-sm mb-1">Fetching data…</p>
                <p className="text-zinc-600 text-[11px] font-mono">Syncing settlement records (demo)</p>
              </>
            )}
            {phase === "connected" && (
              <>
                <p className="text-emerald-400 text-sm font-medium mb-1">Connected ✓</p>
                <p className="text-zinc-500 text-[11px] font-mono">{platformName}</p>
              </>
            )}
            {phase !== "connected" && (
              <div className="mt-5 h-1 w-full bg-zinc-800 overflow-hidden">
                <div className="h-full bg-zinc-300 animate-pulse w-2/3 mx-auto" />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export { READ_ONLY_COPY };
