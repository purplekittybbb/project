"use client";

import { useMemo } from "react";
import { DemandEstimateCard } from "@/components/DemandEstimateCard";
import { estimateDemand } from "@/lib/demand/signals";
import type { useStoreToolData } from "./use-store-tool-data";

type Ready = Extract<ReturnType<typeof useStoreToolData>, { status: "ready" }>;

function liveEstimateFromRows(data: Ready, sku: string) {
  const rows = data.rows.filter((r) => r.sku === sku);
  if (rows.length === 0) return null;
  const totalUnits = rows.reduce((s, r) => s + r.units, 0);
  const timestamps = rows.map((r) => new Date(r.sale_date).getTime());
  const dataDays = Math.max(1, Math.round((Math.max(...timestamps) - Math.min(...timestamps)) / 86_400_000));
  return estimateDemand({ stockDelta: { dailySalesRate: totalUnits / dataDays, dataDays } });
}

export function DemandStorePage({ data }: { data: Ready }) {
  const skuList = useMemo(() => [...data.skuEconomics.keys()], [data.skuEconomics]);

  const estimatesBySku = useMemo(() => {
    const map = new Map<string, ReturnType<typeof estimateDemand>>();
    for (const sku of skuList) {
      const stored = data.demandEstimates.find((e) => e.sku === sku);
      map.set(sku, stored ?? liveEstimateFromRows(data, sku)!);
    }
    return map;
  }, [data, skuList]);

  // Real trailing-30-day units sold per SKU — same computation as
  // app/dashboard/page.tsx's last30BySku. This standalone tool page used to
  // only show the AI-projected range with no real historical number behind
  // it; a seller landing here directly (not via the main dashboard) never
  // saw the actual "son 30 gün satılan" figure the demand card is built to
  // headline. Kept in sync with the dashboard's cutoff/aggregation logic.
  const last30BySku = useMemo(() => {
    const cutoff = Date.now() - 30 * 86_400_000;
    const m = new Map<string, number>();
    for (const r of data.rows) {
      const t = new Date(r.sale_date).getTime();
      if (Number.isFinite(t) && t >= cutoff) {
        m.set(r.sku, (m.get(r.sku) ?? 0) + (r.units ?? 0));
      }
    }
    return m;
  }, [data.rows]);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {skuList.map((sku) => {
        const estimate = estimatesBySku.get(sku);
        const title = data.skuEconomics.get(sku)?.productTitle ?? sku;
        if (!estimate) return null;
        return (
          <DemandEstimateCard
            key={sku}
            sku={title}
            estimate={estimate}
            last30Units={last30BySku.get(sku)}
          />
        );
      })}
    </div>
  );
}
