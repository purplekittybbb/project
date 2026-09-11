import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Hesap aç",
  description: "TrueMargin'e kaydol. Pazaryeri siparişlerini bağla, SKU bazlı gerçek marjı gör.",
  path: "/signup",
});

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
