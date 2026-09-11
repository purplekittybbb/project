import type { Metadata } from "next";

/**
 * Shared SEO defaults. Per-route layouts override title/description.
 * Public origin is NEXT_PUBLIC_SITE_URL when set; otherwise relative OG URLs.
 */

export const SITE_NAME = "TrueMargin";
export const SITE_TAGLINE = "Pazaryeri satıcıları için gerçek net kâr.";

export const DEFAULT_TITLE = "TrueMargin — Gerçek marjını gör, ona göre finansman al";
export const DEFAULT_DESCRIPTION =
  "Trendyol, Hepsiburada, N11 ve Amazon TR satıcıları için komisyon, KDV, kargo, iade ve reklam düşülmüş gerçek SKU kârı. Tahmin değil — senin siparişlerin.";

export function siteOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (raw) return raw.replace(/\/$/, "");
  return "https://truemargin.app";
}

export function absoluteUrl(path = "/"): string {
  if (path.startsWith("http")) return path;
  return `${siteOrigin()}${path.startsWith("/") ? path : `/${path}`}`;
}

export function pageMetadata(opts: {
  title: string;
  description: string;
  path: string;
  index?: boolean;
}): Metadata {
  const url = absoluteUrl(opts.path);
  const index = opts.index !== false;
  return {
    title: opts.title,
    description: opts.description,
    alternates: { canonical: url },
    robots: index ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: {
      type: "website",
      locale: "tr_TR",
      siteName: SITE_NAME,
      title: opts.title,
      description: opts.description,
      url,
    },
    twitter: {
      card: "summary_large_image",
      title: opts.title,
      description: opts.description,
    },
  };
}

/** schema.org SoftwareApplication JSON-LD for the public marketing surface. */
export function softwareApplicationJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE_NAME,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description: DEFAULT_DESCRIPTION,
    url: siteOrigin(),
    offers: {
      "@type": "Offer",
      priceCurrency: "TRY",
      availability: "https://schema.org/InStock",
    },
    featureList: [
      "Pazaryeri komisyon ve KDV matrahına göre net kâr",
      "SKU bazlı sessiz zarar alarmı",
      "Trendyol, Hepsiburada, N11 senkronizasyonu",
    ],
  };
}
