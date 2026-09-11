import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Demo",
  description: "TrueMargin demosu — örnek satıcı verisiyle gerçek marj, sessiz zarar ve nakit akışını incele. Giriş gerekmez.",
  path: "/demo",
});

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
