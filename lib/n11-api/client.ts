/**
 * Real N11 REST API client.
 *
 * Endpoint and auth CONFIRMED from N11 Mağaza Destek / integrator docs:
 *   GET https://api.n11.com/rest/delivery/v1/shipmentPackages
 *   Headers: appkey, appsecret (N11-specific header names, not Basic Auth)
 *   Query: startDate/endDate (epoch ms), status, page, size, orderByField,
 *          orderByDirection
 *   Rate limit: 1000 requests/minute
 *   Data availability: orders before November 2024 are not returned
 *
 * Field mapping CONFIDENCE — HIGH for the documented REST GetShipmentPackages
 * response (orderNumber, id, lastModifiedDate, lines[].stockCode / quantity /
 * price / dueAmount / sellerInvoiceAmount). Verified against published sample
 * responses (magazadestek.n11.com RestAPI Sipariş Listeleme + Codeilla N11
 * REST doc mirror). Legacy SOAP-era / Trendyol-style aliases remain as
 * fallbacks only.
 *
 * Honest scope limitation: same as Trendyol/Hepsiburada — no marketplace API
 * can know a seller's own COGS, returns, or ad spend. Those fields come back
 * as 0 from this sync.
 */

import { z } from "zod";
import type { UserRawRow } from "../adapters/csv";
import { mapToInternalCategory } from "../domain/internal-category";
import { istanbulDayString, istanbulTodayString } from "../time/istanbul";

const N11_API_BASE = "https://api.n11.com/rest/delivery/v1";
const MAX_RATE_LIMIT_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;
const PAGE_SIZE = 50;
const MAX_PAGES = 5;

export interface N11Credentials {
  appKey: string;
  appSecret: string;
}

/** Thrown when N11 itself rejects the credentials (401/403). */
export class N11AuthError extends Error {
  constructor(message = "N11 API bilgileri hatalı — App Key veya App Secret'ı kontrol edin.") {
    super(message);
    this.name = "N11AuthError";
  }
}

/** Thrown for any other non-2xx response from N11. */
export class N11ApiError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "N11ApiError";
    this.status = status;
  }
}

/**
 * Thrown when N11 returned real order lines but NONE of them could be
 * mapped — see TrendyolMappingError for the full rationale. Primary
 * guardrail against a wrong-schema silently importing 0 rows.
 */
export class N11MappingError extends Error {
  constructor(
    message = "N11'den sipariş satırları geldi ama hiçbiri işlenemedi — API alan adları beklenenden farklı."
  ) {
    super(message);
    this.name = "N11MappingError";
  }
}

const N11LineItemSchema = z.object({
  // Documented REST GetShipmentPackages line fields (HIGH confidence).
  stockCode: z.string().optional(),
  quantity: z.number().finite().optional(),
  price: z.number().finite().optional(),
  dueAmount: z.number().finite().optional(),
  sellerInvoiceAmount: z.number().finite().optional(),
  totalSellerDiscountPrice: z.number().finite().optional(),
  productName: z.string().optional(),
  // Category, when N11 includes it on the line — lets the adapter pick the
  // right category commission instead of defaulting everything to "Diğer".
  categoryName: z.string().optional(),
  category: z.string().optional(),
  // Legacy / alternate aliases kept as soft fallbacks.
  productSellerCode: z.string().optional(),
  lineGrossAmount: z.number().finite().optional(),
  sku: z.string().optional(),
  amount: z.number().finite().optional(),
  barcode: z.string().optional(),
});

const N11OrderSchema = z.object({
  orderNumber: z.string().optional(),
  id: z.union([z.string(), z.number()]).optional(),
  // Documented package timestamp (epoch ms).
  lastModifiedDate: z.union([z.number(), z.string()]).optional(),
  // Soft aliases if a future response uses a different name.
  orderDate: z.union([z.number(), z.string()]).optional(),
  createdDate: z.union([z.number(), z.string()]).optional(),
  // Shipment/order status — used to skip cancelled/rejected packages so a
  // non-sale never inflates revenue. Both names seen across N11 responses.
  shipmentStatus: z.string().optional(),
  status: z.string().optional(),
  // Order-level category fallback when lines don't carry one.
  categoryName: z.string().optional(),
  lines: z.array(N11LineItemSchema).optional(),
  orderItemList: z.array(N11LineItemSchema).optional(),
  lineItems: z.array(N11LineItemSchema).optional(),
});

export type N11LineItem = z.infer<typeof N11LineItemSchema>;
export type N11Order = z.infer<typeof N11OrderSchema>;

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function extractOrdersArray(body: unknown): N11Order[] {
  let raw: unknown[] = [];
  if (Array.isArray(body)) raw = body;
  else {
    const obj = body as Record<string, unknown> | null | undefined;
    if (Array.isArray(obj?.content)) raw = obj!.content as unknown[];
    else if (Array.isArray(obj?.items)) raw = obj!.items as unknown[];
    else if (Array.isArray((obj as { orders?: unknown })?.orders)) {
      raw = (obj as { orders: unknown[] }).orders;
    }
  }
  const orders: N11Order[] = [];
  for (const item of raw) {
    const parsed = N11OrderSchema.safeParse(item);
    if (parsed.success) orders.push(parsed.data);
  }
  return orders;
}

/**
 * Fetch one page of recent shipment packages from N11's real endpoint.
 * Retries on 429 with a simple backoff; throws N11AuthError on 401/403.
 */
async function fetchOrdersPage(
  creds: N11Credentials,
  page: number,
  startDateMs: number,
  endDateMs: number
): Promise<{ orders: N11Order[]; totalPages?: number }> {
  const url = new URL(`${N11_API_BASE}/shipmentPackages`);
  url.searchParams.set("startDate", String(startDateMs));
  url.searchParams.set("endDate", String(endDateMs));
  url.searchParams.set("page", String(page));
  url.searchParams.set("size", String(PAGE_SIZE));
  url.searchParams.set("orderByField", "PackageLastModifiedDate");
  url.searchParams.set("orderByDirection", "DESC");

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        appkey: creds.appKey,
        appsecret: creds.appSecret,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(30_000),
    });

    if (res.status === 401 || res.status === 403) {
      throw new N11AuthError();
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
        // ignore
      }
      throw new N11ApiError(`N11 API hatası (${res.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`, res.status);
    }

    const body = (await res.json()) as Record<string, unknown>;
    return { orders: extractOrdersArray(body), totalPages: body?.totalPages as number | undefined };
  }
}

/**
 * Validate credentials AND pull the seller's recent real orders in one call.
 * Bad credentials throw N11AuthError before any data is touched.
 */
export async function fetchN11Orders(creds: N11Credentials, days = 90): Promise<N11Order[]> {
  const endDateMs = Date.now();
  const startDateMs = endDateMs - days * 86_400_000;

  const first = await fetchOrdersPage(creds, 0, startDateMs, endDateMs);
  const orders = [...first.orders];

  const totalPages = first.totalPages ?? 1;
  const pagesToFetch = Math.min(totalPages, MAX_PAGES);
  for (let page = 1; page < pagesToFetch; page++) {
    const next = await fetchOrdersPage(creds, page, startDateMs, endDateMs);
    orders.push(...next.orders);
  }

  return orders;
}

function resolveSaleDate(order: N11Order): string {
  const raw = order.lastModifiedDate ?? order.orderDate ?? order.createdDate;
  if (raw == null) return istanbulTodayString();
  // BUG FIX: the old `typeof raw === "number" ? raw : raw` was a no-op ternary.
  // N11 may send epoch-ms as a numeric STRING ("1699..."); `new Date("1699...")`
  // → Invalid Date → `.toISOString()` throws RangeError and aborts the whole
  // sync. Coerce all-digit strings to a number and guard an unparseable value.
  const numeric =
    typeof raw === "string" && /^\d+$/.test(raw.trim()) ? Number(raw) : raw;
  return istanbulDayString(numeric as string | number) || istanbulTodayString();
}

/**
 * Cancelled / rejected / refunded shipment packages are NOT sales — counting
 * their lines would inflate revenue and margin. Matches TR + EN status labels.
 */
const NON_SALE_STATUS = /(cancel|iptal|reject|reddedil|refund|iade\s*edildi)/;

function isNonSaleShipment(order: N11Order): boolean {
  const status = order.shipmentStatus ?? order.status;
  if (typeof status !== "string") return false;
  // Fold the Turkish dotted İ / dotless I to plain "i" before matching — the
  // regex `i` flag alone does NOT case-fold "İptal" → "iptal".
  const folded = status.replace(/İ/g, "i").replace(/I/g, "i").toLowerCase();
  return NON_SALE_STATUS.test(folded);
}

/** Category for a line: line-level first, then order-level, else "Diğer". */
function resolveLineCategory(order: N11Order, line: N11LineItem): string {
  const c = line.categoryName ?? line.category ?? order.categoryName;
  return mapToInternalCategory(c && c.trim() ? c.trim() : "");
}

/**
 * Line revenue per N11 RestAPI Sipariş Listeleme guidance:
 * prefer sellerInvoiceAmount; else dueAmount; else (price * quantity) − discounts.
 */
function resolveLineGrossRevenue(line: N11LineItem, quantity: number): number {
  if (line.sellerInvoiceAmount != null && Number.isFinite(line.sellerInvoiceAmount) && line.sellerInvoiceAmount > 0) {
    return line.sellerInvoiceAmount;
  }
  if (line.dueAmount != null && Number.isFinite(line.dueAmount) && line.dueAmount > 0) {
    return line.dueAmount;
  }
  if (line.lineGrossAmount != null && Number.isFinite(line.lineGrossAmount) && line.lineGrossAmount > 0) {
    return line.lineGrossAmount;
  }
  if (line.amount != null && Number.isFinite(line.amount) && line.amount > 0) {
    return line.amount;
  }
  if (line.price != null && Number.isFinite(line.price) && line.price > 0) {
    const discount = line.totalSellerDiscountPrice ?? 0;
    return Math.max(0, line.price * quantity - discount);
  }
  return 0;
}

/**
 * Map real N11 order lines into the app's raw-row shape. Throws
 * N11MappingError if lines existed but every one failed to produce a valid row.
 */
export function mapN11OrdersToUserRawRows(orders: N11Order[]): UserRawRow[] {
  const rows: UserRawRow[] = [];
  let totalLinesSeen = 0;

  for (const order of orders) {
    // Skip cancelled/rejected packages entirely — before counting lines, so a
    // cancelled order can never trip the "lines existed but none mapped" guard.
    if (isNonSaleShipment(order)) continue;

    const saleDate = resolveSaleDate(order);
    const orderId = order.orderNumber ?? String(order.id ?? `n11-${rows.length}`);
    const lines = order.lines ?? order.orderItemList ?? order.lineItems ?? [];

    for (const line of lines) {
      totalLinesSeen++;
      const sku = line.stockCode ?? line.productSellerCode ?? line.sku ?? "";
      if (!sku) continue;

      const quantity = line.quantity ?? 1;
      const units = Math.max(1, Math.round(quantity));
      const grossRevenue = resolveLineGrossRevenue(line, units);
      if (grossRevenue <= 0) continue;

      rows.push({
        order_id: orderId,
        sku,
        category: resolveLineCategory(order, line),
        sale_date: saleDate,
        units,
        gross_revenue: grossRevenue,
        unit_cost: 0,
        shipping: 0,
        return_rate: 0,
        ad_spend: 0,
        marketplace: "n11",
        product_name: line.productName ?? undefined,
        barcode: line.barcode?.trim() || undefined,
      });
    }
  }

  if (totalLinesSeen > 0 && rows.length === 0) {
    throw new N11MappingError();
  }

  return rows;
}
