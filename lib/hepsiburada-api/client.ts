/**
 * Real Hepsiburada Merchant API client.
 *
 * Per developers.hepsiburada.com: HTTP Basic Auth (apiKey as username,
 * apiSecret as password, base64) plus a required User-Agent identifying the
 * merchant, against the order-listing endpoint of the Merchant API. This
 * hits Hepsiburada's live servers over the network — wrong credentials come
 * back as a real 401/403 FROM HEPSIBURADA, never a local simulation.
 *
 * Field-name confidence note: order-level fields (OrderNumber, OrderDate)
 * and line-item fields (sku, quantity, unitPrice.amount, totalPrice.amount,
 * vatRate, merchantId) were verified against indexed Hepsiburada developer
 * documentation. Casing was observed to be INCONSISTENT across different doc
 * pages (PascalCase at order level, camelCase at line-item level in some
 * examples, the reverse in others) — this client accepts both casings for
 * every field rather than guessing one. The exact top-level response wrapper
 * (bare array vs {items:[...]} vs {content:[...]}) could not be confirmed
 * (the reference page returned 403 to automated fetches), so the parser
 * tries all three shapes.
 *
 * Honest scope limitation: same as Trendyol — Hepsiburada's order API has no
 * visibility into the seller's own product cost (COGS), returns, or ad
 * spend. Those fields come back as 0 from this sync.
 */

import { z } from "zod";
import type { UserRawRow } from "../adapters/csv";

const HEPSIBURADA_API_BASE = "https://oms-external.hepsiburada.com";
const MAX_RATE_LIMIT_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;
/** Hepsiburada's documented max page size for offset/limit pagination is 10 — much smaller than Trendyol's 50. */
const PAGE_LIMIT = 10;
/** Bound initial connect to a few pages, same reasoning as the Trendyol client. */
const MAX_PAGES = 5;

export interface HepsiburadaCredentials {
  merchantId: string;
  apiKey: string;
  apiSecret: string;
}

/** Thrown when Hepsiburada itself rejects the credentials (401/403). */
export class HepsiburadaAuthError extends Error {
  constructor(
    message = "Hepsiburada API bilgileri hatalı — Merchant ID, API Kullanıcı Adı veya API Şifresi'ni kontrol edin."
  ) {
    super(message);
    this.name = "HepsiburadaAuthError";
  }
}

/** Thrown for any other non-2xx response from Hepsiburada. */
export class HepsiburadaApiError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "HepsiburadaApiError";
    this.status = status;
  }
}

/**
 * Thrown when Hepsiburada returned real order lines but NONE of them could
 * be mapped to a valid row — see TrendyolMappingError (lib/trendyol-api/client.ts)
 * for the full rationale. Must never be swallowed into a silent empty result.
 */
export class HepsiburadaMappingError extends Error {
  constructor(
    message = "Hepsiburada'dan sipariş satırları geldi ama hiçbiri işlenemedi — API alan adları beklenenden farklı olabilir (sku/unitPrice.amount bekleniyor)."
  ) {
    super(message);
    this.name = "HepsiburadaMappingError";
  }
}

/**
 * Zod schemas mirroring Hepsiburada's real (if inconsistently-cased) response
 * fields — see the module doc comment for which fields were verified against
 * documentation vs accepted defensively for both casings. Every field is
 * optional because we don't fully control which shape a given account's API
 * revision returns; this schema's job is TYPE safety at the boundary (a
 * string where a number is expected gets caught here, before it reaches
 * money math), the same role UserRawRowSchema plays for CSV/manual entry.
 */
export const HepsiburadaMoneySchema = z.object({
  amount: z.number().finite().optional(),
  Amount: z.number().finite().optional(),
  currency: z.string().optional(),
  Currency: z.string().optional(),
});

export const HepsiburadaLineItemSchema = z.object({
  sku: z.string().optional(),
  Sku: z.string().optional(),
  merchantSku: z.string().optional(),
  MerchantSku: z.string().optional(),
  quantity: z.number().finite().optional(),
  Quantity: z.number().finite().optional(),
  unitPrice: HepsiburadaMoneySchema.optional(),
  UnitPrice: HepsiburadaMoneySchema.optional(),
  totalPrice: HepsiburadaMoneySchema.optional(),
  TotalPrice: HepsiburadaMoneySchema.optional(),
  vatRate: z.number().finite().optional(),
  VatRate: z.number().finite().optional(),
});

export const HepsiburadaOrderSchema = z.object({
  orderNumber: z.string().optional(),
  OrderNumber: z.string().optional(),
  orderDate: z.string().optional(),
  OrderDate: z.string().optional(),
  merchantId: z.string().optional(),
  MerchantId: z.string().optional(),
  lineItems: z.array(HepsiburadaLineItemSchema).optional(),
  LineItems: z.array(HepsiburadaLineItemSchema).optional(),
  items: z.array(HepsiburadaLineItemSchema).optional(),
});

export type HepsiburadaLineItem = z.infer<typeof HepsiburadaLineItemSchema>;
export type HepsiburadaOrder = z.infer<typeof HepsiburadaOrderSchema>;

function basicAuthHeader(apiKey: string, apiSecret: string): string {
  const token = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
  return `Basic ${token}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Extract the order array regardless of which wrapper shape Hepsiburada used
 * (see module doc comment), then Zod-parse each element. A malformed
 * individual order is dropped (defense-in-depth, same spirit as
 * validateUserRawRows) rather than crashing the whole page.
 */
function extractOrdersArray(body: unknown): HepsiburadaOrder[] {
  let raw: unknown[] = [];
  if (Array.isArray(body)) raw = body;
  else {
    const obj = body as Record<string, unknown> | null | undefined;
    if (Array.isArray(obj?.items)) raw = obj!.items as unknown[];
    else if (Array.isArray(obj?.content)) raw = obj!.content as unknown[];
    else if (Array.isArray((obj as { orders?: unknown })?.orders)) {
      raw = (obj as { orders: unknown[] }).orders;
    }
  }

  const orders: HepsiburadaOrder[] = [];
  for (const item of raw) {
    const parsed = HepsiburadaOrderSchema.safeParse(item);
    if (parsed.success) orders.push(parsed.data);
  }
  return orders;
}

/**
 * Fetch one page of recent orders from Hepsiburada's real orders endpoint.
 * Retries on 429 (rate limit) honoring the documented X-RateLimit-Reset
 * header when present; throws HepsiburadaAuthError on 401/403.
 */
async function fetchOrdersPage(
  creds: HepsiburadaCredentials,
  offset: number
): Promise<HepsiburadaOrder[]> {
  const url = new URL(`${HEPSIBURADA_API_BASE}/orders/merchantid/${encodeURIComponent(creds.merchantId)}`);
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("limit", String(PAGE_LIMIT));

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: basicAuthHeader(creds.apiKey, creds.apiSecret),
        "User-Agent": `${creds.merchantId} - SelfIntegration`,
        Accept: "application/json",
      },
    });

    if (res.status === 401 || res.status === 403) {
      throw new HepsiburadaAuthError();
    }

    if (res.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
      const resetHeader = res.headers.get("x-ratelimit-reset") ?? res.headers.get("retry-after");
      const parsed = resetHeader ? Number(resetHeader) * 1000 : NaN;
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
      throw new HepsiburadaApiError(
        `Hepsiburada API hatası (${res.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`,
        res.status
      );
    }

    return extractOrdersArray(await res.json());
  }
}

/**
 * Validate credentials AND pull the seller's recent real orders in one call.
 * Bad credentials throw HepsiburadaAuthError before any data is touched.
 *
 * Note: Hepsiburada's `timespan` filter is documented to cap results to the
 * last 24 hours when used ALONE; its exact combined format with limit/offset
 * for a longer range isn't confirmed from available docs, so this
 * deliberately paginates the most-recent-first default ordering with
 * offset/limit instead of guessing a timespan value that could silently
 * narrow the window to 24h without the caller knowing.
 */
export async function fetchHepsiburadaOrders(creds: HepsiburadaCredentials): Promise<HepsiburadaOrder[]> {
  const orders: HepsiburadaOrder[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const offset = page * PAGE_LIMIT;
    const pageOrders = await fetchOrdersPage(creds, offset);
    orders.push(...pageOrders);
    if (pageOrders.length < PAGE_LIMIT) break; // last page
  }
  return orders;
}

/**
 * Map real Hepsiburada order lines into the app's raw-row shape (see
 * lib/adapters/csv.ts UserRawRow). Revenue, units and dates are real values
 * from Hepsiburada. unit_cost/shipping/return_rate/ad_spend default to 0 —
 * see the module-level comment on why the order API can't supply them.
 *
 * Throws HepsiburadaMappingError if Hepsiburada sent order lines but every
 * single one failed to map — see that class's doc comment.
 */
export function mapHepsiburadaOrdersToUserRawRows(orders: HepsiburadaOrder[]): UserRawRow[] {
  const rows: UserRawRow[] = [];
  let totalLinesSeen = 0;

  for (const order of orders) {
    const rawDate = order.orderDate ?? order.OrderDate;
    const saleDate = rawDate ? new Date(rawDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
    const orderId = order.orderNumber ?? order.OrderNumber ?? `hepsiburada-${rows.length}`;
    const lines = order.lineItems ?? order.LineItems ?? order.items ?? [];

    for (const line of lines) {
      totalLinesSeen++;
      const sku = line.sku ?? line.Sku ?? line.merchantSku ?? line.MerchantSku ?? "";
      if (!sku) continue;

      const quantity = line.quantity ?? line.Quantity ?? 1;
      const units = Math.max(1, Math.round(quantity));

      const totalMoney = line.totalPrice ?? line.TotalPrice;
      const unitMoney = line.unitPrice ?? line.UnitPrice;
      const totalAmount = totalMoney?.amount ?? totalMoney?.Amount;
      const unitAmount = unitMoney?.amount ?? unitMoney?.Amount;
      const grossRevenue = Number(totalAmount ?? (unitAmount != null ? unitAmount * units : 0)) || 0;
      if (grossRevenue <= 0) continue;

      rows.push({
        order_id: orderId,
        sku,
        category: "Diğer",
        sale_date: saleDate,
        units,
        gross_revenue: grossRevenue,
        unit_cost: 0,
        shipping: 0,
        return_rate: 0,
        ad_spend: 0,
        marketplace: "hepsiburada",
      });
    }
  }

  if (totalLinesSeen > 0 && rows.length === 0) {
    throw new HepsiburadaMappingError();
  }

  return rows;
}
