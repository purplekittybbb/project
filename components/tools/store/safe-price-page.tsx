"use client";

import { useMemo, useState } from "react";
import { computeSafePrice, suggestBuyboxPrice } from "@/lib/calc/safe-price";
import { commissionRuleFor, type GuestMarketplace } from "@/lib/tools/marketplace-fees";
import { mapToInternalCategory } from "@/lib/domain/internal-category";
import { fmtPct, fmtTry } from "@/lib/tools/format-tr";
import { FIELD_ERROR_TEXT } from "@/lib/design/financial-ui";
import type { useStoreToolData } from "./use-store-tool-data";

type Ready = Extract<ReturnType<typeof useStoreToolData>, { status: "ready" }>;

export function SafePriceStorePage({ data }: { data: Ready }) {
  const skus = [...data.skuEconomics.values()];
  const [selectedSku, setSelectedSku] = useState(skus[0]?.sku ?? "");
  const [targetMargin, setTargetMargin] = useState("15");
  const [competitorPrice, setCompetitorPrice] = useState("");

  const econ = data.skuEconomics.get(selectedSku);

  const result = useMemo(() => {
    if (!econ) return null;
    const mp = (["trendyol", "hepsiburada", "n11"].includes(econ.marketplace)
      ? econ.marketplace
      : "trendyol") as GuestMarketplace;
    const rule = commissionRuleFor(mp, mapToInternalCategory(econ.category));
    const safe = computeSafePrice({
      unitCost: econ.unitCost,
      shippingPerUnit: econ.shippingPerUnit,
      packagingPerUnit: econ.packagingPerUnit,
      adSpendPerUnit: econ.adSpendPerUnit,
      returnRate: econ.returnRate,
      commissionRate: rule.rate,
      commissionVatRate: rule.commissionVatRate,
      commissionBasis: rule.basis,
      vatRate: rule.vatRate,
      targetMarginPct: Number(targetMargin.replace(",", ".")) || 0,
    });
    const comp = Number(competitorPrice.replace(",", "."));
    const buybox = comp > 0 ? suggestBuyboxPrice(safe, comp) : null;
    return { safe, buybox };
  }, [econ, targetMargin, competitorPrice]);

  if (skus.length === 0) {
    return <p className="text-sm text-muted-foreground">SKU verisi yok.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium">SKU</label>
          <select
            value={selectedSku}
            onChange={(e) => setSelectedSku(e.target.value)}
            className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            {skus.map((s) => (
              <option key={s.sku} value={s.sku}>{s.productTitle}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium">Hedef net marj (%)</label>
          <input
            type="text"
            value={targetMargin}
            onChange={(e) => setTargetMargin(e.target.value)}
            className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium">Rakip fiyatı (opsiyonel, buybox)</label>
          <input
            type="text"
            value={competitorPrice}
            onChange={(e) => setCompetitorPrice(e.target.value)}
            placeholder="Boş bırakırsanız yalnızca taban fiyat hesaplanır"
            className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
      </div>

      {result && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-[var(--tm-r-ui)] border border-[var(--tm-mist)] bg-card p-5">
            <p className="text-xs uppercase text-muted-foreground">Taban fiyat (başabaş)</p>
            <p className="mt-2 text-2xl font-bold tabular-nums">{fmtTry(result.safe.floorPrice)}</p>
            {!result.safe.feasible && (
              <p className={`mt-2 text-sm ${FIELD_ERROR_TEXT}`}>{result.safe.infeasibleReason}</p>
            )}
          </div>
          <div className="rounded-[var(--tm-r-ui)] border border-[var(--tm-mist)] bg-card p-5">
            <p className="text-xs uppercase text-muted-foreground">Hedef marj fiyatı</p>
            <p className="mt-2 text-2xl font-bold tabular-nums">
              {Number.isFinite(result.safe.targetPrice) ? fmtTry(result.safe.targetPrice) : "—"}
            </p>
          </div>
          {result.buybox && (
            <div className="tm-capsule-profit rounded-[var(--tm-r-ui)] p-5 sm:col-span-2">
              <p className="text-xs uppercase text-muted-foreground">Buybox önerisi</p>
              <p className="mt-2 text-lg font-semibold">
                {result.buybox.canCompete
                  ? `${fmtTry(result.buybox.suggestedPrice)} (${result.buybox.pricingMode}) — beklenen marj ${fmtPct(result.buybox.expectedMarginPct)}`
                  : "Rakip fiyat tabanın altında — eşleşmek zarar eder."}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
