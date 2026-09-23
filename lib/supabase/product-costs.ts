/**
 * Per-SKU cost profile persistence (Supabase table `product_costs`, migration
 * 0015 — see enrichment rationale in lib/calc/enrich.ts).
 *
 * Soft-fails only when the table/column is genuinely missing (migration not
 * applied). Real RLS/network errors surface via loadProductCostsWithStatus so
 * callers do not treat "query failed" as "seller has no costs" (inflated margins).
 */

import { getSupabaseClient } from "./client";
import type { ProductCost } from "../calc/enrich";

const TABLE = "product_costs";

type ProductCostRow = {
  marketplace: string;
  sku: string;
  unit_cost: number;
  shipping_per_unit: number;
  return_rate: number;
  ad_spend_per_unit: number;
  packaging_per_unit: number;
  commission_rate?: number; // migration 0037; may be absent on older rows
};

export type LoadProductCostsResult = {
  costs: Map<string, ProductCost>;
  /** Null when OK or when the table is known-missing (soft no-op). */
  error: string | null;
};

function isMissingRelationError(message: string): boolean {
  return /does not exist|schema cache|could not find the table/i.test(message);
}

function rowsToMap(data: ProductCostRow[]): Map<string, ProductCost> {
  const map = new Map<string, ProductCost>();
  for (const r of data) {
    map.set(r.sku, {
      unitCost: Number(r.unit_cost),
      shippingPerUnit: Number(r.shipping_per_unit),
      returnRate: Number(r.return_rate),
      adSpendPerUnit: Number(r.ad_spend_per_unit),
      packagingPerUnit: Number(r.packaging_per_unit),
      commissionRate: r.commission_rate != null ? Number(r.commission_rate) : undefined,
    });
  }
  return map;
}

/**
 * Load cost profiles with explicit error so enrichment can refuse to silently
 * inflate margins on a failed read.
 */
export async function loadProductCostsWithStatus(): Promise<LoadProductCostsResult> {
  const empty = new Map<string, ProductCost>();
  const supabase = getSupabaseClient();
  if (!supabase) return { costs: empty, error: null };

  const withCommission = await supabase
    .from(TABLE)
    .select(
      "marketplace, sku, unit_cost, shipping_per_unit, return_rate, ad_spend_per_unit, packaging_per_unit, commission_rate",
    );

  let data: ProductCostRow[] | null = null;
  if (withCommission.error) {
    const legacy = await supabase
      .from(TABLE)
      .select(
        "marketplace, sku, unit_cost, shipping_per_unit, return_rate, ad_spend_per_unit, packaging_per_unit",
      );
    if (legacy.error) {
      if (isMissingRelationError(legacy.error.message)) {
        return { costs: empty, error: null };
      }
      console.error("[product-costs] load failed:", legacy.error.message);
      return { costs: empty, error: legacy.error.message };
    }
    data = (legacy.data ?? []) as ProductCostRow[];
  } else {
    data = (withCommission.data ?? []) as ProductCostRow[];
  }

  return { costs: rowsToMap(data), error: null };
}

/** Convenience — prefers empty map; prefer loadProductCostsWithStatus for margin paths. */
export async function loadProductCosts(): Promise<Map<string, ProductCost>> {
  const { costs } = await loadProductCostsWithStatus();
  return costs;
}

/** Insert or update one SKU's cost profile for the signed-in user. */
export async function upsertProductCost(
  marketplace: string,
  sku: string,
  cost: ProductCost,
): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: "Supabase is not configured." };
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return { error: "No active session." };

  const base = {
    user_id: userId,
    marketplace,
    sku,
    unit_cost: cost.unitCost ?? 0,
    shipping_per_unit: cost.shippingPerUnit ?? 0,
    return_rate: cost.returnRate ?? 0,
    ad_spend_per_unit: cost.adSpendPerUnit ?? 0,
    packaging_per_unit: cost.packagingPerUnit ?? 0,
    updated_at: new Date().toISOString(),
  };

  const withCommission = await supabase
    .from(TABLE)
    .upsert({ ...base, commission_rate: cost.commissionRate ?? 0 }, { onConflict: "user_id,marketplace,sku" });
  if (!withCommission.error) return { error: null };

  const legacy = await supabase.from(TABLE).upsert(base, { onConflict: "user_id,marketplace,sku" });
  return { error: legacy.error ? legacy.error.message : null };
}

/** Delete one SKU's cost profile (RLS guarantees it must be the user's own). */
export async function deleteProductCost(
  marketplace: string,
  sku: string,
): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: "Supabase is not configured." };
  const { error } = await supabase.from(TABLE).delete().eq("marketplace", marketplace).eq("sku", sku);
  return { error: error ? error.message : null };
}
