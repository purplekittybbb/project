/**
 * UI ↔ engine bridge.
 *
 * The domain core in /src is the tested, un-touched artifact. The UI never reaches
 * into it directly and never rewrites it — it imports through this single module,
 * which re-exports the pure functions and exposes a few view-shaped getters built
 * ON TOP of the engine. If the engine's public API changes, this is the only file
 * the UI depends on.
 */

import { SELLERS, deriveUnderwritingInputs, seededBacktestSellers, type SeededSeller } from "../src/data/seed.js";
import {
  aggregatePerceivedMargin,
  aggregateTrueMargin,
  perSkuMargins,
  type MarginResult,
  type SkuMargin,
} from "../src/domain/margin-engine.js";
import { trueMarginModel } from "../src/domain/underwriting.js";
import { runBacktest, type BacktestReport } from "../src/domain/backtest.js";
import { InMemoryLedger, recordDecision } from "../src/domain/ledger.js";
import type { Transaction, UnderwritingDecision, UnderwritingInputs } from "../src/domain/canonical.js";

export type { MarginResult, SkuMargin, BacktestReport };
export type { Transaction, UnderwritingDecision, UnderwritingInputs, SeededSeller };

export { SELLERS, aggregatePerceivedMargin, aggregateTrueMargin, perSkuMargins };

/** The waterfall of fees, aggregated across a seller's transactions (for the reveal). */
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

/** Everything the UI needs about one seller, computed live from the engine. */
export interface SellerView {
  tenantId: string;
  label: string; // "Satıcı A" — anonymised
  category: string;
  currency: string;
  perceivedMarginBelief: number;
  perceivedMarginPct: number; // engine's perceived (revenue − cogs − commission)
  trueMarginPct: number; // full waterfall
  monthlyRevenue: number;
  waterfall: FeeWaterfall;
  skus: SkuMargin[];
  silentLosers: SkuMargin[];
  inputs: UnderwritingInputs;
  decision: UnderwritingDecision;
}

const LABELS: Record<string, string> = {
  "seller-a": "Satıcı A",
  "seller-b": "Satıcı B",
  "seller-c": "Satıcı C",
};

function buildSellerView(seller: SeededSeller): SellerView {
  const perceived: MarginResult = aggregatePerceivedMargin(seller.transactions);
  const trueM: MarginResult = aggregateTrueMargin(seller.transactions);
  const skus = perSkuMargins(seller.transactions);
  const inputs = deriveUnderwritingInputs(seller);
  const currency = seller.transactions[0]?.currency ?? "TRY";
  const decision = trueMarginModel(seller.tenantId, inputs, currency);

  return {
    tenantId: seller.tenantId,
    label: LABELS[seller.tenantId] ?? seller.tenantId,
    category: seller.transactions[0]?.category ?? "—",
    currency,
    perceivedMarginBelief: seller.perceivedMarginBelief,
    perceivedMarginPct: perceived.marginPct,
    trueMarginPct: trueM.marginPct,
    monthlyRevenue: inputs.monthlyRevenue,
    waterfall: aggregateWaterfall(seller.transactions),
    skus,
    silentLosers: skus.filter((s) => s.isSilentLoser),
    inputs,
    decision,
  };
}

/** All seller views (server-side; pure, no I/O). */
export function getSellers(): SellerView[] {
  return SELLERS.map(buildSellerView);
}

/** One seller view by tenant id. */
export function getSeller(tenantId: string): SellerView | undefined {
  const s = SELLERS.find((x) => x.tenantId === tenantId);
  return s ? buildSellerView(s) : undefined;
}

/** Backtest report + the immutable ledger of decisions it produced. */
export function getBacktest(): { report: BacktestReport; ledgerSize: number } {
  const sellers = seededBacktestSellers();
  const report = runBacktest(sellers);

  const ledger = new InMemoryLedger();
  for (const s of sellers) {
    recordDecision(ledger, trueMarginModel(s.tenantId, s.inputs, s.currency));
  }
  return { report, ledgerSize: ledger.all().length };
}
