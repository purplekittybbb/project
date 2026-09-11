/**
 * Marketplace → (currency, country) locale.
 *
 * Persistence (user_transactions.currency / country_code) and adapters both
 * read this so adding a future country is one row here — not a new engine.
 * No live integrations live in this file.
 */
import type { Currency } from "./canonical";

export interface MarketplaceLocale {
  currency: Currency;
  countryCode: string;
}

const BY_MARKETPLACE: Record<string, MarketplaceLocale> = {
  trendyol: { currency: "TRY", countryCode: "TR" },
  hepsiburada: { currency: "TRY", countryCode: "TR" },
  n11: { currency: "TRY", countryCode: "TR" },
  amazon_tr: { currency: "TRY", countryCode: "TR" },
  amazon_us: { currency: "USD", countryCode: "US" },
  // Shopify adapter is USD; persisted rows historically followed the launch
  // cohort default (TRY). Do not flip existing stores here — a future
  // per-shop currency belongs with a dedicated Shopify locale field.
  shopify: { currency: "TRY", countryCode: "TR" },
};

/**
 * Locale for a marketplace id. Unknown ids default to TRY/TR (launch cohort)
 * rather than throwing — a CSV row tagged with a coming-soon platform still
 * has to persist.
 */
export function localeForMarketplace(marketplace: string): MarketplaceLocale {
  return BY_MARKETPLACE[marketplace] ?? { currency: "TRY", countryCode: "TR" };
}
