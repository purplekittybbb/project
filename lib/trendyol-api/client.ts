/**
 * Real Trendyol Marketplace Integration API client.
 *
 * Per developers.trendyol.com: HTTP Basic Auth (apiKey:apiSecret, base64) plus
 * a User-Agent identifying the seller, against the Orders endpoint of the
 * Integration API. This hits Trendyol's live servers over the network — wrong
 * credentials come back as a real 401/403 FROM TRENDYOL, never a local
 * simulation, and we never report a connection as successful unless Trendyol
 * itself confirmed it.
 *
 * Honest scope limitation: Trendyol's Orders API returns real revenue,
 * quantities and order dates, but it has no visibility into the seller's own
 * product cost (COGS), returns, or ad spend — no marketplace API can know a
 * seller's cost basis. Those fields come back as 0 from this sync and are
 * filled later by lib/calc/enrich.ts from product_costs (seller-entered).
 *
 * Category: getShipmentPackages lines expose productCategoryId + businessUnit,
 * not categoryName. filterProducts (official product API) returns categoryName.
 * We fold those signals onto the internal commission taxonomy.
 */

import type { UserRawRow } from "../adapters/csv";
import { mapToInternalCategory } from "../domain/internal-category";

const TRENDYOL_API_BASE = "https://apigw.trendyol.com/integration";
const MAX_RATE_LIMIT_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;
/** Bound initial connect to a few pages — a full historical backfill is a later sync, not the connect step. */
const MAX_PAGES = 5;
const MAX_PRODUCT_PAGES = 5;
const PRODUCT_PAGE_SIZE = 50;

export interface TrendyolCredentials {
  sellerId: string;
  apiKey: string;
  apiSecret: string;
}

/** Thrown when Trendyol itself rejects the credentials (401/403). */
export class TrendyolAuthError extends Error {
  constructor(message = "Trendyol API bilgileri hatalı — Seller ID, API Key veya API Secret'ı kontrol edin.") {
    super(message);
    this.name = "TrendyolAuthError";
  }
}

/** Thrown for any other non-2xx response from Trendyol. */
export class TrendyolApiError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "TrendyolApiError";
    this.status = status;
  }
}

/**
 * Thrown when Trendyol returned real order lines but NONE of them could be
 * mapped to a valid row — the strongest signal that Trendyol's response
 * schema no longer matches the field names this client expects (e.g. a future
 * API revision renames stockCode/lineGrossAmount again). This must never be
 * swallowed into a silent empty result: a connection that "succeeds" but
 * saves 0 rows because of a schema mismatch is a silent data-loss bug, not a
 * legitimate empty account.
 */
export class TrendyolMappingError extends Error {
  constructor(
    message = "Trendyol'dan sipariş satırları geldi ama hiçbiri işlenemedi — API alan adları beklenenden farklı olabilir (stockCode/lineGrossAmount bekleniyor)."
  ) {
    super(message);
    this.name = "TrendyolMappingError";
  }
}

/**
 * Field names verified against Trendyol's published getShipmentPackages
 * example response (developers.trendyol.com/v3.0/docs/2-get-shipment-packages):
 * the seller's own SKU comes back as `stockCode` (NOT merchantSku) and the
 * line total as `lineGrossAmount` (NOT amount/price). The older aliases are
 * kept as fallbacks in case an account is still served an earlier API
 * revision — they cost nothing and prevent a silent zero-row import.
 */
interface TrendyolOrderLine {
  stockCode?: string;
  merchantSku?: string;
  sku?: string;
  barcode?: string;
  productName?: string;
  quantity?: number;
  lineGrossAmount?: number;
  lineUnitPrice?: number;
  amount?: number;
  price?: number;
  /** Official getShipmentPackages — integer leaf id, not a display name. */
  productCategoryId?: number;
  /** Official getShipmentPackages — e.g. "Sports Shoes". */
  businessUnit?: string;
  /** Not on the published order example; accepted if a revision sends it. */
  categoryName?: string;
  productCategoryName?: string;
  category?: string;
}

interface TrendyolOrder {
  orderNumber?: string;
  shipmentPackageId?: number | string;
  orderDate?: number; // epoch ms
  lines?: TrendyolOrderLine[];
}

interface TrendyolOrdersResponse {
  content?: TrendyolOrder[];
  totalElements?: number;
  totalPages?: number;
  page?: number;
}

function basicAuthHeader(apiKey: string, apiSecret: string): string {
  const token = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
  return `Basic ${token}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Fetch one page of recent orders from Trendyol's real Orders endpoint.
 * Retries on 429 (rate limit) with a simple backoff honoring Retry-After when
 * present; throws TrendyolAuthError on 401/403 so the caller can surface
 * "API bilgileri hatalı" and never fake a green checkmark.
 */
async function fetchOrdersPage(
  creds: TrendyolCredentials,
  page: number,
  startDateMs: number,
  endDateMs: number
): Promise<TrendyolOrdersResponse> {
  const url = new URL(`${TRENDYOL_API_BASE}/order/sellers/${encodeURIComponent(creds.sellerId)}/orders`);
  url.searchParams.set("startDate", String(startDateMs));
  url.searchParams.set("endDate", String(endDateMs));
  url.searchParams.set("page", String(page));
  url.searchParams.set("size", "50");
  url.searchParams.set("orderByField", "PackageLastModifiedDate");
  url.searchParams.set("orderByDirection", "DESC");

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: basicAuthHeader(creds.apiKey, creds.apiSecret),
        "User-Agent": `${creds.sellerId} - SelfIntegration`,
        Accept: "application/json",
      },
    });

    if (res.status === 401 || res.status === 403) {
      throw new TrendyolAuthError();
    }

    if (res.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
      const retryAfterHeader = res.headers.get("retry-after");
      const parsed = retryAfterHeader ? Number(retryAfterHeader) * 1000 : NaN;
      const waitMs = Number.isFinite(parsed) && parsed >= 0 ? parsed : RETRY_BASE_DELAY_MS * (attempt + 1);
      await delay(waitMs);
      continue;
    }

    if (!res.ok) {
      let detail = "";
      try {
        detail = await res.text();
      } catch {
        // ignore — body may be empty or unreadable
      }
      throw new TrendyolApiError(
        `Trendyol API hatası (${res.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`,
        res.status
      );
    }

    return (await res.json()) as TrendyolOrdersResponse;
  }
}

/**
 * Validate credentials AND pull the seller's recent real orders in one call.
 * Bad credentials throw TrendyolAuthError before any data is touched or
 * stored — the caller must never mark the connection successful past this
 * point unless it resolves.
 */
export async function fetchTrendyolOrders(
  creds: TrendyolCredentials,
  days = 90
): Promise<TrendyolOrder[]> {
  const endDateMs = Date.now();
  const startDateMs = endDateMs - days * 86_400_000;

  const first = await fetchOrdersPage(creds, 0, startDateMs, endDateMs);
  const orders = [...(first.content ?? [])];

  const totalPages = first.totalPages ?? 1;
  const pagesToFetch = Math.min(totalPages, MAX_PAGES);
  for (let page = 1; page < pagesToFetch; page++) {
    const next = await fetchOrdersPage(creds, page, startDateMs, endDateMs);
    orders.push(...(next.content ?? []));
  }

  return orders;
}

interface TrendyolProduct {
  stockCode?: string;
  barcode?: string;
  categoryName?: string;
}

interface TrendyolProductsResponse {
  content?: TrendyolProduct[];
  totalPages?: number;
}

async function fetchProductsPage(
  creds: TrendyolCredentials,
  page: number,
): Promise<TrendyolProductsResponse> {
  const url = new URL(`${TRENDYOL_API_BASE}/product/sellers/${encodeURIComponent(creds.sellerId)}/products`);
  url.searchParams.set("page", String(page));
  url.searchParams.set("size", String(PRODUCT_PAGE_SIZE));

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: basicAuthHeader(creds.apiKey, creds.apiSecret),
        "User-Agent": `${creds.sellerId} - SelfIntegration`,
        Accept: "application/json",
      },
    });

    if (res.status === 401 || res.status === 403) {
      throw new TrendyolAuthError();
    }

    if (res.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
      const retryAfterHeader = res.headers.get("retry-after");
      const parsed = retryAfterHeader ? Number(retryAfterHeader) * 1000 : NaN;
      const waitMs = Number.isFinite(parsed) && parsed >= 0 ? parsed : RETRY_BASE_DELAY_MS * (attempt + 1);
      await delay(waitMs);
      continue;
    }

    if (!res.ok) {
      throw new TrendyolApiError(`Trendyol ürün API hatası (${res.status}).`, res.status);
    }

    return (await res.json()) as TrendyolProductsResponse;
  }
}

/**
 * Bounded filterProducts pull → stockCode/barcode → official categoryName.
 * Soft-fails to an empty map (orders still import) if the product endpoint
 * is unavailable. Auth errors also soft-fail here so a working Orders pull
 * is not discarded because products were denied.
 */
export async function fetchTrendyolProductCategoryIndex(
  creds: TrendyolCredentials,
): Promise<Map<string, string>> {
  const index = new Map<string, string>();
  try {
    for (let page = 0; page < MAX_PRODUCT_PAGES; page++) {
      const body = await fetchProductsPage(creds, page);
      const content = body.content ?? [];
      for (const product of content) {
        const name = (product.categoryName ?? "").trim();
        if (!name) continue;
        if (product.stockCode?.trim()) index.set(product.stockCode.trim(), name);
        if (product.barcode?.trim()) index.set(product.barcode.trim(), name);
      }
      const totalPages = body.totalPages ?? 1;
      if (page + 1 >= totalPages || content.length < PRODUCT_PAGE_SIZE) break;
    }
  } catch (err) {
    console.warn("[trendyol] product category index skipped:", err);
  }
  return index;
}

export function resolveTrendyolLineCategory(
  line: TrendyolOrderLine,
  catalog?: Map<string, string>,
): string {
  const fromLine = line.categoryName ?? line.productCategoryName ?? line.category ?? line.businessUnit;
  if (fromLine && fromLine.trim()) return fromLine.trim();
  const sku = (line.stockCode ?? line.merchantSku ?? line.sku ?? "").trim();
  const barcode = (line.barcode ?? "").trim();
  return catalog?.get(sku) ?? catalog?.get(barcode) ?? "";
}

/**
 * Map real Trendyol order lines into the app's raw-row shape (see
 * lib/adapters/csv.ts UserRawRow). Revenue, units and dates are real values
 * from Trendyol. unit_cost/shipping/return_rate/ad_spend default to 0 — see
 * the module-level comment on why the Orders API can't supply them.
 *
 * Throws TrendyolMappingError if Trendyol sent order lines but every single
 * one failed to map (no usable sku AND/OR no usable revenue field found) —
 * see that class's doc comment. A single skipped line among otherwise-valid
 * ones (a genuine 0-revenue or SKU-less line) is normal and stays silent.
 */
export function mapOrdersToUserRawRows(
  orders: TrendyolOrder[],
  catalog?: Map<string, string>,
): UserRawRow[] {
  const rows: UserRawRow[] = [];
  let totalLinesSeen = 0;

  for (const order of orders) {
    const saleDate = order.orderDate
      ? new Date(order.orderDate).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    const orderId = order.orderNumber ?? String(order.shipmentPackageId ?? `trendyol-${rows.length}`);

    for (const line of order.lines ?? []) {
      totalLinesSeen++;
      const sku = line.stockCode ?? line.merchantSku ?? line.sku ?? line.barcode ?? "";
      if (!sku) continue;
      const units = Math.max(1, Math.round(line.quantity ?? 1));
      const grossRevenue = Number(line.lineGrossAmount ?? line.lineUnitPrice ?? line.amount ?? line.price ?? 0) || 0;
      if (grossRevenue <= 0) continue;

      rows.push({
        order_id: orderId,
        sku,
        category: mapToInternalCategory(resolveTrendyolLineCategory(line, catalog)),
        sale_date: saleDate,
        units,
        gross_revenue: grossRevenue,
        unit_cost: 0,
        shipping: 0,
        return_rate: 0,
        ad_spend: 0,
        marketplace: "trendyol",
        product_name: line.productName ?? undefined,
        barcode: line.barcode?.trim() || undefined,
      });
    }
  }

  if (totalLinesSeen > 0 && rows.length === 0) {
    throw new TrendyolMappingError();
  }

  return rows;
}
