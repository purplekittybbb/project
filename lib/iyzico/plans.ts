// SANDBOX ONLY. Never set IYZICO_BASE_URL to the production URL without
// explicit user approval. Production URL: https://api.iyzipay.com
// Sandbox URL: https://sandbox-api.iyzipay.com

/**
 * iyzico subscription plan definitions.
 *
 * Prices are in TRY (Turkish Lira). All billing is via iyzico sandbox.
 */

export const IYZICO_PLANS = {
  starter: {
    id: "starter",
    name: "Başlangıç",
    priceMonthly: 400,        // TRY
    currency: "TRY" as const,
    features: [
      "3 pazaryeri bağlantısı",
      "500 işlem/ay",
      "Gerçek kâr hesaplama",
      "Kayıp alarm bildirimleri",
    ],
  },
  pro: {
    id: "pro",
    name: "Profesyonel",
    priceMonthly: 800,        // TRY
    currency: "TRY" as const,
    features: [
      "Tüm pazaryerleri",
      "Sınırsız işlem",
      "Görünürlük taraması",
      "Liste kalite skoru",
      "Talep tahmini",
    ],
  },
} as const;

export type PlanId = keyof typeof IYZICO_PLANS;
