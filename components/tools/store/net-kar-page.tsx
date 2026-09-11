"use client";

import { fmtPct, fmtTry } from "@/lib/tools/format-tr";
import type { useStoreToolData } from "./use-store-tool-data";

type Ready = Extract<ReturnType<typeof useStoreToolData>, { status: "ready" }>;

export function NetKarStorePage({ data }: { data: Ready }) {
  const { view } = data;
  const w = view.waterfall;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-[var(--tm-r-ui)] border border-[var(--tm-mist)] bg-card p-4">
          <p className="text-xs uppercase text-muted-foreground">Net kâr</p>
          <p className={`mt-1 text-2xl font-bold tabular-nums ${view.trueMarginPct < 0 ? "fin-loss" : "fin-profit"}`}>
            {fmtTry(w.netContribution)}
          </p>
        </div>
        <div className="rounded-[var(--tm-r-ui)] border border-[var(--tm-mist)] bg-card p-4">
          <p className="text-xs uppercase text-muted-foreground">Net marj</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{fmtPct(view.trueMarginPct)}</p>
        </div>
        <div className="rounded-[var(--tm-r-ui)] border border-[var(--tm-mist)] bg-card p-4">
          <p className="text-xs uppercase text-muted-foreground">Brüt ciro</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{fmtTry(w.grossRevenue)}</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-[var(--tm-r-ui)] border border-[var(--tm-mist)]">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-secondary/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">SKU</th>
              <th className="px-4 py-3 text-right">Algılanan marj</th>
              <th className="px-4 py-3 text-right">Gerçek marj</th>
            </tr>
          </thead>
          <tbody>
            {[...view.skus].sort((a, b) => b.trueMarginPct - a.trueMarginPct).map((sku) => (
              <tr key={sku.sku} className="border-t border-border">
                <td className="px-4 py-2">{data.skuEconomics.get(sku.sku)?.productTitle ?? sku.sku}</td>
                <td className="px-4 py-2 text-right font-mono tabular-nums">{fmtPct(sku.perceivedMarginPct)}</td>
                <td className={`px-4 py-2 text-right font-mono tabular-nums ${sku.trueMarginPct < 0 ? "fin-loss" : "fin-profit"}`}>
                  {fmtPct(sku.trueMarginPct)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
