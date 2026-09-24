"use client";

/**
 * Connect step — Plaid/Rutter-style marketplace linking.
 *
 * - Shopify is the only `connectionMethod: "oauth"` entry in MARKETPLACE_OPTIONS
 *   (lib/marketplaces.ts) — every other oauth-shaped platform (eBay/Walmart/Etsy)
 *   is still `coming_soon` (no button at all, never a fake flow). For Shopify:
 *   uses the REAL Partner-app OAuth redirect (ShopifyConnectModal →
 *   /api/shopify/oauth/*) whenever this deployment has SHOPIFY_CLIENT_ID/
 *   SHOPIFY_CLIENT_SECRET configured (isShopifyLiveEnabled()); without those
 *   credentials, falls back to the demo consent modal (MarketplaceOAuthModal),
 *   which now explicitly discloses it's sample data so it's never mistaken for
 *   a real connection.
 * - Connected list shows token-like refs + Disconnect
 * - Disconnecting a "live" connection (Trendyol/Hepsiburada/N11/live Shopify)
 *   calls /api/marketplace/disconnect to actually delete the encrypted
 *   marketplace_credentials row server-side, with a choice to also delete the
 *   order data already pulled — demo connections disconnect locally only.
 * - CSV path for manual_csv (real parse + save)
 * - Read-only trust copy throughout
 */

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { parseCsv, SAMPLE_CSV, type UserRawRow } from "@/lib/adapters/csv";
import { validateUserRawRows } from "@/lib/domain/schemas";
import {
  getConnections, isMarketplaceConnected, removeConnection, addConnection,
  hydrateConnectionsFromServer,
} from "@/lib/connect/store";
import type { MarketplaceConnection } from "@/lib/connect/types";
import { READ_ONLY_COPY, MarketplaceOAuthModal } from "@/components/MarketplaceOAuthModal";
import { MarketplaceApiKeyModal } from "@/components/MarketplaceApiKeyModal";
import { ShopifyConnectModal } from "@/components/ShopifyConnectModal";
import { saveUserRows } from "@/lib/supabase/user-data";
import { isAuthConfigured, getSupabaseClient, getFreshAccessToken } from "@/lib/supabase/client";
import { isShopifyLiveEnabled } from "@/lib/shopify-api/live";
import { isAmazonLwaConfigured } from "@/lib/amazon-sp-api/live";
import {
  MARKETPLACE_OPTIONS, REGION_ORDER, REGION_LABELS, getMarketplaceOption,
  type MarketplaceOption,
} from "@/lib/marketplaces";
import { LockIcon } from "@/components/trust/LockIcon";

async function confirmServerCredential(marketplaceId: string): Promise<boolean> {
  const accessToken = await getFreshAccessToken();
  if (!accessToken) return false;
  try {
    const res = await fetch("/api/marketplace/credentials-status", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const result = (await res.json().catch(() => ({}))) as {
      marketplaces?: string[];
      connections?: { marketplace?: string }[];
    };
    if (Array.isArray(result.connections) && result.connections.some((c) => c.marketplace === marketplaceId)) {
      return true;
    }
    return Array.isArray(result.marketplaces) && result.marketplaces.includes(marketplaceId);
  } catch {
    return false;
  }
}

function connectLabel(m: MarketplaceOption): string {
  switch (m.connectionMethod) {
    case "csv": return "CSV yükle";
    case "manual": return "Elle ekle";
    case "api_key": return "Mağaza anahtarı ekle";
    case "oauth":
      // Shopify is currently the only connectionMethod:"oauth" entry (see
      // lib/marketplaces.ts) — label reflects whether THIS deployment has
      // live Shopify Partner-app credentials configured (see startConnect).
      if (m.id === "shopify" && isShopifyLiveEnabled()) return `${m.label.split(" ")[0]} bağla`;
      if (m.id === "amazon_tr" && isAmazonLwaConfigured()) return `${m.label.split(" ")[0]} bağla`;
      return `${m.label.split(" ")[0]} bağla (örnek veri)`;
    default: return `${m.label.split(" ")[0]} bağla`;
  }
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
  const [shopifyLiveOpen, setShopifyLiveOpen] = useState(false);
  const [apiKeyTarget, setApiKeyTarget] = useState<string | null>(null);
  const [apiKeyOpen, setApiKeyOpen] = useState(false);
  const [connectError, setConnectError] = useState("");
  const [csvRows, setCsvRows] = useState<UserRawRow[] | null>(null);
  const [csvBusy, setCsvBusy] = useState(false);

  // Disconnect confirmation — ONLY for "live" connections (Trendyol/Hepsiburada/
  // N11/live Shopify), which have a real, encrypted marketplace_credentials row
  // server-side. Demo connections have nothing server-side to delete, so they
  // disconnect immediately without a dialog.
  const [disconnectTarget, setDisconnectTarget] = useState<MarketplaceConnection | null>(null);
  const [disconnectBusy, setDisconnectBusy] = useState(false);
  const [disconnectDeleting, setDisconnectDeleting] = useState(false);
  const [disconnectError, setDisconnectError] = useState("");

  function refresh() {
    setConnections(getConnections());
    onConnectionsChange?.();
  }

  // Server truth: merge marketplace_credentials into localStorage so a
  // connection made on another device still shows as Connected here.
  useEffect(() => {
    if (!isAuthConfigured()) return;
    let active = true;
    (async () => {
      const accessToken = await getFreshAccessToken();
      if (!accessToken || !active) return;
      try {
        const res = await fetch("/api/marketplace/credentials-status", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const result = await res.json().catch(() => ({}));
        if (!active) return;
        if (Array.isArray(result.connections)) {
          hydrateConnectionsFromServer(result.connections);
          refresh();
        }
      } catch {
        // Non-critical — local list still works for this browser.
      }
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Landed back here from a real Shopify/Amazon OAuth redirect.
  // Never trust the query flag alone — confirm marketplace_credentials first.
  useEffect(() => {
    const amazonResult = searchParams.get("amazon");
    const shopifyResult = searchParams.get("shopify");
    if (!amazonResult && !shopifyResult) return;

    let active = true;
    void (async () => {
      if (amazonResult === "error") {
        setConnectError(searchParams.get("amazon_error") ?? "Amazon TR'ye bağlanılamadı.");
      } else if (shopifyResult === "error") {
        setConnectError(searchParams.get("shopify_error") ?? "Shopify'a bağlanılamadı.");
      } else if (amazonResult === "connected" || shopifyResult === "connected") {
        const marketplaceId = amazonResult === "connected" ? "amazon_tr" : "shopify";
        const confirmed = await confirmServerCredential(marketplaceId);
        if (!active) return;
        if (confirmed) {
          addConnection(marketplaceId, "live", {
            tokenRef: `tm_key_${marketplaceId}_oauth`,
            method: "oauth",
          });
          refresh();
        } else {
          setConnectError("Bağlantı sunucuda doğrulanamadı. Lütfen tekrar deneyin.");
        }
      }
      if (!active) return;
      const params = new URLSearchParams(searchParams.toString());
      params.delete("amazon");
      params.delete("amazon_error");
      params.delete("shopify");
      params.delete("shopify_error");
      const qs = params.toString();
      router.replace(qs ? `/connect?${qs}` : "/connect");
    })();
    return () => { active = false; };
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
    // Shopify has a real Partner-app OAuth integration built (/api/shopify/
    // oauth/* + ShopifyConnectModal): when this deployment has SHOPIFY_
    // CLIENT_ID/SECRET configured, send the user through the REAL OAuth
    // redirect to Shopify's own site — never a fabricated "connected" state.
    // Without live credentials, falls back to the demo consent modal below,
    // which now explicitly discloses it's sample data (see
    // MarketplaceOAuthModal's demo banner) — never silently passed off as real.
    if (marketplaceId === "shopify" && isShopifyLiveEnabled()) {
      setShopifyLiveOpen(true);
      return;
    }
    if (marketplaceId === "amazon_tr" && isAmazonLwaConfigured()) {
      void (async () => {
        try {
          const token = await getFreshAccessToken();
          if (!token) {
            setConnectError("Oturum bulunamadı — lütfen tekrar giriş yapın.");
            return;
          }
          const res = await fetch("/api/amazon/oauth/start", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
          });
          const body = (await res.json().catch(() => ({}))) as { redirectUrl?: string; error?: string };
          if (!res.ok || !body.redirectUrl) {
            setConnectError(body.error ?? "Amazon TR yetkilendirmesi başlatılamadı.");
            return;
          }
          window.location.href = body.redirectUrl;
        } catch {
          setConnectError("Amazon TR yetkilendirmesi başlatılamadı.");
        }
      })();
      return;
    }
    setOauthTarget(marketplaceId);
    setOauthOpen(true);
  }

  function handleConnected(_conn: MarketplaceConnection) {
    refresh();
  }

  function handleDisconnect(c: MarketplaceConnection) {
    if (c.provider === "live" && isAuthConfigured()) {
      setDisconnectError("");
      setDisconnectTarget(c);
      return;
    }
    removeConnection(c.id);
    refresh();
  }

  async function confirmDisconnect(deleteData: boolean) {
    const target = disconnectTarget;
    if (!target) return;
    setDisconnectBusy(true);
    setDisconnectDeleting(deleteData);
    setDisconnectError("");
    try {
      const supabase = getSupabaseClient();
      const { data: sessionData } = supabase
        ? await supabase.auth.getSession()
        : { data: { session: null } };
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        setDisconnectError("Oturum bulunamadı — lütfen tekrar giriş yapın.");
        return;
      }
      const res = await fetch("/api/marketplace/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ marketplace: target.marketplaceId, deleteData }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok || !result.success) {
        setDisconnectError(result.error ?? "Bağlantı kesilemedi.");
        return;
      }
      removeConnection(target.id);
      refresh();
      setDisconnectTarget(null);
    } finally {
      setDisconnectBusy(false);
      setDisconnectDeleting(false);
    }
  }

  async function ingestCsvText(text: string): Promise<boolean> {
    setConnectError("");
    setCsvBusy(true);
    try {
      const res = parseCsv(text);
      if (!res.ok) {
        setConnectError(res.error ?? "CSV okunamadı.");
        return false;
      }
      const { valid, warnings } = validateUserRawRows(res.rows);
      if (valid.length === 0) {
        setConnectError("Hiçbir satır geçerli veri içermiyor — CSV formatını kontrol edin.");
        return false;
      }
      if (warnings.length > 0) {
        console.warn("[connect] CSV validation warnings:", warnings);
      }
      if (isAuthConfigured()) {
        const { error } = await saveUserRows(valid);
        if (error) {
          setConnectError(`CSV kaydedilemedi: ${error}`);
          return false;
        }
      }
      // Only mark success after persist (or demo without auth).
      setCsvRows(valid);
      if (!isMarketplaceConnected("manual_csv")) {
        addConnection("manual_csv", "demo", { method: "csv" });
      }
      refresh();
      return true;
    } finally {
      setCsvBusy(false);
    }
  }

  async function pickCsv(file: File) {
    await ingestCsvText(await file.text());
  }

  /** One-click path: load bundled sample rows so "Devam et" is never a dead end. */
  async function useSampleAndContinue() {
    const ok = await ingestCsvText(SAMPLE_CSV);
    if (ok) onContinue();
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
      <h1 className="font-heading text-[22px] font-semibold tracking-tight text-foreground mb-2">Pazaryerlerinizi bağlayın</h1>
      <p className="text-sm text-muted-foreground mb-2 leading-relaxed">
        Satış raporu yükleyin veya mağazanızı bağlayın. Şifreniz asla istenmez — yalnızca okuma izni.
      </p>
      <p className="text-[12px] text-muted-foreground mb-6 leading-relaxed border-l border-[var(--tm-mist)] pl-3">
        {READ_ONLY_COPY}
      </p>

      {/* En hızlı başlangıç: CSV yükleme — API anahtarı GEREKTİRMEZ.
          Denetimde CSV, gerçek-veriye ulaşmanın en hızlı ve en az sürtünmeli
          yolu çıktı (pazaryeri API'si için anahtar paylaşmak istemeyen satıcı
          da anında değer görür). Bu yüzden pazaryeri listesinin ÜSTÜNDE,
          birinci sınıf bir yol olarak öne çıkarıyoruz. Mevcut pickCsv/fileRef/
          downloadSample mantığını yeniden kullanır. */}
      <div
        className="border rounded-[var(--tm-r-ui)] p-5 mb-5"
        style={{
          borderColor: "color-mix(in srgb, var(--tm-copper) 30%, transparent)",
          background: "color-mix(in srgb, var(--tm-copper) 5%, var(--tm-paper))",
        }}
      >
        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
          <span
            className="text-[10px] font-mono uppercase tracking-[0.15em] px-2 py-0.5 rounded-[var(--tm-r-data)]"
            style={{
              color: "var(--tm-copper)",
              border: "1px solid color-mix(in srgb, var(--tm-copper) 30%, transparent)",
            }}
          >
            En hızlı yol
          </span>
          <h2 className="font-heading text-[15px] font-semibold text-foreground">Satış raporunuzu yükleyin</h2>
        </div>
        <p className="text-[12.5px] text-muted-foreground leading-relaxed mb-4">
          API anahtarı gerekmez. Trendyol, Hepsiburada veya N11 panelinizden indirdiğiniz
          satış / hakediş raporu CSV&apos;sini yükleyin — gerçek net kârınız saniyeler içinde
          hesaplansın.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={csvBusy}
            className="tm-btn-primary h-10 px-5 text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50"
          >
            {csvBusy ? "Yükleniyor…" : "CSV dosyası seç"}
          </button>
          <button
            type="button"
            onClick={() => void useSampleAndContinue()}
            disabled={csvBusy}
            className="h-10 px-4 text-sm font-medium border border-input rounded-[var(--tm-r-data)] text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            Örnek veriyle başla
          </button>
          <button
            type="button"
            onClick={downloadSample}
            className="text-[11px] font-mono text-muted-foreground hover:text-foreground uppercase tracking-widest"
          >
            ↓ Örnek CSV indir
          </button>
        </div>
        {csvRows && (
          <p className="fin-profit font-mono text-[11px] tnum mt-3">
            CSV içe aktarıldı · {csvRows.length} satır kaydedildi — panelinizde gerçek marj hazır.
          </p>
        )}
      </div>

      <div className="flex items-center gap-3 mb-5">
        <span className="h-px flex-1" style={{ background: "var(--tm-mist)" }} />
        <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">veya pazaryerini bağla</span>
        <span className="h-px flex-1" style={{ background: "var(--tm-mist)" }} />
      </div>

      {/* Connected accounts */}
      {connections.length > 0 && (
        <div className="border border-[var(--tm-mist)] bg-card rounded-[var(--tm-r-ui)] p-4 mb-5">
          <div className="text-muted-foreground text-[10px] uppercase tracking-[0.2em] mb-3">Bağlı</div>
          <ul className="space-y-2">
            {connections.map((c) => {
              const opt = getMarketplaceOption(c.marketplaceId);
              return (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-3 border border-[var(--tm-mist)] bg-secondary/40 px-3 py-2.5 rounded-[var(--tm-r-data)]"
                >
                  <div className="min-w-0">
                    <div className="text-sm text-foreground truncate">{opt?.label ?? c.marketplaceId}</div>
                    <div className="text-muted-foreground text-[11px] truncate mt-0.5">
                      {c.method === "manual"
                        ? "Elle eklenen satışlar · yalnızca okuma"
                        : c.method === "csv"
                          ? "CSV ile yüklendi · yalnızca okuma"
                          : c.provider === "demo"
                            ? "Örnek veri · gerçek mağaza değil"
                            : "Salt okunur erişim"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`text-[10px] font-mono uppercase tracking-wider ${
                        c.status === "error" ? "text-[var(--tm-copper)]" : "fin-profit"
                      }`}
                    >
                      {c.status === "error" ? "Yeniden bağlanmalı" : "Bağlandı ✓"}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDisconnect(c)}
                      className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:fin-loss transition-colors px-2 py-1 border border-[var(--tm-mist)] hover:fin-border-loss-subtle rounded-[var(--tm-r-data)]"
                    >
                      Bağlantıyı kes
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Available to connect */}
      <div className="border border-[var(--tm-mist)] bg-card rounded-[var(--tm-r-ui)] p-5 space-y-6">
        {REGION_ORDER.map((region) => (
          <div key={region}>
            <div className="text-muted-foreground text-[10px] uppercase tracking-[0.2em] font-sans mb-2.5">
              {REGION_LABELS[region]}
            </div>
            <div className="space-y-2">
              {MARKETPLACE_OPTIONS.filter((m) => m.region === region).map((m) => {
                const linked = isMarketplaceConnected(m.id);
                return (
                  <div
                    key={m.id}
                    className={`flex items-center justify-between gap-3 border rounded-[var(--tm-r-data)] px-4 py-3 ${
                      linked ? "border-[var(--tm-mist)] bg-muted opacity-70" : "border-[var(--tm-mist)] bg-background"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-sm text-foreground truncate">{m.label}</div>
                      <div className="text-muted-foreground text-[11px] truncate">{m.description}</div>
                    </div>
                    {linked ? (
                      <span className="fin-profit font-mono text-[10px] uppercase tracking-wider shrink-0">Bağlandı ✓</span>
                    ) : m.connectionMethod === "coming_soon" ? (
                      <span className="shrink-0 h-8 px-3 border border-[var(--tm-mist)] text-muted-foreground text-[10px] font-mono uppercase tracking-widest flex items-center rounded-[var(--tm-r-data)]">
                        Yakında
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startConnect(m.id)}
                        disabled={csvBusy && m.id === "manual_csv"}
                        className="ob-input shrink-0 h-8 px-3 border border-input text-foreground text-[12px] font-medium rounded-[var(--tm-r-data)] hover:border-foreground/40 hover:bg-muted transition-colors disabled:opacity-50"
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
          <p className="fin-profit font-mono text-[11px] tnum border-t border-[var(--tm-mist)] pt-3">
            CSV içe aktarıldı · {csvRows.length} satır kaydedildi
          </p>
        )}
      </div>

      {connectError && (
        <div className="mt-3 tm-field-error-box">
          {connectError}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-4">
        <span className="text-muted-foreground text-[11px]">Daha sonra istediğiniz zaman yeni pazaryeri ekleyebilirsiniz.</span>
        <button
          type="button"
          onClick={downloadSample}
          className="text-[10px] font-mono text-muted-foreground hover:text-foreground uppercase tracking-widest"
        >
          ↓ Örnek CSV
        </button>
      </div>

      <button
        type="button"
        onClick={onContinue}
        disabled={!canContinue}
        className="tm-btn-primary mt-3 w-full h-11 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
      >
        <LockIcon className="text-[var(--tm-paper)] opacity-90" />
        Devam et
      </button>

      {!canContinue && (
        <button
          type="button"
          onClick={onContinue}
          className="mt-2 w-full text-center text-[12px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
        >
          Şimdilik atla — boş panelle devam et
        </button>
      )}

      <div className="mt-3 flex items-center justify-center gap-1.5 text-muted-foreground text-[11px]">
        <LockIcon />
        <span>Banka seviyesinde şifreleme · OAuth benzeri · şifre saklanmaz</span>
      </div>

      <MarketplaceOAuthModal
        marketplaceId={oauthTarget}
        open={oauthOpen}
        onClose={() => { setOauthOpen(false); setOauthTarget(null); }}
        onConnected={handleConnected}
      />
      <ShopifyConnectModal
        open={shopifyLiveOpen}
        onClose={() => setShopifyLiveOpen(false)}
      />
      <MarketplaceApiKeyModal
        marketplaceId={apiKeyTarget}
        open={apiKeyOpen}
        onClose={() => { setApiKeyOpen(false); setApiKeyTarget(null); }}
        onConnected={handleConnected}
      />

      {/* Disconnect confirmation — server-side credential deletion, PDF trust rule:
          never destroy data silently, neither choice is pre-selected. */}
      {disconnectTarget && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4"
          onClick={() => !disconnectBusy && setDisconnectTarget(null)}
        >
          <div className="bg-card border border-[var(--tm-mist)] rounded-[var(--tm-r-ui)] p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <div className="text-foreground text-sm font-medium mb-1.5">
              {getMarketplaceOption(disconnectTarget.marketplaceId)?.label ?? disconnectTarget.marketplaceId} bağlantısını kes
            </div>
            <p className="text-muted-foreground text-[12px] font-mono leading-relaxed mb-6">
              Bu, saklanan kimlik bilgisini siler — tekrar senkronize etmek için yeniden bağlanmanız gerekir.
              Bu pazaryerinden çekilmiş sipariş verisini de silmeyi seçebilirsiniz.
            </p>
            {disconnectError && (
              <p className="fin-loss text-[11px] font-mono mb-4">{disconnectError}</p>
            )}
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => confirmDisconnect(false)}
                disabled={disconnectBusy}
                className="inline-flex items-center justify-center h-10 px-4 border border-input text-foreground font-mono text-[12px] rounded-[var(--tm-r-data)] hover:bg-muted transition-colors disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                {disconnectBusy && !disconnectDeleting ? "Bağlantı kesiliyor…" : "Yalnızca bağlantıyı kes — verimi sakla"}
              </button>
              <button
                type="button"
                onClick={() => confirmDisconnect(true)}
                disabled={disconnectBusy}
                className="inline-flex items-center justify-center h-10 px-4 fin-border-loss-subtle border fin-loss font-mono text-[12px] hover:bg-[color-mix(in_srgb,var(--fin-loss)_16%,transparent)] transition-colors disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fin-loss)]"
              >
                {disconnectBusy && disconnectDeleting ? "Veri siliniyor…" : "Bağlantıyı kes ve bu pazaryerinin verisini sil"}
              </button>
              <button
                type="button"
                onClick={() => setDisconnectTarget(null)}
                disabled={disconnectBusy}
                className="inline-flex items-center justify-center h-9 px-4 text-muted-foreground font-mono text-[12px] hover:text-foreground transition-colors disabled:opacity-50"
              >
                Vazgeç
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
