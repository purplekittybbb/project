/**
 * Marketplace catalogue for the Connect step + dashboard tabs.
 *
 * A seller usually sells in several places at once — our edge is the COMBINED
 * true margin across all of them. This registry is the single source of truth for
 * which marketplaces can be connected, HOW they're connected (real-world method,
 * not a one-size-fits-all fiction), and which of them the engine can actually
 * compute today.
 *
 * `engineChannel` is set ONLY when a real adapter + data path exists (Trendyol,
 * Amazon US, Hepsiburada). Everything else is demo-mode: selectable and shown as a
 * connected source, but with no live engine channel yet (so we never call the
 * engine with an unsupported channel and break it) — the dashboard renders these
 * as "coming soon" ghost tabs automatically.
 */

import type { ConnectionMethod, CredentialField } from "./connect/types";
import type { Marketplace } from "./engine";

export type MarketplaceRegion = "tr" | "own_store" | "us" | "other" | "individual";

export interface MarketplaceOption {
  id: string;
  label: string;
  region: MarketplaceRegion;
  description: string;
  currency: string;
  /** Set when the engine has a real adapter/data path for this marketplace. */
  engineChannel?: Marketplace;
  /** How a seller actually links this platform in real life. */
  connectionMethod: ConnectionMethod;
  /** Form fields shown when connectionMethod === "api_key". */
  credentialFields?: CredentialField[];
  /** Where to find those credentials — shown above the form. */
  credentialHelp?: string;
}

export const MARKETPLACE_OPTIONS: MarketplaceOption[] = [
  // ── Turkish marketplaces — seller self-service API keys ──
  {
    id: "trendyol", label: "Trendyol (TR)", region: "tr", description: "Auto-sync settlement data",
    currency: "TRY", engineChannel: "trendyol", connectionMethod: "api_key",
    credentialFields: [
      { key: "supplierId", label: "Seller ID", placeholder: "123456" },
      { key: "apiKey", label: "API Key", secret: true },
      { key: "apiSecret", label: "API Secret", secret: true },
    ],
    credentialHelp: "Trendyol Satıcı Panelinde Hesap Bilgilerim → Entegrasyon Bilgileri'nden alın.",
  },
  {
    id: "hepsiburada", label: "Hepsiburada (TR)", region: "tr", description: "Auto-sync settlement data",
    currency: "TRY", engineChannel: "hepsiburada", connectionMethod: "api_key",
    credentialFields: [
      { key: "merchantId", label: "Merchant ID", placeholder: "hepsiburada-merchant-id" },
      { key: "apiUsername", label: "API Username", secret: true },
      { key: "apiPassword", label: "API Password", secret: true },
    ],
    credentialHelp: "Hepsiburada Merchant Panel → Entegrasyon → API Kullanıcı Bilgileri (entegratör yetkisi gerekir).",
  },
  {
    id: "n11", label: "N11", region: "tr", description: "Auto-sync settlement data",
    currency: "TRY", connectionMethod: "api_key",
    credentialFields: [
      { key: "apiKey", label: "API Key", secret: true },
      { key: "apiSecret", label: "API Secret", secret: true },
    ],
    credentialHelp: "so.n11.com → Hesabım → API Hesapları'ndan key alın.",
  },
  {
    id: "pazarama", label: "Pazarama", region: "tr", description: "Auto-sync settlement data",
    currency: "TRY", connectionMethod: "api_key",
    credentialFields: [
      { key: "apiKey", label: "API Key", secret: true },
      { key: "apiSecret", label: "API Secret", secret: true },
    ],
    credentialHelp: "Pazarama Satıcı Paneli → Entegrasyon Ayarları'ndan alın.",
  },
  {
    id: "ciceksepeti", label: "Çiçeksepeti", region: "tr", description: "Auto-sync settlement data",
    currency: "TRY", connectionMethod: "api_key",
    credentialFields: [
      { key: "sellerId", label: "Seller ID", placeholder: "cicek-seller-id" },
      { key: "apiKey", label: "API Key", secret: true },
    ],
    credentialHelp: "Çiçeksepeti Satıcı Paneli → Entegrasyon'dan alın.",
  },
  {
    id: "pttavm", label: "PttAVM", region: "tr", description: "Auto-sync settlement data",
    currency: "TRY", connectionMethod: "api_key",
    credentialFields: [
      { key: "sellerId", label: "Seller ID", placeholder: "pttavm-seller-id" },
      { key: "apiKey", label: "API Key", secret: true },
    ],
    credentialHelp: "PttAVM Satıcı Paneli → API Ayarları'ndan alın.",
  },

  // ── Your store / website ──
  {
    id: "shopify", label: "Shopify", region: "own_store", description: "Your own storefront",
    currency: "USD", connectionMethod: "oauth",
  },
  {
    id: "woocommerce", label: "WooCommerce", region: "own_store", description: "Your WordPress store",
    currency: "USD", connectionMethod: "api_key",
    credentialFields: [
      { key: "storeUrl", label: "Store URL", placeholder: "https://yourstore.com" },
      { key: "consumerKey", label: "Consumer Key", secret: true },
      { key: "consumerSecret", label: "Consumer Secret", secret: true },
    ],
    credentialHelp: "WordPress Yönetici Paneli → WooCommerce → Ayarlar → Gelişmiş → REST API'den anahtar oluşturun.",
  },
  {
    id: "ikas", label: "ikas", region: "own_store", description: "Your ikas storefront",
    currency: "TRY", connectionMethod: "api_key",
    credentialFields: [
      { key: "apiKey", label: "API Key", secret: true },
      { key: "apiSecret", label: "API Secret", secret: true },
    ],
    credentialHelp: "ikas Panel → Entegrasyonlar → API Anahtarları'ndan alın.",
  },
  {
    id: "ticimax", label: "Ticimax", region: "own_store", description: "Your Ticimax storefront",
    currency: "TRY", connectionMethod: "api_key",
    credentialFields: [
      { key: "storeCode", label: "Store Code", placeholder: "ticimax-store-code" },
      { key: "apiKey", label: "API Key", secret: true },
    ],
    credentialHelp: "Ticimax Yönetim Paneli → Ayarlar → API Erişim Bilgileri'nden alın.",
  },

  // ── Global ──
  {
    id: "amazon_us", label: "Amazon (US)", region: "us", description: "SP-API — requires Amazon approval",
    currency: "USD", engineChannel: "amazon_us", connectionMethod: "coming_soon",
  },
  { id: "walmart", label: "Walmart Marketplace", region: "us", description: "Auto-sync settlement data", currency: "USD", connectionMethod: "oauth" },
  { id: "ebay",    label: "eBay",                region: "us", description: "Auto-sync settlement data", currency: "USD", connectionMethod: "oauth" },
  { id: "etsy",    label: "Etsy",                region: "us", description: "Auto-sync settlement data", currency: "USD", connectionMethod: "oauth" },

  // ── Other regions ──
  { id: "noon", label: "Noon (MENA)", region: "other", description: "Auto-sync settlement data", currency: "AED", connectionMethod: "oauth" },

  // ── Individual / manual ──
  {
    id: "manual_entry", label: "Enter manually", region: "individual",
    description: "No connection required — add sales rows by hand", currency: "—", connectionMethod: "manual",
  },
  {
    id: "manual_csv", label: "Upload CSV", region: "individual",
    description: "Upload an Excel/CSV export", currency: "—", connectionMethod: "csv",
  },
  {
    id: "own_site", label: "Other website / platform", region: "individual",
    description: "Any other platform — connect manually for now", currency: "—", connectionMethod: "oauth",
  },
];

export const REGION_LABELS: Record<MarketplaceRegion, string> = {
  tr: "Turkish marketplaces",
  own_store: "Your store / website",
  us: "US & Global",
  other: "Other regions",
  individual: "Individual / manual",
};

export const REGION_ORDER: MarketplaceRegion[] = ["tr", "own_store", "us", "other", "individual"];

export function getMarketplaceOption(id: string): MarketplaceOption | undefined {
  return MARKETPLACE_OPTIONS.find((m) => m.id === id);
}

/** Of a set of selected ids, the ones the engine can compute live (as channels). */
export function supportedChannels(ids: string[]): Marketplace[] {
  const seen = new Set<Marketplace>();
  for (const id of ids) {
    const opt = getMarketplaceOption(id);
    if (opt?.engineChannel && !seen.has(opt.engineChannel)) seen.add(opt.engineChannel);
  }
  return [...seen];
}
