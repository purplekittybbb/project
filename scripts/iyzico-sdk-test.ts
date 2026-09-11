/**
 * iyzico SDK direct test — uses official iyzipay npm package.
 * npx tsx scripts/iyzico-sdk-test.ts
 */
import { config as loadDotenv } from "dotenv";
import { resolve } from "path";
loadDotenv({ path: resolve(process.cwd(), ".env.local") });

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Iyzipay = require("iyzipay");

const iyzipay = new Iyzipay({
  apiKey: process.env.IYZICO_API_KEY,
  secretKey: process.env.IYZICO_SECRET_KEY,
  uri: "https://sandbox-api.iyzipay.com",
});

const request = {
  locale: Iyzipay.LOCALE.TR,
  conversationId: `sdk-test-${Date.now()}`,
  price: "1",
  paidPrice: "1",
  currency: Iyzipay.CURRENCY.TRY,
  basketId: `B${Date.now()}`,
  paymentGroup: Iyzipay.PAYMENT_GROUP.PRODUCT,
  callbackUrl: "https://www.example.com/callback",
  enabledInstallments: [2, 3, 6, 9],
  buyer: {
    id: "BY789",
    name: "John",
    surname: "Doe",
    gsmNumber: "+905350000000",
    email: "email@email.com",
    identityNumber: "74300864791",
    lastLoginDate: "2015-10-05 12:43:55",
    registrationDate: "2013-04-21 15:12:09",
    registrationAddress: "Nidakule Göztepe Merdivenköy Mah.",
    ip: "85.34.78.112",
    city: "Istanbul",
    country: "Turkey",
    zipCode: "34732",
  },
  shippingAddress: {
    contactName: "Jane Doe",
    city: "Istanbul",
    country: "Turkey",
    address: "Nidakule Göztepe Merdivenköy Mah.",
    zipCode: "34732",
  },
  billingAddress: {
    contactName: "Jane Doe",
    city: "Istanbul",
    country: "Turkey",
    address: "Nidakule Göztepe Merdivenköy Mah.",
    zipCode: "34732",
  },
  basketItems: [
    {
      id: "BI101",
      name: "Binocular",
      category1: "Collectibles",
      category2: "Accessories",
      itemType: Iyzipay.BASKET_ITEM_TYPE.PHYSICAL,
      price: "1",
    },
  ],
};

console.log("\x1b[1m═══ iyzico SDK Direct Test ═══\x1b[0m\n");
console.log(`\x1b[36mℹ\x1b[0m apiKey: ${String(process.env.IYZICO_API_KEY ?? "").slice(0, 20)}...`);

iyzipay.checkoutFormInitialize.create(request, (err: unknown, result: Record<string, unknown>) => {
  if (err) {
    console.log("\x1b[31m✗\x1b[0m SDK error:", err);
    process.exit(1);
  }
  console.log(`\x1b[36mℹ\x1b[0m status: ${result.status}`);
  console.log(`\x1b[36mℹ\x1b[0m errorCode: ${result.errorCode ?? "—"}`);
  console.log(`\x1b[36mℹ\x1b[0m errorMessage: ${result.errorMessage ?? "—"}`);
  if (result.status === "success") {
    console.log(`\x1b[32m✓\x1b[0m SUCCESS — token: ${String(result.token ?? "").slice(0, 24)}...`);
  } else {
    console.log(`\x1b[31m✗\x1b[0m FAILED`);
    process.exit(1);
  }
});
