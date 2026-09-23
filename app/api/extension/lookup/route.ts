import { NextResponse } from "next/server";
import crypto from "crypto";
import { buildSkuEconomicsMap, type SkuEconomics } from "@/lib/tools/sku-economics";
import type { StoredRow } from "@/lib/supabase/user-data";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * Chrome uzantısının çağırdığı tek gerçek-veri uç noktası.
 *
 * Auth: Authorization: Bearer <token> — the extension popup's personal access
 * token (generated in the dashboard, see app/api/account/extension-token/
 * route.ts). This is the ONE place in the codebase where a request is
 * authenticated by something other than the Supabase session cookie, because
 * a chrome-extension:// page cannot hold that cookie. The token itself IS the
 * credential (same trust model as any API key) — we hash it and match against
 * extension_tokens.token_hash using the SERVICE ROLE client, since RLS would
 * otherwise make it impossible for an unauthenticated request to even find
 * the matching row. Every subsequent query is still explicitly scoped with
 * `.eq("user_id", userId)`.
 *
 * CORS: opened to any origin (chrome-extension://<random-id> is not a stable,
 * allowlist-able origin) because the endpoint is read-only and gated entirely
 * by possession of a secret token, not by browser same-origin trust.
 *
 * Response is intentionally narrow: only SKUs that match the extension's
 * query (product title substring or exact barcode) are returned — never the
 * user's full dataset — capped at 5 matches.
 */

export const runtime = "nodejs";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const raw = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!raw) {
    return json({ error: "Bağlı değil — uzantı ayarlarına TrueMargin token'ınızı ekleyin." }, 401);
  }

  const supabase = createServiceRoleClient();
  if (!supabase) return json({ error: "Sunucu yapılandırması eksik." }, 500);

  const tokenHash = hashToken(raw);
  const { data: tokenRow } = await supabase
    .from("extension_tokens")
    .select("user_id")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!tokenRow) {
    return json({ error: "Token geçersiz veya iptal edilmiş — dashboard'dan yeniden bağlayın." }, 401);
  }
  const userId = tokenRow.user_id as string;

  // Best-effort — never blocks the response.
  void supabase
    .from("extension_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("token_hash", tokenHash)
    .then(() => {});

  const url = new URL(req.url);
  const query = (url.searchParams.get("q") ?? "").trim();
  const barcode = (url.searchParams.get("barcode") ?? "").trim();

  if (!query && !barcode) {
    return json({ error: "Ürün adı veya barkod gerekli." }, 400);
  }

  const { data, error } = await supabase
    .from("user_transactions")
    .select(
      "id, order_id, sku, category, sale_date, units, gross_revenue, unit_cost, shipping, return_rate, ad_spend, packaging, marketplace, product_name, barcode",
    )
    .eq("user_id", userId);

  if (error) {
    return json({ error: "Veri okunamadı." }, 500);
  }

  const rows = (data ?? []) as unknown as StoredRow[];
  if (rows.length === 0) {
    return json({ matches: [], note: "Hesabınızda henüz yüklenmiş satış verisi yok." });
  }

  const economics = buildSkuEconomicsMap(rows);
  const needle = query.toLocaleLowerCase("tr");

  const matches: SkuEconomics[] = [];
  for (const eco of economics.values()) {
    const barcodeMatch =
      barcode.length > 0 && rows.some((r) => r.sku === eco.sku && r.barcode === barcode);
    const titleMatch =
      needle.length > 0 && eco.productTitle.toLocaleLowerCase("tr").includes(needle);
    if (barcodeMatch || titleMatch) matches.push(eco);
    if (matches.length >= 5) break;
  }

  return json({
    matches: matches.map((m) => ({
      sku: m.sku,
      productTitle: m.productTitle,
      marketplace: m.marketplace,
      category: m.category,
      avgSalePrice: m.avgSalePrice,
      unitCost: m.unitCost,
      shippingPerUnit: m.shippingPerUnit,
      packagingPerUnit: m.packagingPerUnit,
      adSpendPerUnit: m.adSpendPerUnit,
      returnRate: m.returnRate,
      totalUnits: m.totalUnits,
    })),
  });
}
