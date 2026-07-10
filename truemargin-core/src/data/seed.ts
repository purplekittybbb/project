/**
 * Seed data — THREE REPRESENTATIVE SELLERS.
 *
 * IMPORTANT: these figures are representative placeholders modelled on real
 * marketplace economics. When the design partners' real numbers are ready, replace
 * the raw rows below (the structure stays identical) and the whole demo — margin
 * reveal, underwriting, backtest — recomputes automatically.
 *
 * Seller B is deliberately a "silent loser": healthy revenue and a comfortable
 * perceived margin, but ad spend + returns push its TRUE margin negative — exactly
 * the seller a revenue-snapshot incumbent would over-lend to.
 */

import type { BacktestSeller } from "../domain/backtest.js";
import type { Transaction, UnderwritingInputs } from "../domain/canonical.js";
import { aggregateTrueMargin } from "../domain/margin-engine.js";
import { TrendyolAdapter, type RawTrendyolRow } from "../adapters/trendyol.js";

const trendyol = new TrendyolAdapter();

/** Seller A — Ev & Yaşam, disciplined, genuinely profitable. */
const SELLER_A_RAW: RawTrendyolRow[] = [
  { orderId: "A-1", sku: "EV-TOWEL-01", category: "Ev & Yaşam", saleDate: "2026-05-04", units: 300, grossRevenue: 90000, unitCost: 120, shipping: 6000, returnRate: 0.04, adSpend: 4000 },
  { orderId: "A-2", sku: "EV-SHEET-02", category: "Ev & Yaşam", saleDate: "2026-05-18", units: 180, grossRevenue: 72000, unitCost: 150, shipping: 3600, returnRate: 0.05, adSpend: 3000 },
  { orderId: "A-3", sku: "EV-TOWEL-01", category: "Ev & Yaşam", saleDate: "2026-06-02", units: 320, grossRevenue: 96000, unitCost: 120, shipping: 6400, returnRate: 0.04, adSpend: 4200 },
];

/** Seller B — Elektronik, high revenue but ad + returns eat the margin (silent loser). */
const SELLER_B_RAW: RawTrendyolRow[] = [
  { orderId: "B-1", sku: "EL-EARBUD-09", category: "Elektronik", saleDate: "2026-05-06", units: 500, grossRevenue: 250000, unitCost: 300, shipping: 12000, returnRate: 0.12, adSpend: 55000 },
  { orderId: "B-2", sku: "EL-CHARGER-3", category: "Elektronik", saleDate: "2026-05-22", units: 400, grossRevenue: 160000, unitCost: 210, shipping: 8000, returnRate: 0.1, adSpend: 34000 },
  { orderId: "B-3", sku: "EL-EARBUD-09", category: "Elektronik", saleDate: "2026-06-10", units: 520, grossRevenue: 260000, unitCost: 300, shipping: 12500, returnRate: 0.13, adSpend: 60000 },
];

/** Seller C — Kozmetik, mid-margin, moderate ad dependence. */
const SELLER_C_RAW: RawTrendyolRow[] = [
  { orderId: "C-1", sku: "KOZ-SERUM-04", category: "Kozmetik", saleDate: "2026-05-09", units: 220, grossRevenue: 110000, unitCost: 210, shipping: 4400, returnRate: 0.06, adSpend: 12000 },
  { orderId: "C-2", sku: "KOZ-CREAM-07", category: "Kozmetik", saleDate: "2026-05-27", units: 160, grossRevenue: 88000, unitCost: 250, shipping: 3200, returnRate: 0.07, adSpend: 9000 },
  { orderId: "C-3", sku: "KOZ-SERUM-04", category: "Kozmetik", saleDate: "2026-06-14", units: 240, grossRevenue: 120000, unitCost: 210, shipping: 4800, returnRate: 0.06, adSpend: 13500 },
];

export interface SeededSeller {
  tenantId: string;
  perceivedMarginBelief: number; // what the seller *thinks* their margin is (%)
  tenureMonths: number;
  transactions: Transaction[];
}

export const SELLERS: SeededSeller[] = [
  { tenantId: "seller-a", perceivedMarginBelief: 28, tenureMonths: 20, transactions: trendyol.toCanonical("seller-a", SELLER_A_RAW) },
  { tenantId: "seller-b", perceivedMarginBelief: 24, tenureMonths: 9, transactions: trendyol.toCanonical("seller-b", SELLER_B_RAW) },
  { tenantId: "seller-c", perceivedMarginBelief: 22, tenureMonths: 14, transactions: trendyol.toCanonical("seller-c", SELLER_C_RAW) },
];

/** Number of distinct sale months represented in a seller's transactions. */
function monthSpan(txs: Transaction[]): number {
  const months = new Set(txs.map((t) => t.saleDate.slice(0, 7)));
  return Math.max(1, months.size);
}

/** Derive underwriting inputs from a seller's canonical transactions. */
export function deriveUnderwritingInputs(seller: SeededSeller): UnderwritingInputs {
  const txs = seller.transactions;
  const months = monthSpan(txs);
  const agg = aggregateTrueMargin(txs);

  const monthlyRevenue = agg.grossRevenue / months;
  const trailingMonthlyContribution = agg.netContribution / months;
  const trueMarginPct = agg.marginPct;

  // Monthly revenue series for a simple volatility (coefficient of variation).
  const byMonth = new Map<string, number>();
  for (const t of txs) {
    const m = t.saleDate.slice(0, 7);
    byMonth.set(m, (byMonth.get(m) ?? 0) + t.grossRevenue);
  }
  const series = [...byMonth.values()];
  const mean = series.reduce((a, b) => a + b, 0) / series.length;
  const variance =
    series.reduce((a, b) => a + (b - mean) ** 2, 0) / series.length;
  const revenueVolatility = mean === 0 ? 0 : Math.sqrt(variance) / mean;

  const totalUnits = txs.reduce((a, t) => a + t.units, 0);
  const stockVelocity = totalUnits / months;

  const revenueWeightedReturn =
    txs.reduce((a, t) => a + t.fees.returnsAllocated, 0) /
    Math.max(1, agg.cogs);

  return {
    trueMarginPct,
    trailingMonthlyContribution,
    monthlyRevenue,
    revenueVolatility,
    stockVelocity,
    returnRate: Math.min(0.5, revenueWeightedReturn),
    tenureMonths: seller.tenureMonths,
  };
}

/** Build the backtest input set from the seeded sellers. */
export function seededBacktestSellers(): BacktestSeller[] {
  return SELLERS.map((s) => ({
    tenantId: s.tenantId,
    currency: "TRY" as const,
    inputs: deriveUnderwritingInputs(s),
  }));
}
