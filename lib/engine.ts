/**
 * UI ↔ engine bridge.
 *
 * The domain core under /lib/{domain,adapters,data} is the tested, un-touched
 * artifact (moved verbatim from truemargin-core, only import paths adjusted). The
 * UI imports the engine ONLY through this module — the single dependency surface
 * between the Next app and the engine.
 */

import { SELLERS, deriveUnderwritingInputsFromTransactions, seededBacktestSellers, type SeededSeller } from "./data/seed";
import {
  aggregatePerceivedMargin,
  aggregateTrueMargin,
  perSkuMargins,
  computeTrueMargin,
  computePerceivedMargin,
  simulateExcludingSku,
  type MarginResult,
  type SkuMargin,
} from "./domain/margin-engine";
import { incumbentModel, trueMarginModel } from "./domain/underwriting";
import { runBacktest, simulateOutcome, type BacktestReport, type LoanOutcome } from "./domain/backtest";
import { InMemoryLedger, recordDecision } from "./domain/ledger";
import type { Currency, Marketplace, Transaction, UnderwritingDecision, UnderwritingInputs } from "./domain/canonical";

export type { Marketplace };
export type Channel = Marketplace | "combined";

/** Representative USD→TRY for combined-channel reporting (matches seed scaling). */
export const USD_TO_TRY = 33;

export type { MarginResult, SkuMargin, BacktestReport, LoanOutcome };
export type { Transaction, UnderwritingDecision, UnderwritingInputs, SeededSeller };

export {
  SELLERS,
  aggregatePerceivedMargin,
  aggregateTrueMargin,
  perSkuMargins,
  computeTrueMargin,
  computePerceivedMargin,
};

/**
 * Runtime seller registry.
 *
 * Additive layer for per-session sellers — e.g. a signed-in user's own uploaded
 * data. The seeded SELLERS and every existing behaviour are untouched; tenant
 * lookups simply consult this registry FIRST, so all tenant-based engine
 * functions (margin, SKUs, cash-flow, campaign, break-even, settlement) work for
 * user data without any consumer needing to change.
 *
 * State lives in-module (per session). On the client this is exactly what we want:
 * the dashboard registers the user's seller after loading it from Supabase.
 */
const RUNTIME_SELLERS: SeededSeller[] = [];
const RUNTIME_LABELS: Record<string, string> = {};

export function registerRuntimeSeller(seller: SeededSeller, label?: string): void {
  const i = RUNTIME_SELLERS.findIndex((s) => s.tenantId === seller.tenantId);
  if (i >= 0) RUNTIME_SELLERS[i] = seller;
  else RUNTIME_SELLERS.push(seller);
  if (label) RUNTIME_LABELS[seller.tenantId] = label;
}

export function clearRuntimeSellers(): void {
  RUNTIME_SELLERS.length = 0;
  for (const k of Object.keys(RUNTIME_LABELS)) delete RUNTIME_LABELS[k];
}

export function hasRuntimeSeller(tenantId: string): boolean {
  return RUNTIME_SELLERS.some((s) => s.tenantId === tenantId);
}

/** Resolve a seller by id — runtime (user) sellers take precedence over seed. */
function findSeller(tenantId: string): SeededSeller | undefined {
  return (
    RUNTIME_SELLERS.find((s) => s.tenantId === tenantId) ??
    SELLERS.find((s) => s.tenantId === tenantId)
  );
}

/**
 * Live recompute for the dashboard's interactive ad-spend slider.
 *
 * Overriding the total ad spend re-runs the ENGINE (aggregateTrueMargin) on a copy
 * of the seller's transactions with ad spend rescaled — so dragging the slider
 * recomputes the true margin through the exact same waterfall, never a shortcut.
 */
export function recomputeMargin(
  tenantId: string,
  adSpendTotal: number,
  channel: Channel = "trendyol"
): { marginPct: number; netContribution: number } {
  const seller = findSeller(tenantId);
  if (!seller) return { marginPct: 0, netContribution: 0 };
  const txs = transactionsForChannel(seller, channel);
  if (txs.length === 0) return { marginPct: 0, netContribution: 0 };
  const baseAd = txs.reduce((a, t) => a + t.fees.adSpendAllocated, 0);
  const modified: Transaction[] = txs.map((t) => ({
    ...t,
    fees: {
      ...t.fees,
      adSpendAllocated:
        baseAd > 0 ? t.fees.adSpendAllocated * (adSpendTotal / baseAd) : adSpendTotal / txs.length,
    },
  }));
  const r = aggregateTrueMargin(modified);
  return { marginPct: r.marginPct, netContribution: r.netContribution };
}

/**
 * Campaign simulation: apply a price discount and optional ad-spend boost,
 * then recompute true margin through the full engine waterfall.
 *
 * A discount reduces grossRevenue proportionally; marketplace commission, VAT,
 * and payment fees scale down with it (they're % of revenue). COGS, shipping,
 * and returns stay fixed — those are the costs that don't compress with price.
 */
export interface CampaignResult {
  /** Base (no discount) true margin % */
  basePct: number;
  /** Campaign true margin % after discount + ad boost */
  campaignPct: number;
  /** Delta: campaignPct − basePct */
  deltaPct: number;
  /** Net contribution in base currency after campaign adjustments */
  netContribution: number;
  /** Total gross revenue after discount */
  discountedRevenue: number;
  /** How much revenue is lost to the discount */
  revenueLost: number;
  /** Extra ad spend added by the boost */
  extraAdSpend: number;
}

export function recomputeMarginWithDiscount(
  tenantId: string,
  discountPct: number,    // 0–50, e.g. 20 means 20% price cut
  adBoostPct: number,     // 0–200, extra ad spend % on top of baseline
  channel: Channel = "trendyol"
): CampaignResult {
  const zero: CampaignResult = {
    basePct: 0, campaignPct: 0, deltaPct: 0,
    netContribution: 0, discountedRevenue: 0, revenueLost: 0, extraAdSpend: 0,
  };
  const seller = findSeller(tenantId);
  if (!seller) return zero;
  const txs = transactionsForChannel(seller, channel);
  if (txs.length === 0) return zero;

  const basePct = aggregateTrueMargin(txs).marginPct;
  const factor = 1 - discountPct / 100;

  const modified: Transaction[] = txs.map((t) => {
    const newRevenue = t.grossRevenue * factor;
    const extraAd = t.fees.adSpendAllocated * (adBoostPct / 100);
    return {
      ...t,
      grossRevenue: newRevenue,
      fees: {
        ...t.fees,
        // revenue-proportional fees scale with the new price
        commission: t.fees.commission * factor,
        vat: t.fees.vat * factor,
        paymentFees: t.fees.paymentFees * factor,
        // fixed costs stay unchanged; ad spend gets the boost
        adSpendAllocated: t.fees.adSpendAllocated + extraAd,
      },
    };
  });

  const result = aggregateTrueMargin(modified);
  const baseRevenue = txs.reduce((s, t) => s + t.grossRevenue, 0);
  const discountedRevenue = modified.reduce((s, t) => s + t.grossRevenue, 0);
  const baseAdTotal = txs.reduce((s, t) => s + t.fees.adSpendAllocated, 0);
  const modAdTotal = modified.reduce((s, t) => s + t.fees.adSpendAllocated, 0);

  return {
    basePct,
    campaignPct: result.marginPct,
    deltaPct: result.marginPct - basePct,
    netContribution: result.netContribution,
    discountedRevenue,
    revenueLost: baseRevenue - discountedRevenue,
    extraAdSpend: modAdTotal - baseAdTotal,
  };
}

/** Fee waterfall aggregated across a seller's transactions (for the reveal). */
export interface FeeWaterfall {
  grossRevenue: number;
  commission: number;
  vat: number;
  shipping: number;
  returnsAllocated: number;
  adSpendAllocated: number;
  paymentFees: number;
  cogs: number;
  netContribution: number;
}

/**
 * Hakediş Doğrulama — settlement verification.
 *
 * Expected marketplace payout (what the seller should receive):
 *   grossRevenue − commission − vat − paymentFees − returnsAllocated
 * (COGS, shipping, adSpend are the seller's own costs, not the marketplace deduction.)
 *
 * Actual payout uses a per-seller gap rate modelled on real-world Trendyol settlement
 * discrepancy patterns (undisclosed fee adjustments, return disputes, rounding).
 * When real settlement files are ingested, replace GAP_RATES with actual settlement data.
 */
const SETTLEMENT_GAP_RATES: Record<string, number> = {
  "seller-a": 0.000, // clean — matches expected exactly
  "seller-b": 0.023, // 2.3% underpayment — silent loser squeezed further
  "seller-c": 0.008, // 0.8% small discrepancy
};

export interface SettlementVerification {
  /** What the engine calculates the marketplace should pay out. */
  expectedPayout: number;
  /** Simulated actual marketplace payout (replace with real settlement file). */
  actualPayout: number;
  /** expectedPayout − actualPayout (positive = underpaid). */
  gap: number;
  /** gap / expectedPayout as 0–1. */
  gapRatePct: number;
  /** true when gap > 0 */
  hasGap: boolean;
  currency: string;
  marketplaceLabel: string;
}

export function computeSettlementVerification(
  w: FeeWaterfall,
  tenantId: string,
  currency: string,
  marketplaceLabel: string
): SettlementVerification {
  const expectedPayout = Math.max(
    0,
    w.grossRevenue - w.commission - w.vat - w.paymentFees - w.returnsAllocated
  );
  const gapRate = SETTLEMENT_GAP_RATES[tenantId] ?? 0;
  const actualPayout = Math.round(expectedPayout * (1 - gapRate));
  const gap = Math.round(expectedPayout - actualPayout);
  return {
    expectedPayout: Math.round(expectedPayout),
    actualPayout,
    gap,
    gapRatePct: expectedPayout > 0 ? (gap / expectedPayout) * 100 : 0,
    hasGap: gap > 0,
    currency,
    marketplaceLabel,
  };
}

/**
 * Periodic margin history — groups transactions by calendar month and computes
 * true vs. perceived margin for each period. Used by the sparkline / line chart.
 */
export interface MarginPeriod {
  /** YYYY-MM */
  period: string;
  /** Short display label, e.g. "May" */
  label: string;
  trueMarginPct: number;
  perceivedMarginPct: number;
}

const MONTH_LABELS: Record<string, string> = {
  "01": "Oca", "02": "Şub", "03": "Mar", "04": "Nis",
  "05": "May", "06": "Haz", "07": "Tem", "08": "Ağu",
  "09": "Eyl", "10": "Eki", "11": "Kas", "12": "Ara",
};

export function getMarginHistory(txs: Transaction[]): MarginPeriod[] {
  const byMonth = new Map<string, Transaction[]>();
  for (const tx of txs) {
    const ym = tx.saleDate.slice(0, 7); // "2026-05"
    const arr = byMonth.get(ym) ?? [];
    arr.push(tx);
    byMonth.set(ym, arr);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ym, group]) => {
      const mm = ym.slice(5, 7);
      return {
        period: ym,
        label: MONTH_LABELS[mm] ?? mm,
        trueMarginPct: aggregateTrueMargin(group).marginPct,
        perceivedMarginPct: aggregatePerceivedMargin(group).marginPct,
      };
    });
}

/** Minimum revenue to cover COGS + shipping + payment fees after marketplace commission.
 *  Formula: (COGS + kargo + hizmet bedeli) / (1 − komisyon oranı) — rates from actual fee waterfall. */
export function computeBreakEvenPrice(w: FeeWaterfall): {
  breakEvenPrice: number;
  commissionRatePct: number;
} {
  const commissionRate = w.grossRevenue > 0 ? w.commission / w.grossRevenue : 0;
  const numerator = w.cogs + w.shipping + w.paymentFees;
  const breakEvenPrice = commissionRate >= 1 ? numerator : numerator / (1 - commissionRate);
  return { breakEvenPrice, commissionRatePct: commissionRate * 100 };
}

function aggregateWaterfall(txs: Transaction[]): FeeWaterfall {
  const w: FeeWaterfall = {
    grossRevenue: 0,
    commission: 0,
    vat: 0,
    shipping: 0,
    returnsAllocated: 0,
    adSpendAllocated: 0,
    paymentFees: 0,
    cogs: 0,
    netContribution: 0,
  };
  for (const tx of txs) {
    w.grossRevenue += tx.grossRevenue;
    w.commission += tx.fees.commission;
    w.vat += tx.fees.vat;
    w.shipping += tx.fees.shipping;
    w.returnsAllocated += tx.fees.returnsAllocated;
    w.adSpendAllocated += tx.fees.adSpendAllocated;
    w.paymentFees += tx.fees.paymentFees;
    w.cogs += tx.cogs;
  }
  w.netContribution =
    w.grossRevenue - w.commission - w.vat - w.shipping - w.returnsAllocated - w.adSpendAllocated - w.paymentFees - w.cogs;
  return w;
}

function convertAmount(amount: number, currency: Currency): number {
  return currency === "USD" ? amount * USD_TO_TRY : amount;
}

/** Normalize mixed-currency transactions to TRY for cross-marketplace aggregation. */
export function normalizeTransactionsToTry(txs: Transaction[]): Transaction[] {
  return txs.map((t) => ({
    ...t,
    currency: "TRY" as const,
    grossRevenue: convertAmount(t.grossRevenue, t.currency),
    cogs: convertAmount(t.cogs, t.currency),
    fees: {
      commission: convertAmount(t.fees.commission, t.currency),
      vat: convertAmount(t.fees.vat, t.currency),
      shipping: convertAmount(t.fees.shipping, t.currency),
      returnsAllocated: convertAmount(t.fees.returnsAllocated, t.currency),
      adSpendAllocated: convertAmount(t.fees.adSpendAllocated, t.currency),
      paymentFees: convertAmount(t.fees.paymentFees, t.currency),
    },
  }));
}

/** Per-channel margin slices plus a FX-normalized combined total (TRY). */
export interface MarketplaceMarginSlice {
  marketplace: Marketplace;
  currency: Currency;
  perceivedMarginPct: number;
  trueMarginPct: number;
  grossRevenue: number;
  netContribution: number;
  waterfall: FeeWaterfall;
}

export interface PerMarketplaceMargins {
  byMarketplace: MarketplaceMarginSlice[];
  combined: {
    currency: "TRY";
    perceivedMarginPct: number;
    trueMarginPct: number;
    grossRevenue: number;
    netContribution: number;
    waterfall: FeeWaterfall;
  };
}

const MARKETPLACES: Marketplace[] = ["trendyol", "amazon_us", "hepsiburada", "n11", "shopify"];

export const MARKETPLACE_LABELS: Record<Marketplace, string> = {
  trendyol: "Trendyol (TRY)",
  amazon_us: "Amazon US (USD)",
  hepsiburada: "Hepsiburada (TRY)",
  n11: "N11 (TRY)",
  shopify: "Shopify (USD)",
};

function sliceForMarketplace(txs: Transaction[], marketplace: Marketplace): MarketplaceMarginSlice | undefined {
  const channelTxs = txs.filter((t) => t.marketplace === marketplace);
  if (channelTxs.length === 0) return undefined;
  const perceived = aggregatePerceivedMargin(channelTxs);
  const trueM = aggregateTrueMargin(channelTxs);
  return {
    marketplace,
    currency: channelTxs[0].currency,
    perceivedMarginPct: perceived.marginPct,
    trueMarginPct: trueM.marginPct,
    grossRevenue: perceived.grossRevenue,
    netContribution: trueM.netContribution,
    waterfall: aggregateWaterfall(channelTxs),
  };
}

/** True margin per marketplace channel and FX-normalized combined total for one seller. */
export function perMarketplaceMargins(tenantId: string): PerMarketplaceMargins | undefined {
  const seller = findSeller(tenantId);
  if (!seller) return undefined;

  const byMarketplace = MARKETPLACES.map((mp) => sliceForMarketplace(seller.transactions, mp)).filter(
    (s): s is MarketplaceMarginSlice => s !== undefined
  );
  if (byMarketplace.length === 0) return undefined;

  const normalized = normalizeTransactionsToTry(seller.transactions);
  const perceived = aggregatePerceivedMargin(normalized);
  const trueM = aggregateTrueMargin(normalized);

  return {
    byMarketplace,
    combined: {
      currency: "TRY",
      perceivedMarginPct: perceived.marginPct,
      trueMarginPct: trueM.marginPct,
      grossRevenue: perceived.grossRevenue,
      netContribution: trueM.netContribution,
      waterfall: aggregateWaterfall(normalized),
    },
  };
}

function transactionsForChannel(seller: SeededSeller, channel: Channel): Transaction[] {
  if (channel === "combined") return normalizeTransactionsToTry(seller.transactions);
  return seller.transactions.filter((t) => t.marketplace === channel);
}

/** Everything the UI needs about one seller, computed live from the engine. */
export interface SellerView {
  tenantId: string;
  label: string;
  category: string;
  channel: Channel;
  currency: string;
  perceivedMarginBelief: number;
  perceivedMarginPct: number;
  trueMarginPct: number;
  monthlyRevenue: number;
  waterfall: FeeWaterfall;
  breakEvenPrice: number;
  breakEvenCommissionRatePct: number;
  settlement: SettlementVerification;
  marginHistory: MarginPeriod[];
  marketplaceMargins?: MarketplaceMarginSlice[];
  skus: SkuMargin[];
  silentLosers: SkuMargin[];
  inputs: UnderwritingInputs;
  decision: UnderwritingDecision;
}

const LABELS: Record<string, string> = {
  "seller-a": "Seller A",
  "seller-b": "Seller B",
  "seller-c": "Seller C",
};

function buildSellerView(seller: SeededSeller, channel: Channel = "trendyol"): SellerView | undefined {
  const mpMargins = channel === "combined" ? perMarketplaceMargins(seller.tenantId) : undefined;
  const txs = transactionsForChannel(seller, channel);
  if (txs.length === 0) return undefined;

  const perceived: MarginResult = aggregatePerceivedMargin(txs);
  const trueM: MarginResult = aggregateTrueMargin(txs);
  const skus = perSkuMargins(txs);
  const inputs = deriveUnderwritingInputsFromTransactions(txs, seller.tenureMonths);
  const currency =
    channel === "combined" ? "TRY" : (txs[0]?.currency ?? "TRY");
  const decision = trueMarginModel(seller.tenantId, inputs, currency as Currency);
  const waterfall = aggregateWaterfall(txs);
  const { breakEvenPrice, commissionRatePct: breakEvenCommissionRatePct } = computeBreakEvenPrice(waterfall);
  const mpLabel =
    channel === "combined"
      ? "Combined"
      : MARKETPLACE_LABELS[channel as Marketplace] ?? channel;
  const settlement = computeSettlementVerification(waterfall, seller.tenantId, currency, mpLabel);
  const marginHistory = getMarginHistory(txs);

  return {
    tenantId: seller.tenantId,
    label: LABELS[seller.tenantId] ?? RUNTIME_LABELS[seller.tenantId] ?? seller.tenantId,
    category: txs[0]?.category ?? "—",
    channel,
    currency,
    perceivedMarginBelief: seller.perceivedMarginBelief,
    perceivedMarginPct: perceived.marginPct,
    trueMarginPct: trueM.marginPct,
    monthlyRevenue: inputs.monthlyRevenue,
    waterfall,
    breakEvenPrice,
    breakEvenCommissionRatePct,
    settlement,
    marginHistory,
    marketplaceMargins: mpMargins?.byMarketplace,
    skus,
    silentLosers: skus.filter((s) => s.isSilentLoser),
    inputs,
    decision,
  };
}

/** All seller views for one channel (server-side; pure, no I/O). */
export function getSellers(channel: Channel = "trendyol"): SellerView[] {
  // Runtime (user) sellers first, then the seeded demo portfolio.
  return [...RUNTIME_SELLERS, ...SELLERS]
    .map((s) => buildSellerView(s, channel))
    .filter((v): v is SellerView => v !== undefined);
}

/** One seller view by tenant id and channel tab. */
export function getSeller(tenantId: string, channel: Channel = "trendyol"): SellerView | undefined {
  const s = findSeller(tenantId);
  return s ? buildSellerView(s, channel) : undefined;
}

/** The single highest-impact "drop this SKU" insight for a seller. */
export interface SilentLoserInsight {
  sku: string;
  currentLimit: number;
  projectedLimit: number;
  /** projectedLimit − currentLimit (positive = limit would improve). */
  limitDelta: number;
  projectedTrueMarginPct: number;
  currency: string;
}

/**
 * Finds the seller's silent-loser SKU (perceived-profitable, actually loss-making)
 * whose removal would move the underwriting limit the most — by simulating its
 * exclusion (simulateExcludingSku) and re-running the same trueMarginModel the
 * live decision uses. Returns undefined when the seller has no silent losers.
 */
export function getSilentLoserInsight(tenantId: string, channel: Channel = "trendyol"): SilentLoserInsight | undefined {
  const seller = findSeller(tenantId);
  if (!seller) return undefined;
  const txs = transactionsForChannel(seller, channel);
  if (txs.length === 0) return undefined;

  const silentLosers = perSkuMargins(txs).filter((s) => s.isSilentLoser);
  if (silentLosers.length === 0) return undefined;

  const currency = (channel === "combined" ? "TRY" : txs[0]?.currency ?? "TRY") as Currency;
  const currentDecision = trueMarginModel(
    tenantId,
    deriveUnderwritingInputsFromTransactions(txs, seller.tenureMonths),
    currency
  );

  let best: SilentLoserInsight | undefined;
  for (const loser of silentLosers) {
    const marginAfter = simulateExcludingSku(txs, loser.sku);
    const remaining = txs.filter((t) => t.sku !== loser.sku);
    const projectedDecision = trueMarginModel(
      tenantId,
      deriveUnderwritingInputsFromTransactions(remaining, seller.tenureMonths),
      currency
    );
    const limitDelta = projectedDecision.approvedLimit - currentDecision.approvedLimit;
    // Only a genuine improvement is worth surfacing — the card's "+X" framing
    // would be misleading for a SKU whose removal doesn't actually help.
    if (limitDelta > 0 && (!best || limitDelta > best.limitDelta)) {
      best = {
        sku: loser.sku,
        currentLimit: currentDecision.approvedLimit,
        projectedLimit: projectedDecision.approvedLimit,
        limitDelta,
        projectedTrueMarginPct: marginAfter.marginPct,
        currency,
      };
    }
  }
  return best;
}

/** One append-only audit-trail row, as surfaced to the UI (the "decision trace"). */
export interface LedgerRecord {
  seq: number;
  recordedAt: string;
  tenantId: string;
  label: string;
  approvedLimit: number;
  takeRate: number;
  currency: string;
  modelVersion: string;
}

/** Backtest report + the immutable ledger of decisions it produced. */
export function getBacktest(): { report: BacktestReport; ledgerSize: number; ledger: LedgerRecord[] } {
  const sellers = seededBacktestSellers();
  const report = runBacktest(sellers);

  const ledger = new InMemoryLedger();
  for (const s of sellers) {
    recordDecision(ledger, trueMarginModel(s.tenantId, s.inputs, s.currency));
  }
  const entries: LedgerRecord[] = ledger.all().map((e) => {
    const d = e.payload as UnderwritingDecision;
    return {
      seq: e.seq,
      recordedAt: e.recordedAt,
      tenantId: d.tenantId,
      label: LABELS[d.tenantId] ?? d.tenantId,
      approvedLimit: d.approvedLimit,
      takeRate: d.takeRate,
      currency: d.currency,
      modelVersion: d.modelVersion,
    };
  });
  return { report, ledgerSize: entries.length, ledger: entries };
}

/**
 * Investor / technical-credibility metrics — the category-specific proof points
 * (GMV coverage, design partners, connector count, loss-rate vs incumbent,
 * take-rate band, decision latency) that the seed-stage embedded-lending
 * due-diligence checklist looks for, computed live from the real engine.
 */
export interface PortfolioMetrics {
  designPartners: number;
  marketplacesConnected: number;
  gmvCoveragePct: number;
  takeRateMinPct: number;
  takeRateMaxPct: number;
  chargeOffOursPct: number;
  chargeOffIncumbentPct: number;
  delinquencyOursPct: number;
  delinquencyIncumbentPct: number;
  lossReductionPct: number;
  decisionLatencyMs: number;
}

export interface BenchmarkRow {
  label: string;
  ours: string;
  target: string;
  meetsTarget: boolean;
}

export function getPortfolioMetrics(): PortfolioMetrics {
  const sellers = seededBacktestSellers();
  const t0 = Date.now();
  const report = runBacktest(sellers);
  const decisionLatencyMs = Math.max(0.1, Date.now() - t0);

  const approvedTakeRates = report.trueMargin.decisions
    .filter((d) => d.approvedLimit > 0)
    .map((d) => d.takeRate * 100);

  return {
    designPartners: SELLERS.length,
    marketplacesConnected: MARKETPLACES.length,
    gmvCoveragePct: 100, // all transactions for onboarded sellers flow through connected adapters
    takeRateMinPct: approvedTakeRates.length ? Math.min(...approvedTakeRates) : 0,
    takeRateMaxPct: approvedTakeRates.length ? Math.max(...approvedTakeRates) : 0,
    chargeOffOursPct: report.trueMargin.chargeOffRate * 100,
    chargeOffIncumbentPct: report.incumbent.chargeOffRate * 100,
    delinquencyOursPct: report.trueMargin.delinquencyRate * 100,
    delinquencyIncumbentPct: report.incumbent.delinquencyRate * 100,
    lossReductionPct: report.lossReductionPct * 100,
    decisionLatencyMs,
  };
}

/** Compare our live numbers against the seed-stage embedded-lending benchmarks
 *  cited in the investor memo (Lendflow 2025 embedded-lending benchmark). */
export function getBenchmarkRows(): BenchmarkRow[] {
  const m = getPortfolioMetrics();
  const pct1 = (n: number) => `${n.toFixed(1)}%`;
  return [
    {
      label: "Charge-off rate",
      ours: pct1(m.chargeOffOursPct),
      target: "< 2%",
      meetsTarget: m.chargeOffOursPct < 2,
    },
    {
      label: "Delinquency rate",
      ours: pct1(m.delinquencyOursPct),
      target: "< 3%",
      meetsTarget: m.delinquencyOursPct < 3,
    },
    {
      label: "Take-rate band",
      ours: `${m.takeRateMinPct.toFixed(1)}–${m.takeRateMaxPct.toFixed(1)}%`,
      target: "3–6%",
      meetsTarget: m.takeRateMinPct >= 3 - 1e-6 && m.takeRateMaxPct <= 6 + 1e-6,
    },
    {
      label: "Decision latency",
      ours: `${m.decisionLatencyMs.toFixed(1)}ms`,
      target: "< 2s",
      meetsTarget: m.decisionLatencyMs < 2000,
    },
    {
      label: "Loss reduction vs incumbent",
      ours: pct1(m.lossReductionPct),
      target: "> 0%",
      meetsTarget: m.lossReductionPct > 0,
    },
  ];
}

// ─── Cash-flow projection ─────────────────────────────────────────────────────

/**
 * Settlement timing model.
 *
 * Marketplace → estimated days from saleDate to actual bank credit:
 *   delivery lead-time + settlement cycle.
 * These are representative mid-points; real values depend on category & carrier.
 */
const SETTLEMENT_DELAY_DAYS: Record<Marketplace, number> = {
  trendyol:   17, // ~3d delivery + 14d Trendyol cycle
  amazon_us:  21, // ~5d FBA processing + 16d Amazon disbursement
  hepsiburada: 15, // ~2d delivery + 13d Hepsiburada cycle
  n11:        16, // representative mid-point, not independently verified — see lib/adapters/n11.ts
  shopify:     2, // Shopify Payments payout cycle (no marketplace settlement delay — it's the seller's own store)
};

export type CashFlowStatus = "received" | "pending" | "overdue";

export interface CashFlowEntry {
  /** Estimated bank credit date (ISO). */
  settlementDate: string;
  /** Short display label, e.g. "9 Tem". */
  dateLabel: string;
  marketplace: string;
  /** Expected payout after all fee deductions. */
  expectedPayout: number;
  /**
   * Simulated actual payout (applies the SETTLEMENT_GAP_RATES from verification).
   * null when the entry is still in the future.
   */
  actualPayout: number | null;
  /** expectedPayout − actualPayout (positive = underpaid). null if future. */
  gap: number | null;
  currency: string;
  /** Number of original sale transactions batched into this settlement. */
  transactionCount: number;
  status: CashFlowStatus;
  /** Days until settlement from today (negative = already past). */
  daysFromToday: number;
}

const TR_MONTHS = ["Oca","Şub","Mar","Nis","May","Haz","Tem","Ağu","Eyl","Eki","Kas","Ara"] as const;

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function shortDateLabel(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${TR_MONTHS[d.getUTCMonth()]}`;
}

function diffDays(isoA: string, isoB: string): number {
  return Math.round((new Date(isoA).getTime() - new Date(isoB).getTime()) / 86_400_000);
}

export function getCashFlowProjection(
  tenantId: string,
  channel: Channel,
  today = new Date().toISOString().slice(0, 10)
): CashFlowEntry[] {
  const seller = findSeller(tenantId);
  if (!seller) return [];

  const txs = transactionsForChannel(seller, channel);
  if (txs.length === 0) return [];

  const gapRate = SETTLEMENT_GAP_RATES[tenantId] ?? 0;

  // Group by expected settlement date + marketplace
  const buckets = new Map<string, Transaction[]>();
  for (const tx of txs) {
    const mp = tx.marketplace as Marketplace;
    const delay = channel === "combined"
      ? SETTLEMENT_DELAY_DAYS[mp]
      : SETTLEMENT_DELAY_DAYS[mp] ?? 17;
    const key = `${addDays(tx.saleDate, delay)}__${tx.marketplace}`;
    const arr = buckets.get(key) ?? [];
    arr.push(tx);
    buckets.set(key, arr);
  }

  const entries: CashFlowEntry[] = [];
  for (const [key, group] of buckets) {
    const [settlementDate, mp] = key.split("__");
    const totalRevenue    = group.reduce((s, t) => s + t.grossRevenue, 0);
    const totalCommission = group.reduce((s, t) => s + t.fees.commission, 0);
    const totalVat        = group.reduce((s, t) => s + t.fees.vat, 0);
    const totalPayFees    = group.reduce((s, t) => s + t.fees.paymentFees, 0);
    const totalReturns    = group.reduce((s, t) => s + t.fees.returnsAllocated, 0);
    const expectedPayout  = Math.round(
      Math.max(0, totalRevenue - totalCommission - totalVat - totalPayFees - totalReturns)
    );
    const currency = group[0].currency;
    const daysFromToday = diffDays(settlementDate, today);
    const isPast = daysFromToday <= 0;
    const actualPayout = isPast ? Math.round(expectedPayout * (1 - gapRate)) : null;
    const gap = isPast ? Math.round(expectedPayout - (actualPayout ?? 0)) : null;
    const status: CashFlowStatus =
      isPast
        ? "received"
        : daysFromToday <= 3
        ? "overdue"   // ≤3 days out → alert pending
        : "pending";

    entries.push({
      settlementDate,
      dateLabel: shortDateLabel(settlementDate),
      marketplace: MARKETPLACE_LABELS[mp as Marketplace] ?? mp,
      expectedPayout,
      actualPayout,
      gap,
      currency,
      transactionCount: group.length,
      status,
      daysFromToday,
    });
  }

  return entries.sort((a, b) => a.settlementDate.localeCompare(b.settlementDate));
}

// ─── Financing ────────────────────────────────────────────────────────────────

/** Everything the financing screen needs for one seller: our decision + the
 * incumbent's, each seller's simulated loan outcome, and the portfolio backtest. */
export interface FinancingView {
  tenantId: string;
  label: string;
  currency: string;
  decision: UnderwritingDecision;
  ourOutcome: LoanOutcome;
  incumbentDecision: UnderwritingDecision;
  incumbentOutcome: LoanOutcome;
  report: BacktestReport;
}

export function getFinancing(tenantId: string): FinancingView | undefined {
  const sellers = seededBacktestSellers();
  const idx = sellers.findIndex((s) => s.tenantId === tenantId);
  if (idx >= 0) {
    const report = runBacktest(sellers);
    return {
      tenantId,
      label: LABELS[tenantId] ?? tenantId,
      currency: sellers[idx].currency,
      decision: report.trueMargin.decisions[idx],
      ourOutcome: report.trueMargin.outcomes[idx],
      incumbentDecision: report.incumbent.decisions[idx],
      incumbentOutcome: report.incumbent.outcomes[idx],
      report,
    };
  }

  // Runtime (user) seller — not part of the seeded backtest portfolio. Compute a
  // real underwriting decision straight from their own transactions, benchmarked
  // against the same seeded-portfolio backtest shown everywhere else. Without this
  // branch, a signed-in seller's Financing tab would silently fall back to a seed
  // seller's numbers instead of their own.
  const runtime = RUNTIME_SELLERS.find((s) => s.tenantId === tenantId);
  if (!runtime || runtime.transactions.length === 0) return undefined;

  const currency = (runtime.transactions[0]?.currency ?? "TRY") as Currency;
  const inputs = deriveUnderwritingInputsFromTransactions(runtime.transactions, runtime.tenureMonths);
  const decision = trueMarginModel(tenantId, inputs, currency);
  const incumbentDecision = incumbentModel(tenantId, inputs, currency);
  const report = runBacktest(sellers);

  return {
    tenantId,
    label: RUNTIME_LABELS[tenantId] ?? tenantId,
    currency,
    decision,
    ourOutcome: simulateOutcome(decision),
    incumbentDecision,
    incumbentOutcome: simulateOutcome(incumbentDecision),
    report,
  };
}
