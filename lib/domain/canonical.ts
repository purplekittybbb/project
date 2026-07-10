/**
 * Canonical data model.
 *
 * Every marketplace (Trendyol, Amazon US, and any future one) is mapped into
 * these types by an adapter. The rest of the system only ever sees canonical
 * data — this is the single abstraction that lets us add a new country/marketplace
 * without touching the margin engine, underwriting, or backtest.
 */

export type Marketplace = "trendyol" | "amazon_us" | "hepsiburada" | "n11" | "shopify";
export type Currency = "TRY" | "USD";

/** Fully broken-out fee waterfall for a single line of sales. */
export interface FeeBreakdown {
  /** Marketplace commission (category-based). */
  commission: number;
  /** VAT / KDV attributable to the sale. */
  vat: number;
  /** Shipping / fulfilment cost borne by the seller. */
  shipping: number;
  /** Cost of returns, allocated to this line (return_rate x unit economics). */
  returnsAllocated: number;
  /** Advertising spend allocated to this SKU — the hard cross-source join. */
  adSpendAllocated: number;
  /** Payment / settlement processing fees. */
  paymentFees: number;
}

/** A canonical sales record for one SKU within one order. */
export interface Transaction {
  tenantId: string; // seller = tenant (multi-tenant, day 1)
  marketplace: Marketplace;
  orderId: string;
  sku: string;
  category: string;
  saleDate: string; // ISO 8601
  currency: Currency; // multi-currency, day 1
  units: number;
  grossRevenue: number;
  cogs: number; // unit cost x units
  fees: FeeBreakdown;
}

/** Marketplace payout record (what actually hit the bank). */
export interface Settlement {
  tenantId: string;
  marketplace: Marketplace;
  periodStart: string;
  periodEnd: string;
  currency: Currency;
  grossSales: number;
  totalDeductions: number;
  netPayout: number;
}

/** Structured inputs to the underwriting model (a decision-trace snapshot). */
export interface UnderwritingInputs {
  trueMarginPct: number; // real contribution margin %
  trailingMonthlyContribution: number; // absolute contribution profit / month
  monthlyRevenue: number;
  revenueVolatility: number; // coefficient of variation of monthly revenue
  stockVelocity: number; // units sold / month (turnover proxy)
  returnRate: number; // 0..1
  tenureMonths: number;
}

/**
 * Immutable underwriting decision = the "decision trace".
 * This is the defensible, un-copyable artifact: the record of a real decision
 * on real margin data, with the exact inputs that produced it.
 */
export interface UnderwritingDecision {
  tenantId: string;
  timestamp: string;
  modelVersion: string;
  inputs: UnderwritingInputs;
  approvedLimit: number;
  takeRate: number; // annualised, 0..1
  rationale: string[]; // human-readable, explainable (EU AI Act)
  currency: Currency;
}
