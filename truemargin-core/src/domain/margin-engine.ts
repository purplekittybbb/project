/**
 * Margin engine — the fee waterfall.
 *
 * The core reveal: a seller's PERCEIVED margin (what they think they make, usually
 * revenue - COGS - commission only) vs their TRUE contribution margin (revenue minus
 * the full fee waterfall). The gap between the two is the product's entire thesis.
 */

import type { Transaction } from "./canonical.js";

export interface MarginResult {
  grossRevenue: number;
  totalFees: number;
  cogs: number;
  netContribution: number;
  marginPct: number; // netContribution / grossRevenue * 100
}

function pct(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : (numerator / denominator) * 100;
}

/** Sum of the full fee waterfall for one transaction. */
export function totalFees(tx: Transaction): number {
  const f = tx.fees;
  return (
    f.commission +
    f.vat +
    f.shipping +
    f.returnsAllocated +
    f.adSpendAllocated +
    f.paymentFees
  );
}

/** TRUE contribution margin: revenue minus the full waterfall minus COGS. */
export function computeTrueMargin(tx: Transaction): MarginResult {
  const fees = totalFees(tx);
  const netContribution = tx.grossRevenue - fees - tx.cogs;
  return {
    grossRevenue: tx.grossRevenue,
    totalFees: fees,
    cogs: tx.cogs,
    netContribution,
    marginPct: pct(netContribution, tx.grossRevenue),
  };
}

/**
 * PERCEIVED margin: the naive mental model most sellers run in their head —
 * they subtract COGS and the headline commission, and ignore VAT, shipping,
 * returns and (critically) allocated ad spend.
 */
export function computePerceivedMargin(tx: Transaction): MarginResult {
  const fees = tx.fees.commission;
  const netContribution = tx.grossRevenue - fees - tx.cogs;
  return {
    grossRevenue: tx.grossRevenue,
    totalFees: fees,
    cogs: tx.cogs,
    netContribution,
    marginPct: pct(netContribution, tx.grossRevenue),
  };
}

function aggregate(txs: Transaction[], perTx: (t: Transaction) => MarginResult): MarginResult {
  const acc = txs.reduce(
    (a, tx) => {
      const r = perTx(tx);
      a.grossRevenue += r.grossRevenue;
      a.totalFees += r.totalFees;
      a.cogs += r.cogs;
      a.netContribution += r.netContribution;
      return a;
    },
    { grossRevenue: 0, totalFees: 0, cogs: 0, netContribution: 0, marginPct: 0 }
  );
  acc.marginPct = pct(acc.netContribution, acc.grossRevenue);
  return acc;
}

/** Roll a set of transactions up into a single true-margin result. */
export function aggregateTrueMargin(txs: Transaction[]): MarginResult {
  return aggregate(txs, computeTrueMargin);
}

/** Roll a set of transactions up into a single perceived-margin result. */
export function aggregatePerceivedMargin(txs: Transaction[]): MarginResult {
  return aggregate(txs, computePerceivedMargin);
}

/** Per-SKU view: which SKUs look profitable (perceived) but are loss-making (true). */
export interface SkuMargin {
  sku: string;
  category: string;
  perceivedMarginPct: number;
  trueMarginPct: number;
  gapPct: number; // perceived - true
  isSilentLoser: boolean; // looks fine perceived, negative true
}

export function perSkuMargins(txs: Transaction[]): SkuMargin[] {
  const bySku = new Map<string, Transaction[]>();
  for (const tx of txs) {
    const arr = bySku.get(tx.sku) ?? [];
    arr.push(tx);
    bySku.set(tx.sku, arr);
  }
  const out: SkuMargin[] = [];
  for (const [sku, group] of bySku) {
    const perceived = aggregatePerceivedMargin(group).marginPct;
    const trueM = aggregateTrueMargin(group).marginPct;
    out.push({
      sku,
      category: group[0].category,
      perceivedMarginPct: perceived,
      trueMarginPct: trueM,
      gapPct: perceived - trueM,
      isSilentLoser: perceived > 0 && trueM < 0,
    });
  }
  return out.sort((a, b) => b.gapPct - a.gapPct);
}
