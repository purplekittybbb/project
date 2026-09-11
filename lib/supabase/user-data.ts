/**
 * Per-user data persistence (Supabase).
 *
 * A signed-in user's uploaded/entered sales rows live in the `user_transactions`
 * table. Row-Level Security (see supabase/migrations/0001_user_transactions.sql)
 * guarantees every query is scoped to auth.uid() — a user can only ever read or
 * write their own rows, enforced by Postgres.
 *
 * On read, raw rows are run through the TrendyolAdapter to produce canonical
 * Transactions, then wrapped as a SeededSeller so the whole engine (margin, SKUs,
 * cash-flow, campaign, break-even) works on the user's real data unchanged.
 */

import { getSupabaseClient } from "./client";
import { TrendyolAdapter, type RawTrendyolRow } from "../adapters/trendyol";
import { AmazonUsAdapter, type RawAmazonUsRow } from "../adapters/amazon-us";
import { AmazonTrAdapter, type RawAmazonTrRow } from "../adapters/amazon-tr";
import { HepsiburadaAdapter, type RawHepsiburadaRow } from "../adapters/hepsiburada";
import { N11Adapter, type RawN11Row } from "../adapters/n11";
import { ShopifyAdapter, type RawShopifyRow } from "../adapters/shopify";
import { aggregatePerceivedMargin, type SeededSeller } from "../engine";
import type { Transaction } from "../domain/canonical";
import { validateTransactions } from "../domain/schemas";
import type { UserRawRow } from "../adapters/csv";
import { localeForMarketplace } from "../domain/locale";
import { enrichRowWithProductCost } from "../calc/enrich";
import { loadProductCosts } from "./product-costs";

const TABLE = "user_transactions";

/** Stable tenant id for the signed-in user's own dataset (one per session). */
export const USER_TENANT_ID = "user-data";

const trendyol = new TrendyolAdapter();
const amazonUs = new AmazonUsAdapter();
const amazonTr = new AmazonTrAdapter();
const hepsiburada = new HepsiburadaAdapter();
const n11 = new N11Adapter();
const shopify = new ShopifyAdapter();

export interface StoredRow extends UserRawRow {
  id: string;
}

/** DB column shape → UserRawRow. Includes columns added in migration 0012. */
type DbRow = {
  id: string;
  order_id: string;
  sku: string;
  category: string;
  sale_date: string;
  units: number;
  gross_revenue: number;
  unit_cost: number;
  shipping: number;
  return_rate: number;
  ad_spend: number;
  marketplace: string;
  // 0012 columns (default 0 / 'TRY' / 'TR' on existing rows):
  packaging?: number;
  product_name?: string | null;
  barcode?: string | null;
};

function toStored(r: DbRow): StoredRow {
  return {
    id: r.id,
    order_id: r.order_id,
    sku: r.sku,
    category: r.category,
    sale_date: (r.sale_date ?? "").slice(0, 10),
    units: Number(r.units),
    gross_revenue: Number(r.gross_revenue),
    unit_cost: Number(r.unit_cost),
    shipping: Number(r.shipping),
    return_rate: Number(r.return_rate),
    ad_spend: Number(r.ad_spend),
    packaging: Number(r.packaging ?? 0),
    marketplace: r.marketplace ?? "trendyol",
    product_name: r.product_name ?? undefined,
    barcode: r.barcode ?? undefined,
  };
}

async function currentUserId(): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/** Load the signed-in user's rows (RLS scopes to their own).
 *
 * Rows are enriched with the seller's per-SKU cost profile (see
 * lib/calc/enrich.ts + product_costs, migration 0015): a live marketplace sync
 * stores COGS/shipping/return/ad/packaging as 0, and this fills those gaps from
 * the stored profile WITHOUT overwriting values a CSV/manual entry provided.
 * Enrichment soft-fails to a no-op until the 0015 migration is applied. */
export async function loadUserRows(): Promise<StoredRow[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .order("sale_date", { ascending: true });
  if (error || !data) return [];

  const stored = (data as DbRow[]).map(toStored);
  const costs = await loadProductCosts(); // empty map (no-op) until 0015 lands
  if (costs.size === 0) return stored;
  return stored.map((r) => ({ ...enrichRowWithProductCost(r, costs.get(r.sku)), id: r.id }));
}

/** Insert new rows for the signed-in user. Returns an error message or null. */
export async function saveUserRows(rows: UserRawRow[]): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: "Supabase is not configured." };
  const userId = await currentUserId();
  if (!userId) return { error: "No active session." };

  const payload = rows.map((r) => ({
    user_id: userId,
    order_id: r.order_id,
    sku: r.sku,
    category: r.category,
    sale_date: r.sale_date,
    units: r.units,
    gross_revenue: r.gross_revenue,
    unit_cost: r.unit_cost,
    shipping: r.shipping,
    return_rate: r.return_rate,
    ad_spend: r.ad_spend,
    packaging: r.packaging ?? 0,
    // 0012: locale columns — derived from marketplace (adapters set these at
    // run-time; storing them here lets future per-row queries filter by currency).
    currency: localeForMarketplace(r.marketplace).currency,
    country_code: localeForMarketplace(r.marketplace).countryCode,
    marketplace: r.marketplace,
    product_name: r.product_name ?? null,  // 0022: human-readable title for search
    barcode: r.barcode ?? null,            // 0020: EAN/GTIN for cross-marketplace match
  }));

  const { error } = await supabase.from(TABLE).insert(payload);
  return { error: error ? error.message : null };
}

/** Delete a single row by id (RLS ensures it must be the user's own). */
export async function deleteUserRow(id: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: "Supabase is not configured." };
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  return { error: error ? error.message : null };
}

/** Delete all of the signed-in user's rows. */
export async function clearUserRows(): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: "Supabase is not configured." };
  const userId = await currentUserId();
  if (!userId) return { error: "No active session." };
  const { error } = await supabase.from(TABLE).delete().eq("user_id", userId);
  return { error: error ? error.message : null };
}

/**
 * Route rows to the adapter matching their real marketplace, so a user's Trendyol,
 * Amazon US and Hepsiburada rows each get their own fee model AND keep their real
 * `marketplace` tag on the canonical Transaction — this is what lets the dashboard
 * show one tab per connected source plus a correctly combined total. Any
 * marketplace without a dedicated adapter yet (no live engineChannel — see
 * lib/marketplaces.ts) is computed with the Trendyol fee model as a reasonable
 * estimate; it never crashes, it's just not marketplace-specific yet.
 *
 * Exported so server-side callers (e.g. resyncMarketplace post-sync insight
 * recording) can convert raw rows to canonical Transactions without loading
 * them from the DB.
 */
export function toCanonicalForMarketplace(tenantId: string, marketplaceId: string, rows: UserRawRow[]): Transaction[] {
  if (marketplaceId === "amazon_us") {
    const raw: RawAmazonUsRow[] = rows.map((r) => ({
      orderId: r.order_id,
      sku: r.sku,
      category: r.category,
      saleDate: r.sale_date,
      units: r.units,
      grossRevenue: r.gross_revenue,
      unitCost: r.unit_cost,
      fbaFee: r.shipping,
      returnRate: r.return_rate,
      adSpend: r.ad_spend,
      packaging: r.packaging,
    }));
    return amazonUs.toCanonical(tenantId, raw);
  }

  if (marketplaceId === "amazon_tr") {
    const raw: RawAmazonTrRow[] = rows.map((r) => ({
      orderId: r.order_id,
      sku: r.sku,
      category: r.category,
      saleDate: r.sale_date,
      units: r.units,
      grossRevenue: r.gross_revenue,
      unitCost: r.unit_cost,
      fbaFee: r.shipping,
      returnRate: r.return_rate,
      adSpend: r.ad_spend,
      packaging: r.packaging,
    }));
    return amazonTr.toCanonical(tenantId, raw);
  }

  if (marketplaceId === "hepsiburada") {
    const raw: RawHepsiburadaRow[] = rows.map((r) => ({
      orderId: r.order_id,
      sku: r.sku,
      category: r.category,
      saleDate: r.sale_date,
      units: r.units,
      grossRevenue: r.gross_revenue,
      unitCost: r.unit_cost,
      shipping: r.shipping,
      returnRate: r.return_rate,
      adSpend: r.ad_spend,
      packaging: r.packaging,
    }));
    return hepsiburada.toCanonical(tenantId, raw);
  }

  if (marketplaceId === "n11") {
    const raw: RawN11Row[] = rows.map((r) => ({
      orderId: r.order_id,
      sku: r.sku,
      category: r.category,
      saleDate: r.sale_date,
      units: r.units,
      grossRevenue: r.gross_revenue,
      unitCost: r.unit_cost,
      shipping: r.shipping,
      returnRate: r.return_rate,
      adSpend: r.ad_spend,
      packaging: r.packaging,
    }));
    return n11.toCanonical(tenantId, raw);
  }

  if (marketplaceId === "shopify") {
    const raw: RawShopifyRow[] = rows.map((r) => ({
      orderId: r.order_id,
      sku: r.sku,
      category: r.category,
      saleDate: r.sale_date,
      units: r.units,
      grossRevenue: r.gross_revenue,
      unitCost: r.unit_cost,
      shipping: r.shipping,
      returnRate: r.return_rate,
      adSpend: r.ad_spend,
      packaging: r.packaging,
    }));
    return shopify.toCanonical(tenantId, raw);
  }

  // trendyol, and anything else without a dedicated adapter yet.
  const raw: RawTrendyolRow[] = rows.map((r) => ({
    orderId: r.order_id,
    sku: r.sku,
    category: r.category,
    saleDate: r.sale_date,
    units: r.units,
    grossRevenue: r.gross_revenue,
    unitCost: r.unit_cost,
    shipping: r.shipping,
    returnRate: r.return_rate,
    adSpend: r.ad_spend,
    packaging: r.packaging,
  }));
  return trendyol.toCanonical(tenantId, raw);
}

/** Convert stored raw rows into a SeededSeller the engine can consume. */
export function buildUserSeller(rows: UserRawRow[], tenantId = USER_TENANT_ID): SeededSeller | null {
  if (rows.length === 0) return null;

  const byMarketplace = new Map<string, UserRawRow[]>();
  for (const r of rows) {
    const mp = r.marketplace || "trendyol";
    const group = byMarketplace.get(mp) ?? [];
    group.push(r);
    byMarketplace.set(mp, group);
  }

  const rawTransactions: Transaction[] = [];
  for (const [marketplaceId, group] of byMarketplace) {
    rawTransactions.push(...toCanonicalForMarketplace(tenantId, marketplaceId, group));
  }

  // Defense-in-depth: the raw rows were already validated at entry (see
  // lib/domain/schemas.ts UserRawRowSchema), so this should essentially never
  // drop anything — it only guards against a malformed adapter output ever
  // reaching the engine.
  const { valid: transactions, droppedCount } = validateTransactions(rawTransactions);
  if (droppedCount > 0) {
    console.warn(`buildUserSeller: dropped ${droppedCount} transaction(s) failing schema validation`);
  }

  // The seller's "believed" margin is their perceived (pre-hidden-cost) margin —
  // computed from their own data, never invented.
  const perceivedMarginBelief = Math.round(aggregatePerceivedMargin(transactions).marginPct);

  return {
    tenantId,
    perceivedMarginBelief,
    tenureMonths: 12,
    transactions,
  };
}
