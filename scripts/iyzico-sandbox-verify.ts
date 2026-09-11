/**
 * iyzico Sandbox Diagnostic — uses iyzico's official sample values verbatim.
 *
 * npx tsx scripts/iyzico-sandbox-verify.ts
 */

import { config as loadDotenv } from "dotenv";
import { resolve } from "path";
loadDotenv({ path: resolve(process.cwd(), ".env.local") });

import { createHmac, randomBytes } from "crypto";

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const ok   = (s: string) => `\x1b[32m✓\x1b[0m ${s}`;
const fail = (s: string) => `\x1b[31m✗\x1b[0m ${s}`;
const info = (s: string) => `\x1b[36mℹ\x1b[0m ${s}`;

const apiKey    = process.env.IYZICO_API_KEY ?? "";
const secretKey = process.env.IYZICO_SECRET_KEY ?? "";

function sign(rnd: string, pki: string): string {
  return createHmac("sha256", secretKey).update(apiKey + rnd + pki).digest("base64");
}

async function probe(label: string, pki: string, body: unknown): Promise<void> {
  const rnd = randomBytes(16).toString("hex");
  const sig = sign(rnd, pki);
  const auth = `IYZWS ${apiKey}:${rnd}:${sig}`;

  const resp = await fetch("https://sandbox-api.iyzipay.com/payment/checkoutform/initialize", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "Authorization": auth,
      "x-iyzi-rnd": rnd,
    },
    body: JSON.stringify(body),
  });

  const raw = await resp.text();
  const d = JSON.parse(raw) as Record<string, unknown>;
  if (d.status === "success") {
    console.log(ok(`[${label}] SUCCESS — token: ${String(d.token ?? "").slice(0, 20)}...`));
  } else {
    console.log(fail(`[${label}] errorCode=${d.errorCode} msg="${d.errorMessage}"`));
  }
}

async function main() {
  console.log("\n" + bold("═══ iyzico Sandbox Diagnostic ═══\n"));
  console.log(info(`apiKey: ${apiKey.slice(0, 20)}...`));
  console.log(info(`secretKey: ${secretKey.slice(0, 20)}...\n`));

  const basketId = `B${Date.now()}`;
  const price = "1";
  const paidPrice = "1";

  // iyzico official sample buyer fields (including TC kimlik no that passes validation)
  const buyer = {
    id: "BY789",
    name: "John",
    surname: "Doe",
    gsmNumber: "+905350000000",
    email: "email@email.com",
    identityNumber: "74300864791",  // official iyzico sample TC no
    lastLoginDate: "2015-10-05 12:43:55",
    registrationDate: "2013-04-21 15:12:09",
    registrationAddress: "Nidakule Goztepe Merdivenköy Mah.",
    ip: "85.34.78.112",
    city: "Istanbul",
    country: "Turkey",
    zipCode: "34732",
  };

  const addr = {
    contactName: "Jane Doe",
    city: "Istanbul",
    country: "Turkey",
    address: "Nidakule Goztepe Merdivenköy Mah.",
    zipCode: "34732",
  };

  const basketItems = [
    { id: "BI101", name: "Binocular", category1: "Collectibles", category2: "Accessories",
      itemType: "PHYSICAL", price },
  ];

  // ── Probe 1: paymentGroup=PRODUCT, enabledInstallments=[2,3,6,9] ───────────
  {
    const pki =
      `[locale=tr,conversationId=${basketId},price=${price},paidPrice=${paidPrice}` +
      `,currency=TRY,basketId=${basketId},paymentGroup=PRODUCT` +
      `,buyer=[id=${buyer.id},name=${buyer.name},surname=${buyer.surname}` +
      `,gsmNumber=${buyer.gsmNumber},email=${buyer.email}` +
      `,identityNumber=${buyer.identityNumber}` +
      `,lastLoginDate=${buyer.lastLoginDate},registrationDate=${buyer.registrationDate}` +
      `,registrationAddress=${buyer.registrationAddress}` +
      `,ip=${buyer.ip},city=${buyer.city},country=${buyer.country},zipCode=${buyer.zipCode}]` +
      `,shippingAddress=[contactName=${addr.contactName},city=${addr.city}` +
      `,country=${addr.country},address=${addr.address},zipCode=${addr.zipCode}]` +
      `,billingAddress=[contactName=${addr.contactName},city=${addr.city}` +
      `,country=${addr.country},address=${addr.address},zipCode=${addr.zipCode}]` +
      `,basketItems=[[id=${basketItems[0].id},name=${basketItems[0].name}` +
      `,category1=${basketItems[0].category1},category2=${basketItems[0].category2}` +
      `,itemType=${basketItems[0].itemType},price=${basketItems[0].price}]]` +
      `,callbackUrl=https://www.example.com/callback` +
      `,enabledInstallments=[2,3,6,9]]`;

    const body = {
      locale: "tr", conversationId: basketId, price, paidPrice, currency: "TRY",
      basketId, paymentGroup: "PRODUCT",
      callbackUrl: "https://www.example.com/callback",
      enabledInstallments: [2, 3, 6, 9],
      buyer, shippingAddress: addr, billingAddress: addr,
      basketItems,
    };

    await probe("PRODUCT+physical+[2,3,6,9]", pki, body);
  }

  // ── Probe 2: paymentGroup=SUBSCRIPTION, VIRTUAL item, [1] ──────────────────
  {
    const virtualItem = { id: "starter", name: "TrueMargin Plan", category1: "SaaS Abonelik",
                          itemType: "VIRTUAL", price: "400.00" };
    const p2 = "400.00";
    const b2 = `B2${Date.now()}`;

    const pki =
      `[locale=tr,conversationId=${b2},price=${p2},paidPrice=${p2}` +
      `,currency=TRY,basketId=${b2},paymentGroup=SUBSCRIPTION` +
      `,buyer=[id=${buyer.id},name=${buyer.name},surname=${buyer.surname}` +
      `,gsmNumber=${buyer.gsmNumber},email=${buyer.email}` +
      `,identityNumber=${buyer.identityNumber}` +
      `,lastLoginDate=${buyer.lastLoginDate},registrationDate=${buyer.registrationDate}` +
      `,registrationAddress=${buyer.registrationAddress}` +
      `,ip=${buyer.ip},city=${buyer.city},country=${buyer.country},zipCode=${buyer.zipCode}]` +
      `,shippingAddress=[contactName=${addr.contactName},city=${addr.city}` +
      `,country=${addr.country},address=${addr.address},zipCode=${addr.zipCode}]` +
      `,billingAddress=[contactName=${addr.contactName},city=${addr.city}` +
      `,country=${addr.country},address=${addr.address},zipCode=${addr.zipCode}]` +
      `,basketItems=[[id=${virtualItem.id},name=${virtualItem.name}` +
      `,category1=${virtualItem.category1},itemType=${virtualItem.itemType}` +
      `,price=${virtualItem.price}]]` +
      `,callbackUrl=https://www.example.com/callback` +
      `,enabledInstallments=[1]]`;

    const body = {
      locale: "tr", conversationId: b2, price: p2, paidPrice: p2, currency: "TRY",
      basketId: b2, paymentGroup: "SUBSCRIPTION",
      callbackUrl: "https://www.example.com/callback",
      enabledInstallments: [1],
      buyer, shippingAddress: addr, billingAddress: addr,
      basketItems: [virtualItem],
    };

    await probe("SUBSCRIPTION+virtual+[1]", pki, body);
  }

  console.log();
}

main().catch((e) => { console.error(fail(String(e))); process.exit(1); });
