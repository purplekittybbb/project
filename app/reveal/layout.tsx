import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Gerçek marj",
  description: "Algılanan marjdan gerçek marja iniş.",
  path: "/reveal",
  index: false,
});

export default function RevealLayout({ children }: { children: React.ReactNode }) {
  return children;
}
