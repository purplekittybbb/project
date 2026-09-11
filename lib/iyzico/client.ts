// SANDBOX ONLY. Never set IYZICO_BASE_URL to the production URL without
// explicit user approval. Production URL: https://api.iyzipay.com
// Sandbox URL: https://sandbox-api.iyzipay.com

/**
 * iyzico Sandbox API client.
 *
 * AUTH MODEL — IYZWSv2 (matches official iyzipay npm SDK v2.0.69):
 *   signature = HMAC-SHA256(secretKey, randomString + uriPath + JSON.stringify(body)) → HEX
 *   authParams = "apiKey:KEY&randomKey:RND&signature:SIG"
 *   Authorization: "IYZWSv2 " + base64(authParams)
 *
 * This is fundamentally different from the old IYZWS/PKI format.
 *
 * References:
 *   iyzipay-node/lib/utils.js generateHashV2
 *   https://dev.iyzipay.com/tr/api/olusturulmus-odeme-formu
 */

import { createHmac, randomBytes } from "crypto";

// ── Constants ─────────────────────────────────────────────────────────────────

const SANDBOX_URL   = "https://sandbox-api.iyzipay.com";
const PRODUCTION_URL = "https://api.iyzipay.com";

/** Path for checkout form initialization (IyziPOS hosted checkout). */
const PATH_CHECKOUT_INIT    = "/payment/iyzipos/checkoutform/initialize/auth/ecom";
/** Path for retrieving checkout form payment result. */
const PATH_CHECKOUT_DETAIL  = "/payment/iyzipos/checkoutform/auth/ecom/detail";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface IyzicoConfig {
  apiKey: string;
  secretKey: string;
  /** Must be the sandbox URL. Set IYZICO_BASE_URL=https://sandbox-api.iyzipay.com */
  baseUrl: string;
}

export interface InitCheckoutFormRequest {
  price: string;
  paidPrice: string;
  currency: "TRY";
  basketId: string;
  callbackUrl: string;
  buyerEmail: string;
  buyerName: string;
  buyerSurname: string;
  buyerId: string;
  planId: "starter" | "pro";
}

export interface CheckoutFormResult {
  status: "success" | "failure";
  checkoutFormContent?: string;  // HTML to inject for card form
  token?: string;
  errorMessage?: string;
}

// ── IYZWSv2 Auth ──────────────────────────────────────────────────────────────

/**
 * Build the IYZWSv2 Authorization header.
 *
 * Algorithm (from iyzipay-node/lib/utils.js generateHashV2):
 *   1. HMAC-SHA256(secretKey, randomString + uriPath + JSON.stringify(body)) → hex
 *   2. Join: "apiKey:KEY&randomKey:RND&signature:HEX_SIG"
 *   3. base64-encode the joined string
 *   4. Prefix with "IYZWSv2 "
 *
 * @param uriPath  — just the path, e.g. "/payment/iyzipos/checkoutform/initialize/auth/ecom"
 * @param body     — the request body OBJECT (not stringified yet)
 */
export function buildIyzicoV2Auth(
  config: IyzicoConfig,
  randomString: string,
  uriPath: string,
  body: Record<string, unknown>,
): string {
  const bodyStr  = JSON.stringify(body);
  const signature = createHmac("sha256", config.secretKey)
    .update(randomString + uriPath + bodyStr)
    .digest("hex");

  const params = `apiKey:${config.apiKey}&randomKey:${randomString}&signature:${signature}`;
  return "IYZWSv2 " + Buffer.from(params).toString("base64");
}

/**
 * Format a price per iyzico's convention:
 *   parseFloat → toString → append ".0" if no decimal point
 *   Examples: "400.00" → "400.0", "1" → "1.0", "1.5" → "1.5"
 */
export function formatIyzicoPrice(price: string | number): string {
  const n = parseFloat(String(price));
  if (!isFinite(n)) return String(price);
  const s = n.toString();
  return s.includes(".") ? s : s + ".0";
}

// ── Sandbox guard ─────────────────────────────────────────────────────────────

function assertSandbox(config: IyzicoConfig): void {
  if (
    config.baseUrl === PRODUCTION_URL ||
    (config.baseUrl.includes("api.iyzipay.com") && !config.baseUrl.includes("sandbox"))
  ) {
    throw new Error(
      `IYZICO_BASE_URL must be sandbox URL in this environment.\n` +
      `Received: ${config.baseUrl}\n` +
      `Expected: ${SANDBOX_URL}\n` +
      `SANDBOX ONLY — never use production URL without explicit user approval.`
    );
  }
}

// ── Checkout form (IyziPOS hosted payment page) ───────────────────────────────

/**
 * Initialize an iyzico checkout form (hosted card entry).
 *
 * Returns an HTML snippet (`checkoutFormContent`) that the caller injects
 * into the page to render the iyzico card entry form.
 *
 * SANDBOX ONLY. Production URL in IYZICO_BASE_URL will throw.
 */
export async function initCheckoutForm(
  config: IyzicoConfig,
  request: InitCheckoutFormRequest
): Promise<CheckoutFormResult> {
  assertSandbox(config);

  const rnd      = randomBytes(8).toString("hex"); // 8 bytes = 16 hex chars, matches SDK
  const price    = formatIyzicoPrice(request.price);
  const planName = request.planId === "starter" ? "TrueMargin Başlangıç Plan" : "TrueMargin Profesyonel Plan";

  const body: Record<string, unknown> = {
    locale: "tr",
    conversationId: request.basketId,
    price,
    basketId: request.basketId,
    paymentGroup: "SUBSCRIPTION",
    buyer: {
      id: request.buyerId,
      name: request.buyerName,
      surname: request.buyerSurname,
      gsmNumber: "+905350000000",    // sandbox placeholder
      email: request.buyerEmail,
      identityNumber: "74300864791", // iyzico official sandbox TC no
      lastLoginDate: "2015-10-05 12:43:55",
      registrationDate: "2015-10-05 12:43:55",
      registrationAddress: "Sandbox Test Address",
      ip: "85.34.78.112",
      city: "Istanbul",
      country: "Turkey",
      zipCode: "34732",
    },
    shippingAddress: {
      contactName: `${request.buyerName} ${request.buyerSurname}`,
      city: "Istanbul",
      country: "Turkey",
      address: "Sandbox Test Address",
      zipCode: "34732",
    },
    billingAddress: {
      contactName: `${request.buyerName} ${request.buyerSurname}`,
      city: "Istanbul",
      country: "Turkey",
      address: "Sandbox Test Address",
      zipCode: "34732",
    },
    basketItems: [
      {
        id: request.planId,
        name: planName,
        category1: "SaaS Abonelik",
        itemType: "VIRTUAL",
        price,
      },
    ],
    callbackUrl: request.callbackUrl,
    currency: request.currency,
    paidPrice: formatIyzicoPrice(request.paidPrice),
    enabledInstallments: [1],
  };

  const authHeader = buildIyzicoV2Auth(config, rnd, PATH_CHECKOUT_INIT, body);

  try {
    const response = await fetch(`${config.baseUrl}${PATH_CHECKOUT_INIT}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": authHeader,
        "x-iyzi-rnd": rnd,
        "x-iyzi-client-version": "iyzipay-node-2.0.69",
      },
      body: JSON.stringify(body),
    });

    const data = (await response.json()) as Record<string, unknown>;

    if (data.status === "success") {
      return {
        status: "success",
        checkoutFormContent: String(data.checkoutFormContent ?? ""),
        token: String(data.token ?? ""),
      };
    } else {
      return {
        status: "failure",
        errorMessage: String(data.errorMessage ?? data.errorCode ?? "iyzico error"),
      };
    }
  } catch (err) {
    return {
      status: "failure",
      errorMessage: `Network error: ${String(err)}`,
    };
  }
}

/**
 * Retrieve the result of a checkout form payment attempt.
 *
 * Called from the callback route after iyzico POSTs back with the token.
 *
 * SANDBOX ONLY.
 */
export async function retrieveCheckoutFormResult(
  config: IyzicoConfig,
  token: string
): Promise<{
  status: string;
  paymentStatus?: string;
  errorMessage?: string;
  /** The buyer.id we passed in initCheckoutForm — echoed back by iyzico. */
  buyerId?: string;
  /** The basketId / conversationId we set — format: "{userId}-{planId}-{timestamp}". */
  basketId?: string;
  /** iyzico's internal payment ID. */
  paymentId?: string;
}> {
  assertSandbox(config);

  const rnd  = randomBytes(8).toString("hex");
  const body: Record<string, unknown> = { locale: "tr", token };
  const authHeader = buildIyzicoV2Auth(config, rnd, PATH_CHECKOUT_DETAIL, body);

  try {
    const response = await fetch(`${config.baseUrl}${PATH_CHECKOUT_DETAIL}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": authHeader,
        "x-iyzi-rnd": rnd,
        "x-iyzi-client-version": "iyzipay-node-2.0.69",
      },
      body: JSON.stringify(body),
    });

    const data = (await response.json()) as Record<string, unknown>;
    return {
      status: String(data.status ?? "failure"),
      paymentStatus: data.paymentStatus ? String(data.paymentStatus) : undefined,
      errorMessage: data.errorMessage ? String(data.errorMessage) : undefined,
      buyerId: data.buyerId ? String(data.buyerId) : undefined,
      basketId: data.basketId ?? data.conversationId
        ? String(data.basketId ?? data.conversationId)
        : undefined,
      paymentId: data.paymentId ? String(data.paymentId) : undefined,
    };
  } catch (err) {
    return {
      status: "failure",
      errorMessage: `Network error: ${String(err)}`,
    };
  }
}

// ── Config factory ────────────────────────────────────────────────────────────

/**
 * Build IyzicoConfig from environment variables.
 * Defaults IYZICO_BASE_URL to the sandbox URL (safe default).
 * Throws if IYZICO_API_KEY or IYZICO_SECRET_KEY are not set.
 */
export function getIyzicoConfig(): IyzicoConfig {
  const apiKey    = process.env.IYZICO_API_KEY;
  const secretKey = process.env.IYZICO_SECRET_KEY;
  const baseUrl   = process.env.IYZICO_BASE_URL ?? SANDBOX_URL;

  if (!apiKey || !secretKey) {
    throw new Error("IYZICO_API_KEY and IYZICO_SECRET_KEY environment variables are required.");
  }

  return { apiKey, secretKey, baseUrl };
}

// Re-export for backwards-compat (tests use createIyzicoSignature)
export { buildIyzicoV2Auth as createIyzicoSignature };
