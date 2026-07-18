/**
 * Real Shopify OAuth + GraphQL Admin API client.
 *
 * Everything here is verified against official shopify.dev documentation
 * (authorization code grant, GraphQL Admin API orders query, error format):
 *
 *   Authorize URL:  https://{shop}/admin/oauth/authorize
 *                     ?client_id=...&scope=read_orders&redirect_uri=...&state=...
 *   Token exchange: POST https://{shop}/admin/oauth/access_token
 *                     (form-encoded: client_id, client_secret, code)
 *   GraphQL:        POST https://{shop}/admin/api/2026-07/graphql.json
 *                     Header: X-Shopify-Access-Token: {access_token}
 *
 * Unlike Trendyol/Hepsiburada/N11 (a form + API key, validated on submit),
 * Shopify requires a REAL browser redirect to Shopify's own site for the
 * merchant to approve access — there is no "wrong API key" input on our
 * side to reject. The equivalent "prove this hits real infrastructure, not
 * a local mock" check for Shopify is: (a) the authorize redirect goes to a
 * real https://{shop}.myshopify.com URL, and (b) a bogus access token
 * against the real GraphQL endpoint gets Shopify's own real 401
 * ({"errors": "[API] Invalid API key or access token ..."}).
 *
 * REST Admin API is legacy (deprecated Oct 2024); GraphQL Admin API has
 * been mandatory for new apps since April 2025 — this client uses GraphQL
 * exclusively.
 *
 * Honest scope limitation: same as every other adapter here — Shopify's
 * Orders API has no visibility into the seller's own COGS or ad spend.
 * unit_cost/ad_spend come back as 0.
 */

import { createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";
import type { UserRawRow } from "../adapters/csv";

const API_VERSION = "2026-07";
const MAX_RATE_LIMIT_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;
const PAGE_SIZE = 50;
const MAX_PAGES = 5;

const SHOP_DOMAIN_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;

export function isValidShopDomain(shop: string): boolean {
  return SHOP_DOMAIN_PATTERN.test(shop);
}

/** Normalize a user-entered store handle ("mystore" or "mystore.myshopify.com") to the full domain. */
export function normalizeShopDomain(input: string): string {
  const trimmed = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
  return trimmed.endsWith(".myshopify.com") ? trimmed : `${trimmed}.myshopify.com`;
}

export function buildAuthorizeUrl(opts: {
  shop: string;
  clientId: string;
  redirectUri: string;
  state: string;
  scope?: string;
}): string {
  const url = new URL(`https://${opts.shop}/admin/oauth/authorize`);
  url.searchParams.set("client_id", opts.clientId);
  url.searchParams.set("scope", opts.scope ?? "read_orders");
  url.searchParams.set("redirect_uri", opts.redirectUri);
  url.searchParams.set("state", opts.state);
  return url.toString();
}

/**
 * Verify the callback's HMAC signature per Shopify's documented algorithm:
 * sort all query params except hmac/signature alphabetically, join as a
 * query string, and compare an HMAC-SHA256 hex digest (keyed with the app's
 * client secret) against the hmac param — using a timing-safe comparison.
 */
export function verifyCallbackHmac(params: URLSearchParams, clientSecret: string): boolean {
  const hmac = params.get("hmac");
  if (!hmac) return false;

  const pairs: string[] = [];
  for (const [key, value] of params.entries()) {
    if (key === "hmac" || key === "signature") continue;
    pairs.push(`${key}=${value}`);
  }
  pairs.sort();
  const message = pairs.join("&");

  const computed = createHmac("sha256", clientSecret).update(message).digest("hex");
  const a = Buffer.from(computed, "utf8");
  const b = Buffer.from(hmac, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Verify a Shopify webhook HMAC (X-Shopify-Hmac-Sha256 header).
 * Shopify signs the raw request body with the app client secret and base64-
 * encodes the digest — different algorithm than the OAuth callback HMAC.
 */
export function verifyWebhookHmac(rawBody: string, hmacHeader: string | null, clientSecret: string): boolean {
  if (!hmacHeader) return false;
  const computed = createHmac("sha256", clientSecret).update(rawBody, "utf8").digest("base64");
  const a = Buffer.from(computed, "utf8");
  const b = Buffer.from(hmacHeader, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Thrown when Shopify itself rejects an access token (401). */
export class ShopifyAuthError extends Error {
  constructor(message = "Shopify erişim reddedildi — token geçersiz veya süresi dolmuş.") {
    super(message);
    this.name = "ShopifyAuthError";
  }
}

/** Thrown for any other non-2xx / GraphQL-error response from Shopify. */
export class ShopifyApiError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "ShopifyApiError";
    this.status = status;
  }
}

/** Thrown when the OAuth callback fails HMAC/state/shop validation — never proceed past this. */
export class ShopifyCallbackValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShopifyCallbackValidationError";
  }
}

/**
 * Thrown when Shopify returned real order lines but NONE of them could be
 * mapped — same rationale as TrendyolMappingError. Must never be swallowed
 * into a silent empty result.
 */
export class ShopifyMappingError extends Error {
  constructor(
    message = "Shopify'dan sipariş satırları geldi ama hiçbiri işlenemedi — GraphQL yanıt alanları beklenenden farklı."
  ) {
    super(message);
    this.name = "ShopifyMappingError";
  }
}

/**
 * Exchange an OAuth authorization code for an access token. Per shopify.dev:
 * POST form-encoded to https://{shop}/admin/oauth/access_token.
 */
export async function exchangeCodeForToken(opts: {
  shop: string;
  clientId: string;
  clientSecret: string;
  code: string;
}): Promise<string> {
  const res = await fetch(`https://${opts.shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      code: opts.code,
    }).toString(),
  });

  if (res.status === 401 || res.status === 403) {
    throw new ShopifyAuthError("Shopify yetkilendirme kodu geçersiz veya süresi dolmuş.");
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new ShopifyApiError(`Shopify token exchange hatası (${res.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`, res.status);
  }

  const body = (await res.json()) as { access_token?: string };
  if (!body.access_token) {
    throw new ShopifyApiError("Shopify token exchange yanıtında access_token yok.");
  }
  return body.access_token;
}

const ShopifyMoneySchema = z.object({
  shopMoney: z.object({ amount: z.string().optional(), currencyCode: z.string().optional() }).optional(),
});

const ShopifyLineItemNodeSchema = z.object({
  title: z.string().optional(),
  quantity: z.number().finite().optional(),
  variant: z.object({ sku: z.string().nullable().optional() }).nullable().optional(),
  originalUnitPriceSet: ShopifyMoneySchema.optional(),
});

const ShopifyOrderNodeSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  createdAt: z.string().optional(),
  lineItems: z
    .object({ edges: z.array(z.object({ node: ShopifyLineItemNodeSchema })).optional() })
    .optional(),
});

export type ShopifyOrderNode = z.infer<typeof ShopifyOrderNodeSchema>;

interface OrdersGraphQlResponse {
  data?: {
    orders?: {
      edges?: { node: unknown }[];
      pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
    };
  };
  errors?: unknown;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const ORDERS_QUERY = `
  query($first: Int!, $after: String, $searchQuery: String) {
    orders(first: $first, after: $after, query: $searchQuery) {
      edges {
        node {
          id
          name
          createdAt
          lineItems(first: 50) {
            edges {
              node {
                title
                quantity
                variant { sku }
                originalUnitPriceSet { shopMoney { amount currencyCode } }
              }
            }
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

async function graphqlRequest(shop: string, accessToken: string, variables: Record<string, unknown>): Promise<OrdersGraphQlResponse> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({ query: ORDERS_QUERY, variables }),
    });

    if (res.status === 401 || res.status === 403) {
      throw new ShopifyAuthError();
    }

    if (res.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
      const retryAfterHeader = res.headers.get("retry-after");
      const parsed = retryAfterHeader ? Number(retryAfterHeader) * 1000 : NaN;
      const waitMs = Number.isFinite(parsed) && parsed >= 0 ? parsed : RETRY_BASE_DELAY_MS * (attempt + 1);
      await delay(waitMs);
      continue;
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new ShopifyApiError(`Shopify GraphQL hatası (${res.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`, res.status);
    }

    const body = (await res.json()) as OrdersGraphQlResponse;
    // Shopify returns 200 OK even for GraphQL-level errors (e.g. an invalid
    // token sometimes surfaces here instead of a 401 — treat both the same).
    if (body.errors) {
      const message = JSON.stringify(body.errors);
      if (/invalid api key|access token/i.test(message)) {
        throw new ShopifyAuthError();
      }
      throw new ShopifyApiError(`Shopify GraphQL error: ${message.slice(0, 200)}`);
    }
    return body;
  }
}

/**
 * Pull the store's recent real orders via the GraphQL Admin API. Bad/expired
 * tokens throw ShopifyAuthError before any data is touched.
 */
export async function fetchShopifyOrders(shop: string, accessToken: string, days = 90): Promise<ShopifyOrderNode[]> {
  const sinceIso = new Date(Date.now() - days * 86_400_000).toISOString();
  const orders: ShopifyOrderNode[] = [];
  let after: string | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const body: OrdersGraphQlResponse = await graphqlRequest(shop, accessToken, {
      first: PAGE_SIZE,
      after,
      searchQuery: `created_at:>${sinceIso}`,
    });

    const edges = body.data?.orders?.edges ?? [];
    for (const edge of edges) {
      const parsed = ShopifyOrderNodeSchema.safeParse(edge.node);
      if (parsed.success) orders.push(parsed.data);
    }

    const pageInfo = body.data?.orders?.pageInfo;
    if (!pageInfo?.hasNextPage || !pageInfo.endCursor) break;
    after = pageInfo.endCursor;
  }

  return orders;
}

/**
 * Map real Shopify order line items into the app's raw-row shape. Throws
 * ShopifyMappingError if order lines existed but every single one failed to
 * map (see that class's doc comment).
 */
export function mapShopifyOrdersToUserRawRows(orders: ShopifyOrderNode[]): UserRawRow[] {
  const rows: UserRawRow[] = [];
  let totalLinesSeen = 0;

  for (const order of orders) {
    const saleDate = order.createdAt ? order.createdAt.slice(0, 10) : new Date().toISOString().slice(0, 10);
    const orderId = order.name ?? order.id ?? `shopify-${rows.length}`;
    const lines = order.lineItems?.edges ?? [];

    for (const edge of lines) {
      totalLinesSeen++;
      const node = edge.node;
      const sku = node.variant?.sku ?? "";
      if (!sku) continue;

      const units = Math.max(1, Math.round(node.quantity ?? 1));
      const amountStr = node.originalUnitPriceSet?.shopMoney?.amount;
      const unitPrice = amountStr != null ? Number(amountStr) : NaN;
      const grossRevenue = Number.isFinite(unitPrice) ? unitPrice * units : 0;
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
        marketplace: "shopify",
      });
    }
  }

  if (totalLinesSeen > 0 && rows.length === 0) {
    throw new ShopifyMappingError();
  }

  return rows;
}

/**
 * REST Admin API order shape delivered by orders/create and orders/updated
 * webhooks (not GraphQL). Mapped into the same UserRawRow shape GraphQL uses.
 */
const ShopifyWebhookLineSchema = z.object({
  sku: z.string().nullable().optional(),
  title: z.string().optional(),
  quantity: z.number().finite().optional(),
  price: z.union([z.string(), z.number()]).optional(),
});

const ShopifyWebhookOrderSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  name: z.string().optional(),
  created_at: z.string().optional(),
  line_items: z.array(ShopifyWebhookLineSchema).optional(),
});

export type ShopifyWebhookOrder = z.infer<typeof ShopifyWebhookOrderSchema>;

export function mapShopifyWebhookOrderToUserRawRows(payload: unknown): UserRawRow[] {
  const parsed = ShopifyWebhookOrderSchema.safeParse(payload);
  if (!parsed.success) {
    throw new ShopifyMappingError("Shopify webhook sipariş gövdesi beklenen biçimde değil.");
  }
  const order = parsed.data;
  const saleDate = order.created_at ? order.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10);
  const orderId = order.name ?? (order.id != null ? String(order.id) : `shopify-wh-${Date.now()}`);
  const rows: UserRawRow[] = [];
  let totalLinesSeen = 0;

  for (const line of order.line_items ?? []) {
    totalLinesSeen++;
    const sku = (line.sku ?? "").trim();
    if (!sku) continue;
    const units = Math.max(1, Math.round(line.quantity ?? 1));
    const unitPrice = line.price != null ? Number(line.price) : NaN;
    const grossRevenue = Number.isFinite(unitPrice) ? unitPrice * units : 0;
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
      marketplace: "shopify",
    });
  }

  if (totalLinesSeen > 0 && rows.length === 0) {
    throw new ShopifyMappingError();
  }
  return rows;
}
