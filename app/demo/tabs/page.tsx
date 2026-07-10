"use client";

/**
 * One-click preview: seeds sample connected marketplaces, then opens the
 * public seed demo (/demo) so the dynamic header tabs are visible immediately.
 * Demo-only helper — no payment, no API calls, no real auth.
 *
 * Deliberately does NOT call completeOnboarding(): that flag belongs to real
 * signed-in accounts, and this page must never mark a real user's onboarding
 * as done just because someone previewed the demo in the same browser.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { setConnectedMarketplaces } from "@/lib/onboarding";
import { addConnection, clearAllConnections } from "@/lib/connect/store";

export default function DemoTabsPage() {
  const router = useRouter();

  useEffect(() => {
    clearAllConnections();
    ["amazon_us", "trendyol", "shopify", "ebay", "hepsiburada"].forEach((id) => addConnection(id, "demo"));
    setConnectedMarketplaces(["amazon_us", "trendyol", "shopify", "ebay", "hepsiburada"]);
    router.replace("/demo");
  }, [router]);

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <span className="text-zinc-600 font-mono text-[11px] uppercase tracking-[0.2em]">Opening dashboard tabs…</span>
    </div>
  );
}
