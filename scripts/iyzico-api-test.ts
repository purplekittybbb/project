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

console.log("\x1b[1m═══ iyzico apiTest ═══\x1b[0m");
console.log(`apiKey: ${String(process.env.IYZICO_API_KEY ?? "").slice(0, 20)}...`);

iyzipay.apiTest.retrieve({}, (err: unknown, result: Record<string, unknown>) => {
  if (err) { console.log("SDK error:", err); process.exit(1); }
  console.log("Result:", JSON.stringify(result, null, 2));
});
