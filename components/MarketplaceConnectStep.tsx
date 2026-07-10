"use client";

/**
 * Connect step — Plaid/Rutter-style marketplace linking.
 *
 * - Per-marketplace "Connect" opens OAuth demo modal (no passwords)
 * - Connected list shows token-like refs + Disconnect
 * - CSV path for manual_csv (real parse + save)
 * - Read-only trust copy throughout
 */

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { parseCsv, SAMPLE_CSV, type UserRawRow } from "@/lib/adapters/csv";
import { getConnections, isMarketplaceConnected, removeConnection, addConnection } from "@/lib/connect/store";
import type { MarketplaceConnection } from "@/lib/connect/types";
import { READ_ONLY_COPY, MarketplaceOAuthModal } from "@/components/MarketplaceOAuthModal";
import { MarketplaceApiKeyModal } from "@/components/MarketplaceApiKeyModal";
import { ShopifyConnectModal } from "@/components/ShopifyConnectModal";
import { saveUserRows } from "@/lib/supabase/user-data";
import { isAuthConfigured } from "@/lib/supabase/client";
import {
  MARKETPLACE_OPTIONS, REGION_ORDER, REGION_LABELS, getMarketplaceOption,
  type MarketplaceOption,
} from "@/lib/marketplaces";

function connectLabel(m: MarketplaceOption): string {
  switch (m.connectionMethod) {
    case "csv": return "Upload CSV";
    case "manual": return "Add manually";
    case "api_key": return "Add API key";
    default: return `Connect ${m.label.split(" ")[0]}`;
  }
}

function LockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0">
      <rect x="3" y="7" width="10" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

interface Props {
  onContinue: () => void;
  /** Bump when connections change so parent can sync marketplace ids */
  onConnectionsChange?: () => void;
}

export function MarketplaceConnectStep({ onContinue, onConnectionsChange }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fileRef = useRef<HTMLInputElement>(null);
  const [connections, setConnections] = useState<MarketplaceConnection[]>(() => getConnections());
  const [oauthTarget, setOauthTarget] = useState<string | null>(null);
  const [oauthOpen, setOauthOpen] = useState(false);
  const [apiKeyTarget, setApiKeyTarget] = useState<string | null>(null);
  const [apiKeyOpen, setApiKeyOpen] = useState(false);
  const [shopifyOpen, setShopifyOpen] = useState(false);
  const [connectError, setConnectError] = useState("");
  const [csvRows, setCsvRows] = useState<UserRawRow[] | null>(null);
  const [csvBusy, setCsvBusy] = useState(false);

  function refresh() {
    setConnections(getConnections());
    onConnectionsChange?.();
  }

  // Landed back here from a real Shopify OAuth redirect (see
  // app/api/shopify/oauth/callback) — pick up the result and clean the URL.
  useEffect(() => {
    const shopifyResult = searchParams.get("shopify");
    if (!shopifyResult) return;
    if (shopifyResult === "connected") {
      addConnection("shopify", "live", { tokenRef: "tm_key_shopify_oauth", method: "oauth" });
      refresh();
    } else if (shopifyResult === "error") {
      setConnectError(searchParams.get("shopify_error") ?? "Shopify'a bağlanılamadı.");
    }
    const params = new URLSearchParams(searchParams.toString());
    params.delete("shopify");
    params.delete("shopify_error");
    const qs = params.toString();
    router.replace(qs ? `/connect?${qs}` : "/connect");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function startConnect(marketplaceId: string) {
    const opt = getMarketplaceOption(marketplaceId);
    if (!opt || opt.connectionMethod === "coming_soon") return;
    if (opt.connectionMethod === "csv") {
      fileRef.current?.click();
      return;
    }
    if (isMarketplaceConnected(marketplaceId)) return;
    if (opt.connectionMethod === "manual") {
      addConnection(marketplaceId, "demo", { tokenRef: "manual_entry", method: "manual" });
      refresh();
      return;
    }
    if (opt.connectionMethod === "api_key") {
      setApiKeyTarget(marketplaceId);
      setApiKeyOpen(true);
      return;
    }
    if (marketplaceId === "shopify") {
      setShopifyOpen(true);
      return;
    }
    setOauthTarget(marketplaceId);
    setOauthOpen(true);
  }

  function handleConnected(_conn: MarketplaceConnection) {
    refresh();
  }

  function handleDisconnect(id: string) {
    removeConnection(id);
    refresh();
  }

  async function pickCsv(file: File) {
    setConnectError("");
    setCsvBusy(true);
    const text = await file.text();
    const res = parseCsv(text);
    if (!res.ok) {
      setConnectError(res.error ?? "CSV could not be parsed.");
      setCsvBusy(false);
      return;
    }
    setCsvRows(res.rows);
    if (isAuthConfigured()) {
      await saveUserRows(res.rows);
    }
    if (!isMarketplaceConnected("manual_csv")) {
      addConnection("manual_csv", "demo", { method: "csv" });
    }
    refresh();
    setCsvBusy(false);
  }

  function downloadSample() {
    const blob = new Blob([SAMPLE_CSV], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "truemargin-sample.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const canContinue = connections.length > 0;

  return (
    <section>
      <h1 className="text-[22px] font-semibold tracking-tight text-zinc-100 mb-2">Connect your marketplaces</h1>
      <p className="text-sm text-zinc-500 mb-2 leading-relaxed">
        Link each sales channel with secure, read-only access — OAuth where a platform supports it,
        self-service API keys where it doesn&apos;t. Never a password.
      </p>
      <p className="text-[12px] text-zinc-600 mb-6 leading-relaxed border-l border-zinc-800 pl-3">
        {READ_ONLY_COPY}
      </p>

      {/* Connected accounts */}
      {connections.length > 0 && (
        <div className="border border-zinc-800 bg-zinc-900/30 p-4 mb-5">
          <div className="text-zinc-600 text-[10px] uppercase tracking-[0.2em] font-sans mb-3">Connected</div>
          <ul className="space-y-2">
            {connections.map((c) => {
              const opt = getMarketplaceOption(c.marketplaceId);
              return (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-3 border border-zinc-800 bg-zinc-950 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="text-sm text-zinc-200 truncate">{opt?.label ?? c.marketplaceId}</div>
                    <div className="text-zinc-600 font-mono text-[10px] tabular-nums truncate mt-0.5">
                      {c.accessTokenRef} · read-only
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-emerald-500/90 text-[10px] font-mono uppercase tracking-wider">Connected ✓</span>
                    <button
                      type="button"
                      onClick={() => handleDisconnect(c.id)}
                      className="ob-input text-[10px] font-mono uppercase tracking-widest text-zinc-500 hover:text-red-400 transition-colors px-2 py-1 border border-zinc-800 hover:border-red-400/40"
                    >
                      Disconnect
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Available to connect */}
      <div className="border border-zinc-800 bg-zinc-900/30 p-5 space-y-6">
        {REGION_ORDER.map((region) => (
          <div key={region}>
            <div className="text-zinc-600 text-[10px] uppercase tracking-[0.2em] font-sans mb-2.5">
              {REGION_LABELS[region]}
            </div>
            <div className="space-y-2">
              {MARKETPLACE_OPTIONS.filter((m) => m.region === region).map((m) => {
                const linked = isMarketplaceConnected(m.id);
                return (
                  <div
                    key={m.id}
                    className={`flex items-center justify-between gap-3 border px-4 py-3 ${
                      linked ? "border-zinc-800 bg-zinc-950/50 opacity-60" : "border-zinc-800 bg-zinc-950"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-sm text-zinc-100 truncate">{m.label}</div>
                      <div className="text-zinc-600 text-[11px] truncate">{m.description}</div>
                    </div>
                    {linked ? (
                      <span className="text-emerald-500/90 font-mono text-[10px] uppercase tracking-wider shrink-0">Connected ✓</span>
                    ) : m.connectionMethod === "coming_soon" ? (
                      <span className="shrink-0 h-8 px-3 border border-zinc-800 text-zinc-600 text-[10px] font-mono uppercase tracking-widest flex items-center">
                        Coming soon
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startConnect(m.id)}
                        disabled={csvBusy && m.id === "manual_csv"}
                        className="ob-input shrink-0 h-8 px-3 border border-zinc-700 text-zinc-200 text-[12px] font-medium hover:border-zinc-400 hover:bg-zinc-900 transition-colors disabled:opacity-50"
                      >
                        {connectLabel(m)}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) pickCsv(f);
            e.target.value = "";
          }}
        />

        {csvRows && (
          <p className="text-emerald-400/90 font-mono text-[11px] tabular-nums border-t border-zinc-800 pt-3">
            CSV imported · {csvRows.length} rows saved
          </p>
        )}
      </div>

      {connectError && (
        <div className="mt-3 border border-[#c0392b]/40 bg-[#c0392b]/10 px-3 py-2 text-[11px] text-red-400 font-mono">
          {connectError}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-4">
        <span className="text-zinc-600 text-[11px]">Add more marketplaces later, anytime.</span>
        <button
          type="button"
          onClick={downloadSample}
          className="text-[10px] font-mono text-zinc-600 hover:text-zinc-400 uppercase tracking-widest"
        >
          ↓ Sample CSV
        </button>
      </div>

      <button
        type="button"
        onClick={onContinue}
        disabled={!canContinue}
        className="ob-input mt-3 w-full h-11 bg-zinc-100 text-zinc-950 text-sm font-semibold hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Continue
      </button>

      <div className="mt-3 flex items-center justify-center gap-1.5 text-zinc-500 text-[11px]">
        <LockIcon />
        <span>Bank-level encryption · OAuth-style · no passwords stored</span>
      </div>

      <MarketplaceOAuthModal
        marketplaceId={oauthTarget}
        open={oauthOpen}
        onClose={() => { setOauthOpen(false); setOauthTarget(null); }}
        onConnected={handleConnected}
      />
      <MarketplaceApiKeyModal
        marketplaceId={apiKeyTarget}
        open={apiKeyOpen}
        onClose={() => { setApiKeyOpen(false); setApiKeyTarget(null); }}
        onConnected={handleConnected}
      />
      <ShopifyConnectModal open={shopifyOpen} onClose={() => setShopifyOpen(false)} />
    </section>
  );
}
