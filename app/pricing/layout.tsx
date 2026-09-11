import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Fiyatlandırma",
  description:
    "TrueMargin paketleri: Başlangıç ₺400/ay, Profesyonel ₺800/ay. Gerçek kâr, zarar alarmı, görünürlük ve liste kalitesi.",
  path: "/pricing",
});

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
