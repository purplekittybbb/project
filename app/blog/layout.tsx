import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Blog / Rehberler",
  description:
    "Trendyol, Hepsiburada ve N11 satıcıları için komisyon oranları, net kâr ve pazaryeri stratejileri üzerine rehberler.",
  path: "/blog",
});

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return children;
}
