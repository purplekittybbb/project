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
 * Amazon US, Hepsiburada, N11, Shopify). Platforms without a backend use
 * `coming_soon` so the connect UI never fakes OAuth/API flows.
 */

import type { ConnectionMethod, CredentialField } from "./connect/types";
import type { Marketplace } from "./engine";
import { CONNECT_REGION_ORDER } from "./product-market";

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
  // ── US marketplaces (primary) ──
  {
    id: "amazon_us", label: "Amazon (US)", region: "us", description: "SP-API — requires Amazon approval",
    currency: "USD", engineChannel: "amazon_us", connectionMethod: "coming_soon",
  },
  { id: "walmart", label: "Walmart Marketplace", region: "us", description: "Integration in development", currency: "USD", connectionMethod: "coming_soon" },
  { id: "ebay", label: "eBay", region: "us", description: "Integration in development", currency: "USD", connectionMethod: "coming_soon" },
  { id: "etsy", label: "Etsy", region: "us", description: "Integration in development", currency: "USD", connectionMethod: "coming_soon" },

  // ── Your store / website ──
  {
    id: "shopify", label: "Shopify", region: "own_store", description: "Your own storefront",
    currency: "USD", engineChannel: "shopify", connectionMethod: "oauth",
  },
  {
    id: "woocommerce", label: "WooCommerce", region: "own_store", description: "Integration in development",
    currency: "USD", connectionMethod: "coming_soon",
  },

  // ── Turkish marketplaces (secondary) ──
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
    credentialHelp: "Hepsiburada Merchant Panel (HMS) → Hesabım → Entegrasyon Bilgileri → API Anahtarı'ndan alın.",
  },
  {
    id: "n11", label: "N11", region: "tr", description: "Auto-sync settlement data",
    currency: "TRY", engineChannel: "n11", connectionMethod: "api_key",
    credentialFields: [
      { key: "apiKey", label: "App Key", secret: true },
      { key: "apiSecret", label: "App Secret", secret: true },
    ],
    credentialHelp: "so.n11.com/selleroffice/integration/apiAccounts → Yeni Hesap Oluştur'dan alın.",
  },
  {
    id: "pazarama", label: "Pazarama", region: "tr", description: "Integration in development",
    currency: "TRY", connectionMethod: "coming_soon",
  },
  {
    id: "ciceksepeti", label: "Çiçeksepeti", region: "tr", description: "Integration in development",
    currency: "TRY", connectionMethod: "coming_soon",
  },
  {
    id: "pttavm", label: "PttAVM", region: "tr", description: "Integration in development",
    currency: "TRY", connectionMethod: "coming_soon",
  },
  {
    id: "ikas", label: "ikas", region: "tr", description: "Integration in development",
    currency: "TRY", connectionMethod: "coming_soon",
  },
  {
    id: "ticimax", label: "Ticimax", region: "tr", description: "Integration in development",
    currency: "TRY", connectionMethod: "coming_soon",
  },

  // ── Other regions ──
  { id: "noon", label: "Noon (MENA)", region: "other", description: "Integration in development", currency: "AED", connectionMethod: "coming_soon" },

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
    description: "Integration in development — use CSV or manual entry for now", currency: "—", connectionMethod: "coming_soon",
  },
];

export const REGION_LABELS: Record<MarketplaceRegion, string> = {
  us: "US marketplaces",
  own_store: "Your store / website",
  tr: "Turkish marketplaces",
  other: "Other regions",
  individual: "Individual / manual",
};

export const REGION_ORDER: MarketplaceRegion[] = [...CONNECT_REGION_ORDER];

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
