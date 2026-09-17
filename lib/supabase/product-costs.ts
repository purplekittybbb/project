/**
 * Per-SKU cost profile persistence (Supabase table `product_costs`, migration
 * 0015 — see enrichment rationale in lib/calc/enrich.ts).
 *
 * GRACEFUL DEGRADATION: every function tolerates the table not existing yet
 * (the 0015 migration is written but not applied until approved) and a missing
 * Supabase config — it returns an empty map / a soft error instead of throwing,
 * so the live app keeps working and simply performs no enrichment until the
 * migration lands. RLS scopes all rows to the signed-in user.
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

/**
 * Load the signed-in user's SKU cost profiles as a Map keyed by SKU (the key
 * lib/calc/enrich.ts looks up). If a seller stores the same SKU under multiple
 * marketplaces, the last one read wins — a deliberate simplification for the
 * data-model step; per-marketplace resolution can be layered on later.
 */
export async function loadProductCosts(): Promise<Map<string, ProductCost>> {
  const empty = new Map<string, ProductCost>();
  const supabase = getSupabaseClient();
  if (!supabase) return empty;

  // Select commission_rate too, but tolerate the column not existing yet (0037
  // not applied): fall back to the pre-0037 column list on a schema error.
  let data: ProductCostRow[] | null = null;
  {
    const withCommission = await supabase
      .from(TABLE)
      .select("marketplace, sku, unit_cost, shipping_per_unit, return_rate, ad_spend_per_unit, packaging_per_unit, commission_rate");
    if (withCommission.error) {
      const legacy = await supabase
        .from(TABLE)
        .select("marketplace, sku, unit_cost, shipping_per_unit, return_rate, ad_spend_per_unit, packaging_per_unit");
      if (legacy.error || !legacy.data) return empty;
      data = legacy.data as ProductCostRow[];
    } else {
      data = (withCommission.data ?? []) as ProductCostRow[];
    }
  }

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

  // Try with commission_rate (migration 0037). If the column doesn't exist yet,
  // retry without it so the rest of the cost profile still saves.
  const withCommission = await supabase
    .from(TABLE)
    .upsert({ ...base, commission_rate: cost.commissionRate ?? 0 }, { onConflict: "user_id,marketplace,sku" });
  if (!withCommission.error) return { error: null };

  const legacy = await supabase
    .from(TABLE)
    .upsert(base, { onConflict: "user_id,marketplace,sku" });
  return { error: legacy.error ? legacy.error.message : null };
}

/** Delete one SKU's cost profile (RLS guarantees it must be the user's own). */
export async function deleteProductCost(
  marketplace: string,
  sku: string,
): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: "Supabase is not configured." };
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq("marketplace", marketplace)
    .eq("sku", sku);
  return { error: error ? error.message : null };
}
