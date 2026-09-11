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

  const { data, error } = await supabase
    .from(TABLE)
    .select("marketplace, sku, unit_cost, shipping_per_unit, return_rate, ad_spend_per_unit, packaging_per_unit");
  if (error || !data) return empty;

  const map = new Map<string, ProductCost>();
  for (const r of data as ProductCostRow[]) {
    map.set(r.sku, {
      unitCost: Number(r.unit_cost),
      shippingPerUnit: Number(r.shipping_per_unit),
      returnRate: Number(r.return_rate),
      adSpendPerUnit: Number(r.ad_spend_per_unit),
      packagingPerUnit: Number(r.packaging_per_unit),
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

  const { error } = await supabase.from(TABLE).upsert(
    {
      user_id: userId,
      marketplace,
      sku,
      unit_cost: cost.unitCost ?? 0,
      shipping_per_unit: cost.shippingPerUnit ?? 0,
      return_rate: cost.returnRate ?? 0,
      ad_spend_per_unit: cost.adSpendPerUnit ?? 0,
      packaging_per_unit: cost.packagingPerUnit ?? 0,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,marketplace,sku" },
  );
  return { error: error ? error.message : null };
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
