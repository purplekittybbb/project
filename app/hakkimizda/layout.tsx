import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Hakkımızda",
  description:
    "TrueMargin, Türkiye pazaryeri satıcıları için net kâr odaklı analiz araçları sunar — Trendyol, Hepsiburada, N11 ve Shopify siparişlerinden gerçek maliyet düşülmüş kârı hesaplar.",
  path: "/hakkimizda",
});

export default function HakkimizdaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
