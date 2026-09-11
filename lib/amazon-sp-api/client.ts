/**
 * Amazon SP-API Orders mapper + guarded fetch.
 *
 * Field names follow the Orders v0 schema
 * (https://developer-docs.amazon.com/sp-api/docs/orders-api-v0-reference):
 *   AmazonOrderId, PurchaseDate, OrderStatus, MarketplaceId
 *   OrderItems: SellerSKU, ASIN, Title, QuantityOrdered,
 *               ItemPrice.{Amount, CurrencyCode}
 *
 * fetchAmazonTrOrders is HARD-GATED: it throws AmazonLiveGuardError unless
 * AMAZON_SP_API_LIVE_ENABLED=1. First live call is a watched joint test.
 */

import type { UserRawRow } from "../adapters/csv";
import { AMAZON_TR_MARKETPLACE_ID, SP_API_EU_ENDPOINT } from "./constants";
import { assertAmazonOrdersLiveAllowed } from "./live";
import { exchangeRefreshToken } from "./lwa";

export class AmazonSpApiError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "AmazonSpApiError";
    this.status = status;
  }
}

export class AmazonMappingError extends Error {
  constructor(
    message = "Amazon sipariş satırları geldi ama hiçbiri işlenemedi — SP-API alan adları beklenenden farklı.",
  ) {
    super(message);
    this.name = "AmazonMappingError";
  }
}

export interface AmazonMoney {
  Amount?: string;
  CurrencyCode?: string;
}

export interface AmazonOrderItem {
  SellerSKU?: string;
  ASIN?: string;
  Title?: string;
  QuantityOrdered?: number;
  ItemPrice?: AmazonMoney;
}

export interface AmazonOrder {
  AmazonOrderId?: string;
  PurchaseDate?: string;
  OrderStatus?: string;
  MarketplaceId?: string;
  OrderItems?: AmazonOrderItem[];
}

const NON_SALE = /^(canceled|cancelled|pending)$/i;

export function isNonSaleAmazonOrder(order: AmazonOrder): boolean {
  return typeof order.OrderStatus === "string" && NON_SALE.test(order.OrderStatus);
}

/**
 * Map SP-API order + item payload into UserRawRow[].
 * COGS / shipping / returns / ads default to 0 — Orders API does not know them.
 */
export function mapAmazonOrdersToUserRawRows(orders: AmazonOrder[]): UserRawRow[] {
  const rows: UserRawRow[] = [];
  let totalLinesSeen = 0;

  for (const order of orders) {
    if (isNonSaleAmazonOrder(order)) continue;
    const orderId = order.AmazonOrderId ?? `amazon-tr-${rows.length}`;
    const saleDate = order.PurchaseDate
      ? order.PurchaseDate.slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    const items = order.OrderItems ?? [];

    for (const item of items) {
      totalLinesSeen++;
      const sku = (item.SellerSKU ?? item.ASIN ?? "").trim();
      if (!sku) continue;
      const units = Math.max(1, Math.round(item.QuantityOrdered ?? 1));
      const amount = Number(item.ItemPrice?.Amount ?? 0);
      if (!(amount > 0)) continue;

      rows.push({
        order_id: orderId,
        sku,
        category: "Diğer",
        sale_date: saleDate,
        units,
        gross_revenue: amount,
        unit_cost: 0,
        shipping: 0,
        return_rate: 0,
        ad_spend: 0,
        marketplace: "amazon_tr",
        product_name: item.Title,
        barcode: item.ASIN,
      });
    }
  }

  if (totalLinesSeen > 0 && rows.length === 0) {
    throw new AmazonMappingError();
  }
  return rows;
}

/**
 * GET /orders/v0/orders for Amazon TR.
 * Throws AmazonLiveGuardError unless AMAZON_SP_API_LIVE_ENABLED=1.
 */
export async function fetchAmazonTrOrders(opts: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  createdAfterIso: string;
}): Promise<AmazonOrder[]> {
  assertAmazonOrdersLiveAllowed();

  const tokens = await exchangeRefreshToken({
    refreshToken: opts.refreshToken,
    clientId: opts.clientId,
    clientSecret: opts.clientSecret,
  });

  const url = new URL("/orders/v0/orders", SP_API_EU_ENDPOINT);
  url.searchParams.set("MarketplaceIds", AMAZON_TR_MARKETPLACE_ID);
  url.searchParams.set("CreatedAfter", opts.createdAfterIso);

  const res = await fetch(url.toString(), {
    headers: {
      host: "sellingpartnerapi-eu.amazon.com",
      "x-amz-access-token": tokens.accessToken,
      "x-amz-date": new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z"),
      "user-agent": "TrueMargin/1.0 (Language=TypeScript)",
    },
  });

  if (res.status === 401 || res.status === 403) {
    throw new AmazonSpApiError("Amazon SP-API yetkisi reddedildi.", res.status);
  }
  if (!res.ok) {
    throw new AmazonSpApiError(`Amazon SP-API hata (${res.status}).`, res.status);
  }

  const body = (await res.json()) as {
    payload?: { Orders?: AmazonOrder[] };
    Orders?: AmazonOrder[];
  };
  return body.payload?.Orders ?? body.Orders ?? [];
}
