/**
 * Public tool registry — nesatilir-style two categories:
 *   standalone  → no store connection (guest rate-limited)
 *   store       → login + marketplace credentials required
 */

export type ToolCategory = "standalone" | "store";
export type ToolBadge = "free" | "store";

export type StandaloneToolId = "visibility" | "price-track" | "top100" | "index-check" | "profit-calc";
export type CalculatorToolId = "profit-calc";
export type StoreToolId =
  | "profit"
  | "loss-alarm"
  | "safe-price"
  | "demand"
  | "list-quality"
  | "barcode-analysis";

export interface ToolDefinition {
  id: StandaloneToolId | StoreToolId;
  slug: string;
  title: string;
  description: string;
  category: ToolCategory;
  badge: ToolBadge;
  /** Public landing page for this tool. */
  href: string;
  /** Where authenticated + connected users land (dashboard section). */
  dashboardHref?: string;
}

export const STANDALONE_TOOLS: ToolDefinition[] = [
  {
    id: "profit-calc",
    slug: "kar-hesapla",
    title: "Komisyon & Net Kâr",
    description: "Satış fiyatından komisyon, KDV, kargo ve iade düşülmüş net kârı anında hesaplayın.",
    category: "standalone",
    badge: "free",
    href: "/araclar/kar-hesapla",
  },
  {
    id: "visibility",
    slug: "gorunurluk",
    title: "Görünürlük Tespiti",
    description: "Ürün adınızın kategori aramasında kaçıncı sırada göründüğünü kontrol edin.",
    category: "standalone",
    badge: "free",
    href: "/araclar/gorunurluk",
  },
  {
    id: "price-track",
    slug: "fiyat-takibi",
    title: "Fiyat Takibi",
    description: "Anahtar kelime için rakip fiyat dağılımını anında görün.",
    category: "standalone",
    badge: "free",
    href: "/araclar/fiyat-takibi",
  },
  {
    id: "top100",
    slug: "top100-analiz",
    title: "Top 100 Analiz",
    description: "Kategorideki en çok listelenen ürünleri fiyat ve talep sinyalleriyle karşılaştırın.",
    category: "standalone",
    badge: "free",
    href: "/araclar/top100-analiz",
  },
  {
    id: "index-check",
    slug: "index-checker",
    title: "Index Checker",
    description: "Ürününüz arama sonuçlarında indekslenmiş mi, ilk sayfada mı — hızlı kontrol.",
    category: "standalone",
    badge: "free",
    href: "/araclar/index-checker",
  },
];

export const STORE_REQUIRED_TOOLS: ToolDefinition[] = [
  {
    id: "profit",
    slug: "net-kar",
    title: "Net Kâr Hesabı",
    description: "Komisyon, KDV, kargo ve iade düşülmüş SKU bazlı gerçek net kâr.",
    category: "store",
    badge: "store",
    href: "/araclar/net-kar",
    dashboardHref: "/dashboard",
  },
  {
    id: "loss-alarm",
    slug: "zarar-alarmi",
    title: "Zarar Alarmı",
    description: "Ciroda kârlı görünen ama maliyetler sonrası zararda kalan ürünleri işaretle.",
    category: "store",
    badge: "store",
    href: "/araclar/zarar-alarmi",
    dashboardHref: "/dashboard",
  },
  {
    id: "safe-price",
    slug: "guvenli-fiyat",
    title: "Güvenli Fiyat",
    description: "Hedef marj için maliyet tabanlı minimum satış fiyatı öner.",
    category: "store",
    badge: "store",
    href: "/araclar/guvenli-fiyat",
    dashboardHref: "/dashboard",
  },
  {
    id: "demand",
    slug: "talep-olcumu",
    title: "Talep Ölçümü",
    description: "Kendi ürününüzün satış hızı ve stok tükenme sinyalleri.",
    category: "store",
    badge: "store",
    href: "/araclar/talep-olcumu",
    dashboardHref: "/dashboard",
  },
  {
    id: "list-quality",
    slug: "liste-kalite",
    title: "Liste Kalite Skoru",
    description: "Başlık, kategori ve görsel eksiklerini tek skorda topla.",
    category: "store",
    badge: "store",
    href: "/araclar/liste-kalite",
    dashboardHref: "/dashboard",
  },
  {
    id: "barcode-analysis",
    slug: "barkod-analizi",
    title: "Barkod Analizi",
    description: "Aynı EAN/GTIN ile Trendyol, Hepsiburada ve N11 listelerinizi fiyat ve marj açısından karşılaştırın.",
    category: "store",
    badge: "store",
    href: "/araclar/barkod-analizi",
    dashboardHref: "/araclar/barkod-analizi",
  },
];

export const ALL_TOOLS: ToolDefinition[] = [...STANDALONE_TOOLS, ...STORE_REQUIRED_TOOLS];

const BY_SLUG = new Map(ALL_TOOLS.map((t) => [t.slug, t]));
const BY_ID = new Map(ALL_TOOLS.map((t) => [t.id, t]));

export function getToolBySlug(slug: string): ToolDefinition | undefined {
  return BY_SLUG.get(slug);
}

export function getToolById(id: string): ToolDefinition | undefined {
  return BY_ID.get(id as ToolDefinition["id"]);
}

export function isStandaloneToolId(id: string): id is StandaloneToolId {
  return STANDALONE_TOOLS.some((t) => t.id === id);
}

/** API-backed scraper tools (excludes client-only calculators). */
export function isScraperToolId(id: string): boolean {
  return id === "visibility" || id === "price-track" || id === "top100" || id === "index-check";
}
