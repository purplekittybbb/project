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

import type { BacktestSeller } from "../domain/backtest";
import type { Transaction, UnderwritingInputs } from "../domain/canonical";
import { aggregateTrueMargin } from "../domain/margin-engine";
import { AmazonUsAdapter, type RawAmazonUsRow } from "../adapters/amazon-us";
import { TrendyolAdapter, type RawTrendyolRow } from "../adapters/trendyol";
import { HepsiburadaAdapter, type RawHepsiburadaRow } from "../adapters/hepsiburada";

const trendyol = new TrendyolAdapter();
const amazon = new AmazonUsAdapter();
const hepsiburada = new HepsiburadaAdapter();

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

/** Amazon US channel — same SKU economics in USD (representative ~33 TRY/USD). */
const SELLER_A_AMAZON_RAW: RawAmazonUsRow[] = [
  { orderId: "A-1-US", sku: "EV-TOWEL-01", category: "Home", saleDate: "2026-05-04", units: 300, grossRevenue: 2727, unitCost: 4, fbaFee: 182, returnRate: 0.04, adSpend: 121 },
  { orderId: "A-2-US", sku: "EV-SHEET-02", category: "Home", saleDate: "2026-05-18", units: 180, grossRevenue: 2182, unitCost: 5, fbaFee: 109, returnRate: 0.05, adSpend: 91 },
  { orderId: "A-3-US", sku: "EV-TOWEL-01", category: "Home", saleDate: "2026-06-02", units: 320, grossRevenue: 2909, unitCost: 4, fbaFee: 194, returnRate: 0.04, adSpend: 127 },
];

const SELLER_B_AMAZON_RAW: RawAmazonUsRow[] = [
  { orderId: "B-1-US", sku: "EL-EARBUD-09", category: "Electronics", saleDate: "2026-05-06", units: 500, grossRevenue: 7576, unitCost: 9, fbaFee: 364, returnRate: 0.12, adSpend: 1667 },
  { orderId: "B-2-US", sku: "EL-CHARGER-3", category: "Electronics", saleDate: "2026-05-22", units: 400, grossRevenue: 4848, unitCost: 6, fbaFee: 242, returnRate: 0.1, adSpend: 1030 },
  { orderId: "B-3-US", sku: "EL-EARBUD-09", category: "Electronics", saleDate: "2026-06-10", units: 520, grossRevenue: 7879, unitCost: 9, fbaFee: 379, returnRate: 0.13, adSpend: 1818 },
];

const SELLER_C_AMAZON_RAW: RawAmazonUsRow[] = [
  { orderId: "C-1-US", sku: "KOZ-SERUM-04", category: "Beauty", saleDate: "2026-05-09", units: 220, grossRevenue: 3333, unitCost: 6, fbaFee: 133, returnRate: 0.06, adSpend: 364 },
  { orderId: "C-2-US", sku: "KOZ-CREAM-07", category: "Beauty", saleDate: "2026-05-27", units: 160, grossRevenue: 2667, unitCost: 8, fbaFee: 97, returnRate: 0.07, adSpend: 273 },
  { orderId: "C-3-US", sku: "KOZ-SERUM-04", category: "Beauty", saleDate: "2026-06-14", units: 240, grossRevenue: 3636, unitCost: 6, fbaFee: 145, returnRate: 0.06, adSpend: 409 },
];

/** Hepsiburada channel — third connector, same sellers, independent commission table. */
const SELLER_A_HEPSIBURADA_RAW: RawHepsiburadaRow[] = [
  { orderId: "A-1-HB", sku: "EV-TOWEL-01", category: "Ev & Yaşam", saleDate: "2026-05-05", units: 150, grossRevenue: 45000, unitCost: 120, shipping: 3000, returnRate: 0.04, adSpend: 1800 },
  { orderId: "A-2-HB", sku: "EV-SHEET-02", category: "Ev & Yaşam", saleDate: "2026-05-20", units: 90, grossRevenue: 36000, unitCost: 150, shipping: 1800, returnRate: 0.05, adSpend: 1500 },
  { orderId: "A-3-HB", sku: "EV-TOWEL-01", category: "Ev & Yaşam", saleDate: "2026-06-03", units: 160, grossRevenue: 48000, unitCost: 120, shipping: 3200, returnRate: 0.04, adSpend: 1900 },
];

const SELLER_B_HEPSIBURADA_RAW: RawHepsiburadaRow[] = [
  { orderId: "B-1-HB", sku: "EL-EARBUD-09", category: "Elektronik", saleDate: "2026-05-07", units: 250, grossRevenue: 125000, unitCost: 300, shipping: 6000, returnRate: 0.12, adSpend: 27500 },
  { orderId: "B-2-HB", sku: "EL-CHARGER-3", category: "Elektronik", saleDate: "2026-05-23", units: 200, grossRevenue: 80000, unitCost: 210, shipping: 4000, returnRate: 0.1, adSpend: 17000 },
  { orderId: "B-3-HB", sku: "EL-EARBUD-09", category: "Elektronik", saleDate: "2026-06-11", units: 260, grossRevenue: 130000, unitCost: 300, shipping: 6250, returnRate: 0.13, adSpend: 30000 },
];

const SELLER_C_HEPSIBURADA_RAW: RawHepsiburadaRow[] = [
  { orderId: "C-1-HB", sku: "KOZ-SERUM-04", category: "Kozmetik", saleDate: "2026-05-10", units: 110, grossRevenue: 55000, unitCost: 210, shipping: 2200, returnRate: 0.06, adSpend: 6000 },
  { orderId: "C-2-HB", sku: "KOZ-CREAM-07", category: "Kozmetik", saleDate: "2026-05-28", units: 80, grossRevenue: 44000, unitCost: 250, shipping: 1600, returnRate: 0.07, adSpend: 4500 },
  { orderId: "C-3-HB", sku: "KOZ-SERUM-04", category: "Kozmetik", saleDate: "2026-06-15", units: 120, grossRevenue: 60000, unitCost: 210, shipping: 2400, returnRate: 0.06, adSpend: 6750 },
];

export interface SeededSeller {
  tenantId: string;
  perceivedMarginBelief: number; // what the seller *thinks* their margin is (%)
  tenureMonths: number;
  transactions: Transaction[];
}

export const SELLERS: SeededSeller[] = [
  {
    tenantId: "seller-a",
    perceivedMarginBelief: 28,
    tenureMonths: 20,
    transactions: [
      ...trendyol.toCanonical("seller-a", SELLER_A_RAW),
      ...amazon.toCanonical("seller-a", SELLER_A_AMAZON_RAW),
      ...hepsiburada.toCanonical("seller-a", SELLER_A_HEPSIBURADA_RAW),
    ],
  },
  {
    tenantId: "seller-b",
    perceivedMarginBelief: 24,
    tenureMonths: 9,
    transactions: [
      ...trendyol.toCanonical("seller-b", SELLER_B_RAW),
      ...amazon.toCanonical("seller-b", SELLER_B_AMAZON_RAW),
      ...hepsiburada.toCanonical("seller-b", SELLER_B_HEPSIBURADA_RAW),
    ],
  },
  {
    tenantId: "seller-c",
    perceivedMarginBelief: 22,
    tenureMonths: 14,
    transactions: [
      ...trendyol.toCanonical("seller-c", SELLER_C_RAW),
      ...amazon.toCanonical("seller-c", SELLER_C_AMAZON_RAW),
      ...hepsiburada.toCanonical("seller-c", SELLER_C_HEPSIBURADA_RAW),
    ],
  },
];

/** Number of distinct sale months represented in a seller's transactions. */
function monthSpan(txs: Transaction[]): number {
  const months = new Set(txs.map((t) => t.saleDate.slice(0, 7)));
  return Math.max(1, months.size);
}

/** Derive underwriting inputs from a transaction set. */
export function deriveUnderwritingInputsFromTransactions(
  txs: Transaction[],
  tenureMonths: number
): UnderwritingInputs {
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
    tenureMonths,
  };
}

/** Derive underwriting inputs from a seller's canonical transactions (Trendyol channel for portfolio backtest). */
export function deriveUnderwritingInputs(seller: SeededSeller): UnderwritingInputs {
  const txs = seller.transactions.filter((t) => t.marketplace === "trendyol");
  return deriveUnderwritingInputsFromTransactions(txs, seller.tenureMonths);
}

/** Build the backtest input set from the seeded sellers. */
export function seededBacktestSellers(): BacktestSeller[] {
  return SELLERS.map((s) => ({
    tenantId: s.tenantId,
    currency: "TRY" as const,
    inputs: deriveUnderwritingInputs(s),
  }));
}
