"use client";

/**
 * Dashboard price / safe-price results surface (Client Component).
 * Uses fin-profit / fin-loss via CompetitorPriceBand (RSC-safe sibling).
 */

import { SafePriceStorePage } from "@/components/tools/store/safe-price-page";
import type { StoreToolState } from "@/components/tools/store/use-store-tool-data";
import { CompetitorPriceBand } from "./CompetitorPriceBand";

type ReadyStoreData = Extract<StoreToolState, { status: "ready" }>;

export interface PriceTrackerResultsProps {
  data: ReadyStoreData;
  emptyMessage?: string;
}

export { CompetitorPriceBand };

export function PriceTrackerResults({
  data,
  emptyMessage = "Henüz veri yok — Verilerim sekmesinden yükleyin veya mağaza bağlayın.",
}: PriceTrackerResultsProps) {
  const empty = data.skuEconomics.size === 0;

  return (
    <div className="max-w-[1100px] mx-auto px-8 py-12 md:py-16">
      {empty ? (
        <p className="text-zinc-600 font-mono text-[12px]">{emptyMessage}</p>
      ) : (
        <div className="bg-[var(--tm-paper)] text-[var(--tm-ink)] rounded-[var(--tm-r-ui)] p-6 md:p-8">
          <SafePriceStorePage data={data} />
        </div>
      )}
    </div>
  );
}
