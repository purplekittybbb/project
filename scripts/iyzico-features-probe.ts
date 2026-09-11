import { config as loadDotenv } from "dotenv";
import { resolve } from "path";
loadDotenv({ path: resolve(process.cwd(), ".env.local") });

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Iyzipay = require("iyzipay");

const ip = new Iyzipay({
  apiKey: process.env.IYZICO_API_KEY,
  secretKey: process.env.IYZICO_SECRET_KEY,
  uri: "https://sandbox-api.iyzipay.com",
});

const buyer = {
  id: "BY789", name: "John", surname: "Doe",
  gsmNumber: "+905350000000", email: "email@email.com",
  identityNumber: "74300864791",
  lastLoginDate: "2015-10-05 12:43:55",
  registrationDate: "2013-04-21 15:12:09",
  registrationAddress: "Nidakule Göztepe Merdivenköy Mah.",
  ip: "85.34.78.112", city: "Istanbul", country: "Turkey", zipCode: "34732",
};
const addr = { contactName: "Jane Doe", city: "Istanbul", country: "Turkey",
               address: "Nidakule Göztepe Merdivenköy Mah.", zipCode: "34732" };
const basketId = `B${Date.now()}`;

// Test 1: checkoutFormInitialize (IyziPOS)
console.log("\n\x1b[1m1. checkoutFormInitialize (IyziPOS)\x1b[0m");
ip.checkoutFormInitialize.create({
  locale: Iyzipay.LOCALE.TR, conversationId: basketId, price: "1", paidPrice: "1",
  currency: Iyzipay.CURRENCY.TRY, basketId, paymentGroup: Iyzipay.PAYMENT_GROUP.PRODUCT,
  callbackUrl: "https://www.example.com/callback", enabledInstallments: [2, 3, 6, 9],
  buyer, shippingAddress: addr, billingAddress: addr,
  basketItems: [{ id: "BI101", name: "Item", category1: "Cat", category2: "SubCat",
                  itemType: Iyzipay.BASKET_ITEM_TYPE.PHYSICAL, price: "1" }],
}, (err: unknown, r: Record<string, unknown>) => {
  console.log(`  status=${r.status} errorCode=${r.errorCode ?? "—"} msg=${r.errorMessage ?? "—"}`);
});

// Test 2: binNumber (simple, no special feature needed)
console.log("\x1b[1m2. binNumber check\x1b[0m");
ip.binNumber.retrieve({
  locale: Iyzipay.LOCALE.TR, conversationId: "test-bin",
  binNumber: "552879",  // test card prefix
}, (err: unknown, r: Record<string, unknown>) => {
  console.log(`  status=${r.status} errorCode=${r.errorCode ?? "—"} cardType=${r.cardType ?? "—"} bank=${r.bankName ?? "—"}`);
});

// Test 3: installmentInfo (another simple endpoint)
console.log("\x1b[1m3. installmentInfo\x1b[0m");
ip.installmentInfo.retrieve({
  locale: Iyzipay.LOCALE.TR, conversationId: "test-inst",
  binNumber: "552879", price: "1",
}, (err: unknown, r: Record<string, unknown>) => {
  console.log(`  status=${r.status} errorCode=${r.errorCode ?? "—"}`);
  if (r.status === "success") {
    const families = r.installmentDetails as Array<{ cardFamilyName: string }> | undefined;
    console.log(`  cardFamily=${families?.[0]?.cardFamilyName ?? "—"}`);
  }
  setTimeout(() => process.exit(0), 500);
});
