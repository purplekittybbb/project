"use client";

import { ListQualityPanel } from "@/components/ListQualityPanel";
import { computeListQuality } from "@/lib/quality/list-score";
import type { useStoreToolData } from "./use-store-tool-data";

type Ready = Extract<ReturnType<typeof useStoreToolData>, { status: "ready" }>;

export function ListQualityStorePage({ data }: { data: Ready }) {
  const items = data.view.skus.map((sku) => {
    const econ = data.skuEconomics.get(sku.sku);
    const title = econ?.productTitle ?? sku.sku;
    const score = computeListQuality({
      title,
      categoryName: sku.category,
      sku: sku.sku,
      returnRatePct: sku.returnRatePct,
      imageCount: undefined,
    });
    return { skuId: sku.sku, title, score };
  });

  return (
    <div className="space-y-4">
      {items.map(({ skuId, title, score }) => (
        <div key={skuId} className="rounded-[var(--tm-r-ui)] border border-[var(--tm-mist)] bg-card p-4">
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">SKU: {skuId}</p>
          <div className="mt-3">
            <ListQualityPanel sku={title} score={score} />
          </div>
        </div>
      ))}
    </div>
  );
}
