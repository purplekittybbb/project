// SANDBOX ONLY. Never set IYZICO_BASE_URL to the production URL without
// explicit user approval. Production URL: https://api.iyzipay.com
// Sandbox URL: https://sandbox-api.iyzipay.com

/**
 * iyzico subscription plan definitions.
 *
 * Prices are in TRY (Turkish Lira). All billing is via iyzico sandbox.
 */

// NOTE: kept in sync by hand with lib/marketing/content.ts PRICING_TIERS —
// this is the list shown on the actual checkout screen (UpgradePlanPanel),
// so it must describe real, code-enforced differences only. Previous
// versions of this list ("3 pazaryeri" vs "Tüm pazaryerleri", "500 işlem/ay"
// vs "Sınırsız işlem", "Görünürlük taraması"/"Liste kalite skoru"/"Talep
// tahmini" as Pro-only) were unbacked — none of those limits were ever
// enforced anywhere in the codebase, and the three scan-based features were
// already available on Başlangıç. Fixed to list only the tabs actually
// gated in app/dashboard/page.tsx's PRO_ONLY_TABS.
export const IYZICO_PLANS = {
  starter: {
    id: "starter",
    name: "Başlangıç",
    priceMonthly: 400,        // TRY
    currency: "TRY" as const,
    features: [
      "Mağaza bağlantısı (Trendyol, Hepsiburada, N11)",
      "Gerçek kâr hesaplama",
      "Kayıp alarm bildirimleri",
      "Güvenli fiyat, talep ölçümü, liste kalite skoru",
    ],
  },
  pro: {
    id: "pro",
    name: "Profesyonel",
    priceMonthly: 800,        // TRY
    currency: "TRY" as const,
    features: [
      "Kampanya simülatörü",
      "Nakit akışı paneli",
      "Copilot (yapay zekâ destekli analiz)",
      "Chrome uzantısı",
    ],
  },
} as const;

export type PlanId = keyof typeof IYZICO_PLANS;
