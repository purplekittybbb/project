/**
 * E2E: Shopify-only channel tab on /demo — reproduces the dashboard crash scenario
 * where connectedIds=["shopify"] snaps channel to "shopify" but seed seller-b has no shopify data.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
const OUT = join(process.cwd(), "tests", "e2e-evidence");
mkdirSync(OUT, { recursive: true });

const consoleErrors = [];
const networkFailures = [];
const allConsole = [];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on("console", (msg) => {
    const entry = `[${msg.type()}] ${msg.text()}`;
    allConsole.push(entry);
    if (msg.type() === "error") consoleErrors.push(entry);
  });
  page.on("pageerror", (err) => {
    consoleErrors.push(`[pageerror] ${err.message}\n${err.stack ?? ""}`);
  });
  page.on("response", async (res) => {
    const status = res.status();
    if (status >= 400) {
      let body = "";
      try { body = (await res.text()).slice(0, 500); } catch { body = "(unreadable)"; }
      networkFailures.push({ url: res.url(), status, body });
    }
  });

  const steps = [];
  const log = (step, detail) => {
    const line = `${new Date().toISOString()} ${step}: ${detail}`;
    console.log(line);
    steps.push(line);
    return line;
  };

  try {
    // Pre-seed localStorage on first same-origin navigation
    await context.addInitScript(() => {
      try {
        localStorage.setItem("tm_connected_marketplaces", JSON.stringify(["shopify"]));
        localStorage.setItem("tm_onboarding_done", "1");
        localStorage.setItem("tm_marketplace_connections", JSON.stringify([{
          id: "conn_demo_shopify",
          marketplaceId: "shopify",
          provider: "demo",
          status: "connected",
          connectedAt: new Date().toISOString(),
          accessTokenRef: "tm_demo_shopify_abc123",
          scopes: ["read_orders", "read_settlements"],
          lastSyncedAt: new Date().toISOString(),
          method: "oauth",
        }]));
      } catch { /* ignore */ }
    });

    log("STEP1", "Navigate /demo with shopify-only localStorage");
    await page.goto(`${BASE}/demo`, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: join(OUT, "demo-shopify-only-01.png"), fullPage: true });

    const bodyText = await page.locator("body").innerText();
    const crashed = bodyText.includes("Application error") || bodyText.includes("couldn't load") || bodyText.includes("Something went wrong");
    log("STEP1-result", `crashed=${crashed} hasRealMargin=${bodyText.includes("Real Margin")} hasShopify=${bodyText.includes("Shopify")}`);

    // Also test /connect demo flow end-to-end on port 3000 if auth not required
    // (will redirect to login if supabase configured — recorded separately)
    log("STEP2", "Navigate /connect?preview=connect");
    await page.goto(`${BASE}/connect?preview=connect`, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(OUT, "connect-preview-01.png"), fullPage: true });
    const connectBody = await page.locator("body").innerText();
    const onLogin = connectBody.includes("Sign in");
    const onConnect = connectBody.includes("Connect your marketplaces");
    log("STEP2-result", `onLogin=${onLogin} onConnect=${onConnect}`);

    if (onConnect) {
      log("STEP3", "Demo connect flow: Shopify OAuth");
      await page.getByRole("button", { name: /Connect Shopify/i }).click();
      await page.waitForTimeout(1200);
      await page.getByRole("button", { name: "Authorize" }).click();
      await page.waitForTimeout(4000);
      await page.screenshot({ path: join(OUT, "connect-after-oauth.png"), fullPage: true });

      log("STEP4", "Continue through onboarding");
      await page.getByRole("button", { name: "Continue" }).click();
      await page.waitForTimeout(600);
      await page.getByRole("button", { name: "Start free trial" }).click();
      await page.waitForTimeout(600);
      await page.getByRole("button", { name: /Start free month/i }).click();
      await page.waitForURL(/\/dashboard/, { timeout: 15000 });
      await page.waitForTimeout(2500);
      await page.screenshot({ path: join(OUT, "dashboard-after-connect.png"), fullPage: true });

      const dashBody = await page.locator("body").innerText();
      const dashCrash = dashBody.includes("Application error") || dashBody.includes("couldn't load");
      log("STEP4-result", `url=${page.url()} crashed=${dashCrash} noData=${dashBody.includes("No data yet")} dashboard=${dashBody.includes("Real Margin")}`);
    }
  } catch (err) {
    steps.push(log("FATAL", String(err)));
    await page.screenshot({ path: join(OUT, "99-error.png"), fullPage: true }).catch(() => {});
  }

  const report = { timestamp: new Date().toISOString(), steps, consoleErrors, networkFailures, allConsole: allConsole.slice(-80) };
  writeFileSync(join(OUT, "report-demo-shopify.json"), JSON.stringify(report, null, 2));
  console.log("\n=== REPORT ===");
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  process.exit(consoleErrors.length > 0 || networkFailures.some((f) => f.status >= 500) ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
