/**
 * Marketing site copy & structure — nesatilir.com-style IA, TrueMargin design tokens.
 */

import {
  STANDALONE_TOOLS,
  STORE_REQUIRED_TOOLS,
  ALL_TOOLS,
  type ToolDefinition,
} from "@/lib/tools/registry";

export { STANDALONE_TOOLS, STORE_REQUIRED_TOOLS, ALL_TOOLS };
export type { ToolDefinition };

/** Keşfet dropdown */
export const DISCOVER_NAV = [
  { label: "Blog / Rehberler", href: "/blog", note: "Yakında" },
  { label: "Hakkımızda", href: "/hakkimizda" },
  { label: "SSS", href: "/sss" },
] as const;

/** Display titles for Ürünler dropdown (registry slug/href unchanged). */
const DISPLAY_TITLES: Partial<Record<string, string>> = {
  "profit-calc": "Net Kâr Hesaplama",
  profit: "Gerçek Net Kâr",
  "safe-price": "Güvenli Fiyat / Buybox",
};

export function toolDisplayTitle(tool: ToolDefinition): string {
  return DISPLAY_TITLES[tool.id] ?? tool.title;
}

export interface NavToolItem {
  id: string;
  title: string;
  href: string;
  badge?: "free" | "store";
}

export const PRODUCTS_NAV = {
  free: STANDALONE_TOOLS.map((t) => ({
    id: t.id,
    title: toolDisplayTitle(t),
    href: t.href,
    badge: t.badge,
  })),
  store: STORE_REQUIRED_TOOLS.map((t) => ({
    id: t.id,
    title: toolDisplayTitle(t),
    href: t.href,
    badge: t.badge,
  })),
  extension: [
    {
      id: "store-profit",
      title: "Mağaza Kâr Gösterimi",
      href: "/urunler#uzanti",
      badge: "store" as const,
    },
  ],
} satisfies Record<string, NavToolItem[]>;

export const EXTENSION_TOOLS = [
  {
    id: "store-profit",
    title: "Mağaza kâr gösterimi",
    description:
      "Trendyol / Hepsiburada partner panelinde kendi ürünün için anlık net kâr ve marj.",
    href: "/downloads/truemargin-asistan-chrome-extension.zip",
  },
];

/** Legacy flat list */
export const WEB_APP_TOOLS = [
  ...PRODUCTS_NAV.free,
  ...PRODUCTS_NAV.store,
];

/** Ana sayfa üst bandı — sahte metrik yok; gerçek veri birikince güncellenecek. */
export const LAUNCH_BANNER = {
  message: "Yeni platform — ilk kullanıcılarımızdan biri olun.",
  subtext: "Ücretsiz araçları şimdi deneyin.",
};

export const INTEGRATION_BANNER = {
  title: "4 pazaryerini tek panelde bağlayın",
  body: "Trendyol, Hepsiburada, N11 ve Shopify — gerçek sipariş verinizle net kâr, alarm ve barkod analizi.",
  cta: "Mağazayı bağla",
  href: "/signup",
};

/** Pricing tiers for marketing (billing uses iyzico plans for paid tiers). */
export const PRICING_TIERS = [
  {
    id: "free",
    name: "Ücretsiz",
    priceMonthly: 0,
    highlight: false,
    summary: "Kategori 1 araçları, günlük limitli",
    features: [
      "Görünürlük, fiyat, Top 100, index",
      "Misafir net kâr hesaplayıcı",
      "Günde sınırlı sorgu",
    ],
  },
  {
    id: "starter",
    name: "Başlangıç",
    priceMonthly: 400,
    highlight: false,
    summary: "1 mağaza, tüm Kategori 2 araçları",
    features: [
      "1 mağaza bağlantısı",
      "Gerçek net kâr & zarar alarmı",
      "Güvenli fiyat, talep, liste kalite",
      "Barkod analizi",
    ],
  },
  {
    id: "pro",
    name: "Profesyonel",
    priceMonthly: 800,
    highlight: true,
    summary: "Sınırsız mağaza, tüm pazaryerleri",
    features: [
      "Sınırsız mağaza bağlantısı",
      "Tüm pazaryerleri",
      "Öncelikli tarama",
      "Tüm Kategori 2 araçları",
    ],
  },
] as const;

export type PricingTierId = (typeof PRICING_TIERS)[number]["id"];

/** Feature matrix: tool/feature × tier */
export interface FeatureMatrixRow {
  label: string;
  free: boolean | "limited";
  starter: boolean;
  pro: boolean;
}

export const FEATURE_MATRIX: FeatureMatrixRow[] = [
  { label: "Görünürlük Tespiti", free: "limited", starter: true, pro: true },
  { label: "Fiyat Takibi", free: "limited", starter: true, pro: true },
  { label: "Top 100 Analiz", free: "limited", starter: true, pro: true },
  { label: "Index Checker", free: "limited", starter: true, pro: true },
  { label: "Net Kâr Hesaplama (misafir)", free: true, starter: true, pro: true },
  { label: "Gerçek Net Kâr", free: false, starter: true, pro: true },
  { label: "Zarar Alarmı", free: false, starter: true, pro: true },
  { label: "Güvenli Fiyat / Buybox", free: false, starter: true, pro: true },
  { label: "Talep Ölçümü", free: false, starter: true, pro: true },
  { label: "Liste Kalite Skoru", free: false, starter: true, pro: true },
  { label: "Barkod Analizi", free: false, starter: true, pro: true },
  { label: "Mağaza bağlantısı", free: false, starter: true, pro: true },
  { label: "Çoklu mağaza", free: false, starter: false, pro: true },
  { label: "Öncelikli tarama", free: false, starter: false, pro: true },
];

export const FAQ_ITEMS = [
  {
    q: "Ücretsiz planda neler var?",
    a: "Kategori 1 araçlarına (görünürlük, fiyat takibi, Top 100, index checker ve misafir kâr hesaplayıcı) günlük limitli erişim. Mağaza bağlamadan deneyebilirsiniz.",
  },
  {
    q: "Mağaza bağlamadan net kâr görebilir miyim?",
    a: "Misafir kâr hesaplayıcı temsilî oranlarla çalışır. Gerçek SKU net kârı için mağazanızı bağlamanız gerekir (Başlangıç veya Profesyonel).",
  },
  {
    q: "Hangi pazaryerleri destekleniyor?",
    a: "Trendyol, Hepsiburada, N11 ve Shopify entegrasyonu. Bağımsız araçlar üç pazaryeri aramasında çalışır.",
  },
  {
    q: "Fiyatlar KDV dahil mi?",
    a: "Hayır — listelenen aylık fiyatlar KDV hariçtir.",
  },
];

/** Flat footer / legacy nav links */
export const MARKETING_NAV = [
  { label: "Ürünler", href: "/urunler" },
  { label: "Fiyatlandırma", href: "/pricing" },
  { label: "Hakkımızda", href: "/hakkimizda" },
  { label: "SSS", href: "/sss" },
  { label: "Blog", href: "/blog" },
] as const;

export function getRelatedTools(currentSlug: string, limit = 4): ToolDefinition[] {
  const current = ALL_TOOLS.find((t) => t.slug === currentSlug);
  const others = ALL_TOOLS.filter((t) => t.slug !== currentSlug);
  if (!current) return others.slice(0, limit);
  const sameCat = others.filter((t) => t.category === current.category);
  const rest = others.filter((t) => t.category !== current.category);
  return [...sameCat, ...rest].slice(0, limit);
}
