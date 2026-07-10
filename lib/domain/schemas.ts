/**
 * Runtime validation for the canonical domain model (see ./canonical.ts) and
 * for the pre-canonical raw row (see ../adapters/csv.ts) that CSV import and
 * manual entry both produce before an adapter turns it into a Transaction.
 *
 * TypeScript only checks shapes at compile time — a CSV upload or a form
 * submission can still put a NaN, a negative number, or a malformed date into
 * a value TypeScript already believes is a valid `number`/`string`. These
 * schemas catch that at the boundary, before it reaches the engine.
 */

import { z } from "zod";
import type {
  Currency, FeeBreakdown, Marketplace, Settlement, Transaction,
  UnderwritingDecision, UnderwritingInputs,
} from "./canonical";
import type { UserRawRow } from "../adapters/csv";

// ─── canonical domain schemas — mirror canonical.ts field-for-field ───────────

export const MarketplaceSchema = z.enum(["trendyol", "amazon_us", "hepsiburada"]) satisfies z.ZodType<Marketplace>;
export const CurrencySchema = z.enum(["TRY", "USD"]) satisfies z.ZodType<Currency>;

export const FeeBreakdownSchema = z.object({
  commission: z.number().finite(),
  vat: z.number().finite(),
  shipping: z.number().finite(),
  returnsAllocated: z.number().finite(),
  adSpendAllocated: z.number().finite(),
  paymentFees: z.number().finite(),
}) satisfies z.ZodType<FeeBreakdown>;

export const TransactionSchema = z.object({
  tenantId: z.string().min(1),
  marketplace: MarketplaceSchema,
  orderId: z.string(),
  sku: z.string().min(1),
  category: z.string(),
  saleDate: z.string(),
  currency: CurrencySchema,
  units: z.number().finite(),
  grossRevenue: z.number().finite(),
  cogs: z.number().finite(),
  fees: FeeBreakdownSchema,
}) satisfies z.ZodType<Transaction>;

export const SettlementSchema = z.object({
  tenantId: z.string().min(1),
  marketplace: MarketplaceSchema,
  periodStart: z.string(),
  periodEnd: z.string(),
  currency: CurrencySchema,
  grossSales: z.number().finite(),
  totalDeductions: z.number().finite(),
  netPayout: z.number().finite(),
}) satisfies z.ZodType<Settlement>;

export const UnderwritingInputsSchema = z.object({
  trueMarginPct: z.number().finite(),
  trailingMonthlyContribution: z.number().finite(),
  monthlyRevenue: z.number().finite(),
  revenueVolatility: z.number().finite(),
  stockVelocity: z.number().finite(),
  returnRate: z.number().finite(),
  tenureMonths: z.number().finite(),
}) satisfies z.ZodType<UnderwritingInputs>;

export const UnderwritingDecisionSchema = z.object({
  tenantId: z.string().min(1),
  timestamp: z.string(),
  modelVersion: z.string(),
  inputs: UnderwritingInputsSchema,
  approvedLimit: z.number().finite(),
  takeRate: z.number().finite(),
  rationale: z.array(z.string()),
  currency: CurrencySchema,
}) satisfies z.ZodType<UnderwritingDecision>;

// ─── pre-canonical raw row — mirrors UserRawRow (lib/adapters/csv.ts) ─────────
// This is the shape CSV parsing and the manual-entry form both produce, before
// a marketplace adapter turns it into a Transaction. Validating here catches a
// bad value at the point of entry — with a message pointing at the actual
// field — instead of letting it flow silently into the engine.

export const UserRawRowSchema = z.object({
  order_id: z.string(),
  sku: z.string().min(1, "SKU boş olamaz."),
  category: z.string(),
  sale_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih YYYY-AA-GG biçiminde olmalı."),
  units: z.number().int("Adet tam sayı olmalı.").positive("Adet 0'dan büyük olmalı."),
  gross_revenue: z.number().positive("Brüt gelir 0'dan büyük olmalı."),
  unit_cost: z.number().nonnegative("Birim maliyet negatif olamaz."),
  shipping: z.number().nonnegative("Kargo tutarı negatif olamaz."),
  return_rate: z.number().min(0, "İade oranı negatif olamaz.").max(1, "İade oranı %100'ü (1.0) geçemez."),
  ad_spend: z.number().nonnegative("Reklam harcaması negatif olamaz."),
  marketplace: z.string().min(1),
}) satisfies z.ZodType<UserRawRow>;

// ─── friendly error formatting (PDF rule: no blaming language) ────────────────

const FIELD_LABELS_TR: Record<string, string> = {
  order_id: "Sipariş No", sku: "SKU", category: "Kategori", sale_date: "Tarih",
  units: "Adet", gross_revenue: "Brüt Gelir", unit_cost: "Birim Maliyet",
  shipping: "Kargo", return_rate: "İade Oranı", ad_spend: "Reklam", marketplace: "Pazar Yeri",
};

/** The first validation issue, formatted as a gentle, field-specific message. */
export function firstFriendlyIssue(error: z.ZodError): { field: string; message: string } {
  const issue = error.issues[0];
  const field = String(issue.path[0] ?? "");
  const label = FIELD_LABELS_TR[field] ?? field;
  return { field, message: `${label}: ${issue.message}` };
}

/** Validate one raw row. On failure, returns a gentle field-level message — never throws. */
export function validateUserRawRow(
  row: UserRawRow,
): { ok: true; data: UserRawRow } | { ok: false; field: string; message: string } {
  const res = UserRawRowSchema.safeParse(row);
  if (res.success) return { ok: true, data: res.data };
  const { field, message } = firstFriendlyIssue(res.error);
  return { ok: false, field, message };
}

/**
 * Validate a batch of raw rows (e.g. a parsed CSV). Valid rows pass through;
 * invalid ones are dropped and reported as a warning, so one bad line doesn't
 * block the rest of an otherwise-good import.
 */
export function validateUserRawRows(rows: UserRawRow[]): { valid: UserRawRow[]; warnings: string[] } {
  const valid: UserRawRow[] = [];
  const warnings: string[] = [];
  rows.forEach((row, i) => {
    const res = validateUserRawRow(row);
    if (res.ok) {
      valid.push(res.data);
    } else {
      warnings.push(`Satır ${i + 1} (${row.sku || "?"}) atlandı — ${res.message}`);
    }
  });
  return { valid, warnings };
}

/**
 * Defense-in-depth check on already-canonicalized Transactions (post-adapter).
 * Should essentially never drop anything for real data — adapters always
 * produce valid shapes — but guards the engine from ever seeing a malformed
 * record instead of crashing on it downstream.
 */
export function validateTransactions(txs: Transaction[]): { valid: Transaction[]; droppedCount: number } {
  const valid: Transaction[] = [];
  let droppedCount = 0;
  for (const tx of txs) {
    const res = TransactionSchema.safeParse(tx);
    if (res.success) valid.push(res.data);
    else droppedCount++;
  }
  return { valid, droppedCount };
}
