import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Finansman",
  description: "Gerçek marj üzerinden finansman değerlendirmesi.",
  path: "/financing",
  index: false,
});

export default function FinancingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
