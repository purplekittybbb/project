"use client";

/**
 * Fırsat Keşfi (Opportunity Discovery) — real per-SKU sales momentum, not a
 * market-wide "trending products" feed. See lib/tools/opportunity-discovery.ts
 * for exactly why: there is no historical snapshot of pazaryeri-wide data to
 * compute a genuine cross-seller trend from yet, so this stays honest about
 * what it is — "which of YOUR OWN products picked up or lost pace" — using
 * --tm-copper (a distinct third tone from the green "all good" / clay "loss"
 * alarms) so it doesn't read as either of those.
 */

import { useState } from "react";
import type { SkuMomentum } from "@/lib/tools/opportunity-discovery";

function fmtInt(n: number): string {
  return new Intl.NumberFormat("tr-TR").format(n);
}

function momentumLabel(m: SkuMomentum): string {
  if (m.isNew) return "Yeni — önceki dönemde satış yok";
  if (m.growthPct == null) return "Değişim yok";
  const pct = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(Math.abs(m.growthPct));
  return m.growthPct >= 0 ? `+%${pct} büyüdü` : `−%${pct} düştü`;
}

export function OpportunityDiscoveryCard({
  momentum,
  onGoToProducts,
}: {
  momentum: SkuMomentum[];
  onGoToProducts?: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const rising = momentum.filter((m) => m.direction === "up");
  const falling = momentum.filter((m) => m.direction === "down");

  if (rising.length === 0 && falling.length === 0) return null;

  const visible = showAll ? rising.slice(0, 8) : rising.slice(0, 3);

  return (
    <div
      className="px-5 py-4 mb-8"
      style={{
        background: "color-mix(in srgb, var(--tm-copper) 7%, var(--tm-paper))",
        border: "1px solid color-mix(in srgb, var(--tm-copper) 22%, transparent)",
        borderRadius: "var(--tm-r-data, 2px)",
      }}
    >
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-2 h-2 rounded-full shrink-0"
            style={{ background: "var(--tm-copper)" }}
            aria-hidden="true"
          />
          <span className="text-[13px] font-semibold" style={{ color: "var(--tm-copper)" }}>
            Fırsat Keşfi
          </span>
        </div>
        <span className="text-[11px] font-sans" style={{ color: "var(--tm-ink)", opacity: 0.45 }}>
          Kendi ürünlerinizde son dönem satış hareketi — pazar geneli trend değil
        </span>
      </div>

      {rising.length > 0 ? (
        <div className="space-y-2">
          {visible.map((m) => (
            <div key={m.sku} className="flex items-center justify-between gap-3 text-[13px]">
              <span className="truncate" style={{ color: "var(--tm-ink)", opacity: 0.85 }} title={m.productTitle}>
                {m.productTitle}
              </span>
              <span className="shrink-0 font-mono tabular-nums" style={{ color: "var(--tm-copper)" }}>
                {momentumLabel(m)} · {fmtInt(m.recentUnits)} adet
              </span>
            </div>
          ))}
          {rising.length > 3 && (
            <button
              type="button"
              onClick={() => setShowAll((p) => !p)}
              className="text-[11px] font-sans underline underline-offset-2 cursor-pointer"
              style={{ color: "var(--tm-ink)", opacity: 0.45, background: "none", border: "none", padding: 0 }}
            >
              {showAll ? "Daha az göster" : `${rising.length - 3} ürün daha göster`}
            </button>
          )}
        </div>
      ) : (
        <p className="text-[12px]" style={{ color: "var(--tm-ink)", opacity: 0.5 }}>
          Son dönemde belirgin şekilde büyüyen ürün yok.
        </p>
      )}

      {falling.length > 0 && (
        onGoToProducts ? (
          <button
            type="button"
            onClick={onGoToProducts}
            className="mt-3 text-[11px] font-sans underline underline-offset-2 cursor-pointer text-left"
            style={{ color: "var(--tm-ink)", opacity: 0.45, background: "none", border: "none", padding: 0 }}
          >
            {falling.length} ürün son dönemde ivme kaybediyor — Ürünler sekmesinde detaylandırın.
          </button>
        ) : (
          <p className="mt-3 text-[11px] font-sans" style={{ color: "var(--tm-ink)", opacity: 0.45 }}>
            {falling.length} ürün son dönemde ivme kaybediyor — Ürünler sekmesinde detaylandırın.
          </p>
        )
      )}
    </div>
  );
}
