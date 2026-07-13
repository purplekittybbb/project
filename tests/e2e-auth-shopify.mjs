/**
 * E2E: Full auth-mode Shopify connect flow (signup → connect → dashboard).
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const BASE = "http://localhost:3000";
const OUT = join(process.cwd(), "tests", "e2e-evidence");
mkdirSync(OUT, { recursive: true });

const email = `shopify-e2e-${Date.now()}@example.com`;
const password = "TestPass123!";

async function main() {
  const consoleErrors = [];
  const networkFailures = [];
  const steps = [];
  const log = (s, d) => { const l = `${new Date().toISOString()} ${s}: ${d}`; console.log(l); steps.push(l); return l; };

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(`[${msg.type()}] ${msg.text()}`); });
  page.on("pageerror", (err) => consoleErrors.push(`[pageerror] ${err.message}`));
  page.on("response", async (res) => {
    if (res.status() >= 400) {
      let body = "";
      try { body = (await res.text()).slice(0, 800); } catch { body = ""; }
      networkFailures.push({ url: res.url(), status: res.status(), body });
    }
  });

  try {
    log("AUTH1", `Signup ${email}`);
    await page.goto(`${BASE}/signup`, { waitUntil: "networkidle", timeout: 30000 });
    await page.locator("#fullName").fill("Shopify E2E");
    await page.locator("#company").fill("E2E Co");
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.getByRole("button", { name: /Open account|Create account/i }).click();
    await page.waitForTimeout(4000);
    await page.screenshot({ path: join(OUT, "auth-01-after-signup.png"), fullPage: true });
    log("AUTH1-url", page.url());

    // May need email confirm — try login if still on signup
    if (page.url().includes("/signup") || page.url().includes("/login")) {
      log("AUTH2", "Try login");
      await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
      await page.locator("#email").fill(email);
      await page.locator("#password").fill(password);
      await page.getByRole("button", { name: /Sign in/i }).click();
      await page.waitForTimeout(4000);
    }
    await page.screenshot({ path: join(OUT, "auth-02-after-login.png"), fullPage: true });
    log("AUTH2-url", page.url());

    log("CONNECT1", "Navigate /connect");
    await page.goto(`${BASE}/connect`, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: join(OUT, "auth-03-connect.png"), fullPage: true });
    const connectBody = await page.locator("body").innerText();
    log("CONNECT1-state", connectBody.slice(0, 200).replace(/\s+/g, " "));

    if (connectBody.includes("Connect your marketplaces")) {
      await page.getByRole("button", { name: /Connect Shopify/i }).click();
      await page.waitForTimeout(1200);
      await page.getByRole("button", { name: "Authorize" }).click();
      await page.waitForTimeout(5000);
      await page.screenshot({ path: join(OUT, "auth-04-after-oauth.png"), fullPage: true });

      await page.getByRole("button", { name: "Continue" }).click();
      await page.waitForTimeout(800);
      await page.getByRole("button", { name: "Start free trial" }).click();
      await page.waitForTimeout(800);
      await page.getByRole("button", { name: /Start free month/i }).click();
      await page.waitForTimeout(5000);
      await page.screenshot({ path: join(OUT, "auth-05-after-card.png"), fullPage: true });
      log("AUTH5-url", page.url());

      if (!page.url().includes("/dashboard")) {
        const cardErr = await page.locator("text=Deneme").count();
        log("AUTH5-blocked", `stillOnConnect=${page.url()} cardErrorHints=${cardErr}`);
      } else {
        await page.waitForTimeout(2000);
        await page.screenshot({ path: join(OUT, "auth-06-dashboard.png"), fullPage: true });
        const dash = await page.locator("body").innerText();
        log("AUTH6-result", `crash=${dash.includes("Application error")} noData=${dash.includes("No data yet")} shopify=${dash.includes("Shopify")} margin=${dash.includes("Real Margin")}`);
      }
    }
  } catch (err) {
    steps.push(log("FATAL", String(err)));
    await page.screenshot({ path: join(OUT, "auth-99-error.png"), fullPage: true }).catch(() => {});
  }

  const report = { email, steps, consoleErrors, networkFailures };
  writeFileSync(join(OUT, "report-auth-shopify.json"), JSON.stringify(report, null, 2));
  console.log("\n=== AUTH REPORT ===\n", JSON.stringify(report, null, 2));
  await browser.close();
}

main().catch(console.error);
