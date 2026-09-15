"use client";

import { useMemo, useState } from "react";
import { INTERNAL_CATEGORIES } from "@/lib/tools/marketplace-fees";
import { calcGuestProfit } from "@/lib/tools/guest-profit-calc";
import { fmtPct, fmtTry } from "@/lib/tools/format-tr";

const DEDUCTION_LABELS: Record<string, string> = {
  commission: "Komisyon",
  commissionVat: "Komisyon KDV",
  paymentFees: "Ödeme ücreti",
  shipping: "Kargo",
  returnRiskCost: "İade riski",
  adSpend: "Reklam",
  extraFees: "Platform ek ücretleri",
  packaging: "Ambalaj",
  cogs: "Ürün maliyeti",
};

export function ProfitCalculator() {
  const [marketplace, setMarketplace] = useState<"trendyol" | "hepsiburada" | "n11">("trendyol");
  const [category, setCategory] = useState<(typeof INTERNAL_CATEGORIES)[number]>("Elektronik");
  const [salePrice, setSalePrice] = useState("299");
  const [unitCost, setUnitCost] = useState("120");
  const [shipping, setShipping] = useState("45");
  const [returnRate, setReturnRate] = useState("5");
  const [adSpend, setAdSpend] = useState("0");
  const [packaging, setPackaging] = useState("0");

  const result = useMemo(() => {
    const price = Number(salePrice.replace(",", "."));
    if (!(price > 0)) return null;
    return calcGuestProfit({
      marketplace,
      category,
      salePrice: price,
      unitCost: Number(unitCost.replace(",", ".")) || 0,
      shipping: Number(shipping.replace(",", ".")) || 0,
      returnRatePercent: Number(returnRate.replace(",", ".")) || 0,
      adSpend: Number(adSpend.replace(",", ".")) || 0,
      packaging: Number(packaging.replace(",", ".")) || 0,
    });
  }, [marketplace, category, salePrice, unitCost, shipping, returnRate, adSpend, packaging]);

  return (
    <div className="mx-auto max-w-3xl">
      <span className="tm-capsule-profit inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide fin-profit">
        Ücretsiz Dene
      </span>
      <h1 className="mt-4 font-heading text-3xl font-bold tracking-tight text-foreground">
        Komisyon & Net Kâr Hesaplama
      </h1>
      <p className="mt-3 text-base leading-relaxed text-muted-foreground">
        Satış fiyatınızdan komisyon, KDV, kargo, iade ve reklam düşüldükten sonra gerçek net kârınızı
        hesaplayın. Giriş gerekmez — temsilî pazaryeri oranları kullanılır.
      </p>

      <form
        className="mt-8 space-y-4 rounded-[var(--tm-r-ui)] border border-[var(--tm-mist)] bg-card p-6"
        onSubmit={(e) => e.preventDefault()}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium">Pazaryeri</label>
            <select
              value={marketplace}
              onChange={(e) => setMarketplace(e.target.value as typeof marketplace)}
              className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="trendyol">Trendyol</option>
              <option value="hepsiburada">Hepsiburada</option>
              <option value="n11">N11</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium">Kategori</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as typeof category)}
              className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              {INTERNAL_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium">Satış fiyatı (KDV dahil, ₺)</label>
            <input
              type="text"
              inputMode="decimal"
              value={salePrice}
              onChange={(e) => setSalePrice(e.target.value)}
              className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Ürün maliyeti (₺)</label>
            <input
              type="text"
              inputMode="decimal"
              value={unitCost}
              onChange={(e) => setUnitCost(e.target.value)}
              className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Kargo (₺)</label>
            <input
              type="text"
              inputMode="decimal"
              value={shipping}
              onChange={(e) => setShipping(e.target.value)}
              className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">İade oranı (%)</label>
            <input
              type="text"
              inputMode="decimal"
              value={returnRate}
              onChange={(e) => setReturnRate(e.target.value)}
              className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Reklam (₺)</label>
            <input
              type="text"
              inputMode="decimal"
              value={adSpend}
              onChange={(e) => setAdSpend(e.target.value)}
              className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Ambalaj (₺)</label>
            <input
              type="text"
              inputMode="decimal"
              value={packaging}
              onChange={(e) => setPackaging(e.target.value)}
              className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Komisyon oranı ({category}): {result ? `%${result.commissionRatePct.toFixed(1)}` : "—"} ·
          Temsilî oranlar — panel sözleşmenizle doğrulayın.
        </p>
      </form>

      {result && (
        <div className="mt-8 space-y-4">
          <div
            className={`rounded-[var(--tm-r-ui)] p-6 ${
              result.isLoss ? "tm-capsule-loss" : "tm-capsule-profit"
            }`}
          >
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Net kâr</p>
            <p className={`mt-1 font-heading text-3xl font-bold tabular-nums ${result.isLoss ? "fin-loss" : "fin-profit"}`}>
              {fmtTry(result.netProfit)}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Net marj: {fmtPct(result.netMarginPercent)} · Brüt ciro: {fmtTry(result.grossRevenue)}
            </p>
            {result.isLoss && (
              <p className="mt-2 text-sm fin-loss">
                Bu fiyat ve maliyetlerle satış zarar eder. Satış fiyatını yükseltin veya maliyetleri düşürün.
              </p>
            )}
          </div>

          <div className="overflow-hidden rounded-[var(--tm-r-ui)] border border-[var(--tm-mist)]">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Kalem</th>
                  <th className="px-4 py-3 text-right">Tutar</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(result.breakdown)
                  // "extraFees" is N11-specific (platform ek ücretleri) — always 0 and
                  // not applicable for Trendyol/Hepsiburada, so hide it for them instead
                  // of showing a confusing always-zero line item.
                  .filter(([key]) => key !== "extraFees" || marketplace === "n11")
                  .map(([key, value]) => (
                  <tr key={key} className="border-t border-border">
                    <td className="px-4 py-2.5">{DEDUCTION_LABELS[key] ?? key}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">−{fmtTry(value as number)}</td>
                  </tr>
                ))}
                <tr className="border-t border-border bg-secondary/30 font-medium">
                  <td className="px-4 py-3">Toplam kesinti</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">−{fmtTry(result.totalDeductions)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
