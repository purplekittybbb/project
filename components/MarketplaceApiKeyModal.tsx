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
import { getSupabaseClient } from "@/lib/supabase/client";
import { TrustSubmitButton } from "@/components/trust/TrustSubmitButton";
import { SecurePaymentCapsule } from "@/components/trust/SecurePaymentCapsule";

/**
 * Refactored to use the TrueMargin design tokens (cursor-design-prompt.md):
 *   §1.1  — --tm-paper, --tm-ink, --tm-mist, --tm-copper, --tm-alert-clay
 *   §1.3  — Borders over shadows, sharp radius for data fields
 *   §2    — Security encapsulation: API key fields wrapped in SecurePaymentCapsule
 *   §7    — Mikro-metin: Turkish error messages spesifik, yönlendirici
 */

type Phase = "form" | "connecting" | "connected";

type LiveConnectResult = {
  rowsSaved?: number;
  duplicatesSkipped?: number;
  ordersFetched?: number;
};

function syncNoticeForResult(result: LiveConnectResult): string | null {
  const saved = Number(result.rowsSaved ?? 0);
  const dupes = Number(result.duplicatesSkipped ?? 0);
  const fetched = Number(result.ordersFetched ?? 0);
  if (saved > 0) return null;
  if (dupes > 0) return "Bağlandı — siparişler zaten kayıtlıydı, yeni satır eklenmedi.";
  if (fetched > 0) return "Bağlandı — siparişler alındı ancak kaydedilemedi. CSV yüklemeyi deneyin veya destekle iletişime geçin.";
  return "Bağlandı — hesabınızda henüz kaydedilecek sipariş bulunamadı. CSV yükleyebilir veya satış geldikçe senkron bekleyebilirsiniz.";
}

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
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPhase("form");
      setValues({});
      setError("");
      setSyncNotice(null);
    }
  }, [open, marketplaceId]);

  if (!open || !marketplaceId || !opt) return null;

  function setField(key: string, v: string) {
    setValues((prev) => ({ ...prev, [key]: v }));
  }

  /**
   * Trendyol has a REAL backend path: it calls Trendyol's live Orders API to
   * validate the credentials and pull real data before anything is marked
   * connected. A wrong key/secret returns Trendyol's own 401 — the modal
   * shows that error and stays on the form; it never fakes "Connected ✓".
   */
  async function connectTrendyol(): Promise<void> {
    const supabase = getSupabaseClient();
    const { data: sessionData } = supabase
      ? await supabase.auth.getSession()
      : { data: { session: null } };
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      setError("Oturum bulunamadı — lütfen tekrar giriş yapın.");
      setPhase("form");
      return;
    }

    let res: Response;
    try {
      res = await fetch("/api/trendyol/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          sellerId: values.supplierId,
          apiKey: values.apiKey,
          apiSecret: values.apiSecret,
        }),
      });
    } catch {
      setError("Trendyol'a bağlanılamadı. İnternet bağlantınızı kontrol edin.");
      setPhase("form");
      return;
    }

    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(result.error ?? "Trendyol'a bağlanılamadı.");
      setPhase("form");
      return;
    }

    setSyncNotice(syncNoticeForResult(result as LiveConnectResult));
    const tokenRef = `tm_key_trendyol_${maskCredential(values.apiKey ?? "")}`;
    const conn = addConnection("trendyol", "live", { tokenRef, method: "api_key" });
    setPhase("connected");
    onConnected(conn);
    setTimeout(onClose, 1500);
  }

  /**
   * Hepsiburada has the same REAL backend path as Trendyol (see
   * connectTrendyol above) — a wrong key/username/password returns
   * Hepsiburada's own 401, and the modal never fakes "Connected ✓".
   */
  async function connectHepsiburada(): Promise<void> {
    const supabase = getSupabaseClient();
    const { data: sessionData } = supabase
      ? await supabase.auth.getSession()
      : { data: { session: null } };
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      setError("Oturum bulunamadı — lütfen tekrar giriş yapın.");
      setPhase("form");
      return;
    }

    let res: Response;
    try {
      res = await fetch("/api/hepsiburada/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          merchantId: values.merchantId,
          apiKey: values.apiUsername,
          apiSecret: values.apiPassword,
        }),
      });
    } catch {
      setError("Hepsiburada'ya bağlanılamadı. İnternet bağlantınızı kontrol edin.");
      setPhase("form");
      return;
    }

    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(result.error ?? "Hepsiburada'ya bağlanılamadı.");
      setPhase("form");
      return;
    }

    setSyncNotice(syncNoticeForResult(result as LiveConnectResult));
    const tokenRef = `tm_key_hepsiburada_${maskCredential(values.apiUsername ?? "")}`;
    const conn = addConnection("hepsiburada", "live", { tokenRef, method: "api_key" });
    setPhase("connected");
    onConnected(conn);
    setTimeout(onClose, 1500);
  }

  /**
   * N11 has the same REAL backend path as Trendyol/Hepsiburada — a wrong
   * App Key/Secret returns N11's own 401, and the modal never fakes
   * "Connected ✓". Field-name confidence for N11's response shape is lower
   * than Trendyol/Hepsiburada (see lib/n11-api/client.ts) — the auth check
   * itself is still a real network round trip regardless.
   */
  async function connectN11(): Promise<void> {
    const supabase = getSupabaseClient();
    const { data: sessionData } = supabase
      ? await supabase.auth.getSession()
      : { data: { session: null } };
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      setError("Oturum bulunamadı — lütfen tekrar giriş yapın.");
      setPhase("form");
      return;
    }

    let res: Response;
    try {
      res = await fetch("/api/n11/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          appKey: values.apiKey,
          appSecret: values.apiSecret,
        }),
      });
    } catch {
      setError("N11'e bağlanılamadı. İnternet bağlantınızı kontrol edin.");
      setPhase("form");
      return;
    }

    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(result.error ?? "N11'e bağlanılamadı.");
      setPhase("form");
      return;
    }

    setSyncNotice(syncNoticeForResult(result as LiveConnectResult));
    const tokenRef = `tm_key_n11_${maskCredential(values.apiKey ?? "")}`;
    const conn = addConnection("n11", "live", { tokenRef, method: "api_key" });
    setPhase("connected");
    onConnected(conn);
    setTimeout(onClose, 1500);
  }

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    if (!opt || !marketplaceId) return;
    for (const f of fields) {
      if (!values[f.key]?.trim()) {
        setError(`${f.label} alanı zorunludur.`);
        return;
      }
    }
    setError("");
    setPhase("connecting");

    if (marketplaceId === "trendyol") {
      await connectTrendyol();
      return;
    }
    if (marketplaceId === "hepsiburada") {
      await connectHepsiburada();
      return;
    }
    if (marketplaceId === "n11") {
      await connectN11();
      return;
    }

    // DEAD CODE TODAY — every connectionMethod:"api_key" marketplace
    // currently defined (lib/marketplaces.ts) is Trendyol/Hepsiburada/N11,
    // all handled with a real backend call above; this branch can't be
    // reached by any marketplace in the app right now. It exists only as
    // legacy scaffolding for a hypothetical future api_key marketplace
    // without a real backend yet. If that ever happens: DO NOT let this
    // silently show "Bağlandı ✓" the way it does today — add the same
    // visible "demo mode, no real account contacted" disclosure banner
    // MarketplaceOAuthModal shows before wiring a new marketplace here.
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
    /* Overlay: soft ink at 60% — less aggressive than zinc-950/80 */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(18,24,27,0.60)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="apikey-modal-title"
    >
      {/* Modal card — paper bg, mist border, no box-shadow (spec §1.3) */}
      <div
        className="w-full max-w-[440px]"
        style={{
          background: "var(--tm-paper)",
          border: "1px solid var(--tm-mist)",
          borderRadius: "var(--tm-r-data)",
        }}
      >
        {phase === "form" && (
          <div className="p-6">
            {/* Header */}
            <div
              className="flex items-center gap-2 mb-4 pb-3"
              style={{ borderBottom: "1px solid var(--tm-mist)" }}
            >
              <span
                className="font-mono text-sm font-semibold"
                style={{ color: "var(--tm-ink)" }}
              >
                {opt.label}
              </span>
              <span
                className="text-[10px] uppercase tracking-widest px-1.5 py-0.5"
                style={{
                  color: "var(--tm-copper)",
                  background: "color-mix(in srgb, var(--tm-copper) 10%, var(--tm-paper))",
                  border: "1px solid color-mix(in srgb, var(--tm-copper) 25%, transparent)",
                  borderRadius: "var(--tm-r-data)",
                }}
              >
                API bağlantısı
              </span>
            </div>

            <h2
              id="apikey-modal-title"
              className="text-[15px] font-medium leading-snug mb-1"
              style={{ color: "var(--tm-ink)" }}
            >
              {opt.label} API kimlik bilgilerinizi girin
            </h2>
            <p className="text-[12px] mb-4" style={{ color: "var(--tm-ink)", opacity: 0.55 }}>
              Yalnızca sipariş ve ciro verilerinizi okumak için kullanılır.
            </p>

            {opt.credentialHelp && (
              <p
                className="text-[11px] leading-relaxed mb-4 pl-3"
                style={{
                  color: "var(--tm-ink)",
                  opacity: 0.6,
                  borderLeft: "2px solid var(--tm-mist)",
                }}
              >
                {opt.credentialHelp}
              </p>
            )}

            <form onSubmit={handleConnect} className="space-y-4">
              <SecurePaymentCapsule
                hint="Şifreli · yalnızca okuma"
                footerHint="Kimlik bilgileri AES-256 ile şifrelenerek saklanır · sipariş verilmez · para taşınmaz"
              >
                <div className="space-y-3">
                  {fields.map((f) => (
                    <div key={f.key}>
                      <label
                        htmlFor={`ak-${f.key}`}
                        className="block text-[11px] mb-1 font-mono"
                        style={{ color: "var(--tm-ink)", opacity: 0.65 }}
                      >
                        {f.label}
                      </label>
                      <input
                        id={`ak-${f.key}`}
                        type={f.secret ? "password" : "text"}
                        autoComplete="off"
                        value={values[f.key] ?? ""}
                        onChange={(e) => setField(f.key, e.target.value)}
                        placeholder={f.placeholder}
                        className="w-full px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 transition-shadow"
                        style={{
                          background:   "var(--tm-paper)",
                          border:       "1px solid var(--tm-mist)",
                          borderRadius: "var(--tm-r-data)",
                          color:        "var(--tm-ink)",
                          ["--tw-ring-color" as string]: "var(--tm-copper)",
                        }}
                      />
                    </div>
                  ))}
                </div>
              </SecurePaymentCapsule>

              {/* Error — spec §7: spesifik, yönlendirici mesaj */}
              {error && (
                <p
                  className="text-[11px] font-mono px-3 py-2"
                  style={{
                    color:        "var(--tm-alert-clay)",
                    background:   "color-mix(in srgb, var(--tm-alert-clay) 8%, var(--tm-paper))",
                    borderLeft:   "2px solid var(--tm-alert-clay)",
                    borderRadius: "0 var(--tm-r-data) var(--tm-r-data) 0",
                  }}
                >
                  {error}
                </p>
              )}

              {/* Buttons */}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 h-10 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{
                    border:           "1px solid var(--tm-mist)",
                    borderRadius:     "var(--tm-r-ui)",
                    color:            "var(--tm-ink)",
                    background:       "transparent",
                    ["--tw-outline-color" as string]: "var(--tm-copper)",
                  }}
                >
                  İptal
                </button>
                <div className="flex-1">
                  <TrustSubmitButton
                    className="h-10 text-sm font-semibold !rounded-[var(--tm-r-ui)]"
                    style={{
                      background: "var(--tm-copper)",
                      color: "#fff",
                      border: "1px solid transparent",
                    }}
                    seal="256-bit şifreli bağlantı · API anahtarınız güvende"
                  >
                    Bağlan
                  </TrustSubmitButton>
                </div>
              </div>
            </form>
          </div>
        )}

        {(phase === "connecting" || phase === "connected") && (
          <div className="p-8 text-center">
            {phase === "connecting" && (
              <>
                {/* spec §8: progress mesajı "Verifying API credentials" → spesifik */}
                <p className="text-sm mb-1 font-medium" style={{ color: "var(--tm-ink)" }}>
                  {opt.label} API&apos;sine bağlanılıyor…
                </p>
                <p className="text-[11px] font-mono" style={{ color: "var(--tm-ink)", opacity: 0.5 }}>
                  API kimlik bilgileri doğrulanıyor
                </p>
              </>
            )}
            {phase === "connected" && (
              <>
                <p
                  className="text-sm font-medium mb-1"
                  style={{ color: "var(--tm-ledger-green)" }}
                >
                  Bağlandı ✓
                </p>
                <p className="text-[11px] font-mono" style={{ color: "var(--tm-ink)", opacity: 0.5 }}>
                  {opt.label}
                </p>
                {syncNotice && (
                  <p className="mt-3 text-[11px] leading-relaxed px-2" style={{ color: "var(--tm-ink)", opacity: 0.65 }}>
                    {syncNotice}
                  </p>
                )}
              </>
            )}
            {phase !== "connected" && (
              <div
                className="mt-5 h-[2px] w-full overflow-hidden"
                style={{ background: "var(--tm-mist)" }}
              >
                {/* Smooth progress bar — no animate-pulse (spec §8) */}
                <div
                  className="h-full w-2/3 mx-auto"
                  style={{
                    background: "var(--tm-copper)",
                    animation:  "progress-sweep 1.4s ease-in-out infinite",
                  }}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
