import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Sık Sorulan Sorular",
  description:
    "TrueMargin hakkında sık sorulan sorular: ücretsiz plan, mağaza bağlantısı, desteklenen pazaryerleri ve fiyatlandırma.",
  path: "/sss",
});

export default function SssLayout({ children }: { children: React.ReactNode }) {
  return children;
}
