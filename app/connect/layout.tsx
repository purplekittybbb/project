import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Pazaryeri bağla",
  description: "Trendyol, Hepsiburada, N11 veya Amazon TR mağazanı TrueMargin'e bağla.",
  path: "/connect",
  index: false,
});

export default function ConnectLayout({ children }: { children: React.ReactNode }) {
  return children;
}
