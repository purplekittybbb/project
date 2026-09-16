import type { MetadataRoute } from "next";
import { ALL_TOOLS } from "@/lib/tools/registry";
import { siteOrigin } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteOrigin();
  const lastModified = new Date();
  const toolPages = ALL_TOOLS.map((t) => ({
    url: `${base}${t.href}`,
    lastModified,
    changeFrequency: "monthly" as const,
    priority: t.category === "standalone" ? 0.85 : 0.75,
  }));

  return [
    { url: `${base}/`, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/urunler`, lastModified, changeFrequency: "monthly", priority: 0.9 },
    { url: `${base}/pricing`, lastModified, changeFrequency: "monthly", priority: 0.9 },
    { url: `${base}/hakkimizda`, lastModified, changeFrequency: "yearly", priority: 0.5 },
    { url: `${base}/gizlilik`, lastModified, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/kullanim-kosullari`, lastModified, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/iptal-iade`, lastModified, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/sss`, lastModified, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/changelog`, lastModified, changeFrequency: "weekly", priority: 0.4 },
    // /blog is intentionally excluded — it's noindex until it has real
    // content (see app/blog/page.tsx), so it shouldn't be in the sitemap.
    ...toolPages,
    { url: `${base}/login`, lastModified, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/signup`, lastModified, changeFrequency: "yearly", priority: 0.4 },
  ];
}
