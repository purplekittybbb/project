import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Ürünler",
  description:
    "TrueMargin web uygulaması: kâr hesaplama, zarar alarmı, güvenli fiyat, görünürlük, talep, fırsat keşfi, liste kalite skoru. Chrome uzantısı: partner panelinde mağaza kârı.",
  path: "/urunler",
});

export default function UrunlerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
