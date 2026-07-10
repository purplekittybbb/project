"use client";

/**
 * Self-service API-key connect form — for marketplaces that hand sellers a
 * key/secret from their own seller panel (Trendyol, N11, WooCommerce, ...)
 * instead of an OAuth consent screen.
 *
 * Phases: form → connecting → connected. Raw credentials are never persisted —
 * only a masked reference (see lib/connect/store#maskCredential) is stored,
 * mirroring how a real vault-backed integration would expose a token ref.
 */

import { useEffect, useState } from "react";
import { addConnection, maskCredential } from "@/lib/connect/store";
import { simulateInitialSync } from "@/lib/connect/demo-provider";
import type { MarketplaceConnection } from "@/lib/connect/types";
import { getMarketplaceOption } from "@/lib/marketplaces";

function LockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0">
      <rect x="3" y="7" width="10" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

type Phase = "form" | "connecting" | "connected";

interface Props {
  marketplaceId: string | null;
  open: boolean;
  onClose: () => void;
  onConnected: (conn: MarketplaceConnection) => void;
}

export function MarketplaceApiKeyModal({ marketplaceId, open, onClose, onConnected }: Props) {
  const opt = marketplaceId ? getMarketplaceOption(marketplaceId) : undefined;
  const fields = opt?.credentialFields ?? [];
  const [phase, setPhase] = useState<Phase>("form");
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setPhase("form");
      setValues({});
      setError("");
    }
  }, [open, marketplaceId]);

  if (!open || !marketplaceId || !opt) return null;

  function setField(key: string, v: string) {
    setValues((prev) => ({ ...prev, [key]: v }));
  }

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    if (!opt || !marketplaceId) return;
    for (const f of fields) {
      if (!values[f.key]?.trim()) {
        setError(`${f.label} is required.`);
        return;
      }
    }
    setError("");
    setPhase("connecting");
    await new Promise((r) => setTimeout(r, 900));

    const primary = fields.find((f) => f.secret) ?? fields[0];
    const masked = primary ? maskCredential(values[primary.key] ?? "") : "****";
    const tokenRef = `tm_key_${opt.id}_${masked}`;

    const conn = addConnection(marketplaceId, "demo", { tokenRef, method: "api_key" });
    await simulateInitialSync(conn);
    setPhase("connected");
    onConnected(conn);
    setTimeout(onClose, 1000);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="apikey-modal-title"
    >
      <div className="w-full max-w-[440px] border border-zinc-800 bg-zinc-950">
        {phase === "form" && (
          <div className="p-6">
            <div className="flex items-center gap-2 mb-3 pb-3 border-b border-zinc-800">
              <span className="text-zinc-100 font-mono text-sm font-medium">{opt.label}</span>
              <span className="text-zinc-600 text-[10px] uppercase tracking-widest">api key</span>
            </div>
            <h2 id="apikey-modal-title" className="text-zinc-100 text-[15px] font-medium leading-snug mb-2">
              Connect with your {opt.label} API credentials
            </h2>
            {opt.credentialHelp && (
              <p className="text-zinc-600 text-[11px] leading-relaxed mb-4 border-l border-zinc-800 pl-3">
                {opt.credentialHelp}
              </p>
            )}

            <form onSubmit={handleConnect} className="space-y-3">
              {fields.map((f) => (
                <div key={f.key}>
                  <label htmlFor={`ak-${f.key}`} className="block text-[11px] text-zinc-500 mb-1">
                    {f.label}
                  </label>
                  <input
                    id={`ak-${f.key}`}
                    type={f.secret ? "password" : "text"}
                    autoComplete="off"
                    value={values[f.key] ?? ""}
                    onChange={(e) => setField(f.key, e.target.value)}
                    placeholder={f.placeholder}
                    className="w-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 font-mono placeholder:text-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-600 focus:border-zinc-600"
                  />
                </div>
              ))}

              {error && <p className="text-red-400 text-[11px] font-mono">{error}</p>}

              <p className="text-zinc-600 text-[11px] leading-relaxed border-t border-zinc-800 pt-3">
                We only use these credentials to READ your sales and settlement data. We never place
                orders or move money.
              </p>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 h-10 border border-zinc-800 text-zinc-400 text-sm hover:border-zinc-600 hover:text-zinc-200 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-zinc-500 focus-visible:outline-offset-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 h-10 bg-zinc-100 text-zinc-950 text-sm font-semibold hover:bg-zinc-200 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-zinc-500 focus-visible:outline-offset-2"
                >
                  Connect
                </button>
              </div>
            </form>

            <div className="mt-3 flex items-center justify-center gap-1.5 text-zinc-600 text-[10px]">
              <LockIcon />
              <span>Stored encrypted · read-only scope</span>
            </div>
          </div>
        )}

        {(phase === "connecting" || phase === "connected") && (
          <div className="p-8 text-center">
            {phase === "connecting" && (
              <>
                <p className="text-zinc-200 text-sm mb-1">Connecting…</p>
                <p className="text-zinc-600 text-[11px] font-mono">Verifying API credentials</p>
              </>
            )}
            {phase === "connected" && (
              <>
                <p className="text-emerald-400 text-sm font-medium mb-1">Connected ✓</p>
                <p className="text-zinc-500 text-[11px] font-mono">{opt.label}</p>
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
