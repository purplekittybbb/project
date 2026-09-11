/**
 * Server-side canonical product rebuild after sync or CSV barcode import.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildUserSeller } from "@/lib/supabase/user-data";
import { perSkuMargins } from "@/lib/domain/margin-engine";
import { upsertCanonicalProducts } from "@/lib/supabase/canonical-products";
import type { UserRawRow } from "@/lib/adapters/csv";
import { buildBarcodeAnalysis } from "./barcode-analysis";

type DbRow = {
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
  packaging?: number;
  marketplace: string;
  product_name?: string | null;
  barcode?: string | null;
};

function toUserRawRow(r: DbRow): UserRawRow {
  return {
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

/**
 * Apply SKU→barcode mappings to all matching user_transactions rows.
 */
export async function applyBarcodeMappings(
  supabase: SupabaseClient,
  userId: string,
  mappings: Array<{ sku: string; barcode: string }>,
): Promise<{ updatedSkus: number; error: string | null }> {
  if (mappings.length === 0) return { updatedSkus: 0, error: null };

  let updatedSkus = 0;
  for (const { sku, barcode } of mappings) {
    const { error } = await supabase
      .from("user_transactions")
      .update({ barcode })
      .eq("user_id", userId)
      .eq("sku", sku);
    if (error) return { updatedSkus, error: error.message };
    updatedSkus += 1;
  }
  return { updatedSkus, error: null };
}

/**
 * Rebuild canonical_products cache from the user's full transaction history.
 */
export async function rebuildUserCanonicalProducts(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ productCount: number; error: string | null }> {
  const { data, error } = await supabase
    .from("user_transactions")
    .select(
      "order_id, sku, category, sale_date, units, gross_revenue, unit_cost, shipping, return_rate, ad_spend, packaging, marketplace, product_name, barcode",
    )
    .eq("user_id", userId);

  if (error) return { productCount: 0, error: error.message };
  if (!data?.length) return { productCount: 0, error: null };

  const rows = (data as DbRow[]).map(toUserRawRow);
  const seller = buildUserSeller(rows, userId);
  if (!seller) return { productCount: 0, error: null };

  const analysis = buildBarcodeAnalysis(rows, perSkuMargins(seller.transactions));
  const { error: upsertErr } = await upsertCanonicalProducts(supabase, userId, analysis.products);
  if (upsertErr) return { productCount: 0, error: upsertErr };

  return { productCount: analysis.products.length, error: null };
}
