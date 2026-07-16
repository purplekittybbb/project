/**
 * One-off E2E script: Shopify demo connect flow on /connect?preview=connect
 * Captures console errors, failed network requests, and screenshots.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const BASE = process.env.E2E_BASE ?? "http://localhost:3001";
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
      try {
        body = (await res.text()).slice(0, 500);
      } catch {
        body = "(unreadable)";
      }
      networkFailures.push({ url: res.url(), status, body });
    }
  });

  const log = (step, detail) => {
    const line = `${new Date().toISOString()} ${step}: ${detail}`;
    console.log(line);
    return line;
  };
  const steps = [];

  try {
    // Step 1: /connect with preview mode (bypasses auth redirect in demo)
    steps.push(log("STEP1", "Navigate /connect?preview=connect"));
    await page.goto(`${BASE}/connect?preview=connect`, { waitUntil: "networkidle", timeout: 30000 });
    await page.screenshot({ path: join(OUT, "01-connect-page.png"), fullPage: true });

    // Step 2: Click Connect Shopify
    steps.push(log("STEP2", "Click Connect Shopify button"));
    const shopifyBtn = page.getByRole("button", { name: /Connect Shopify/i });
    await shopifyBtn.waitFor({ timeout: 10000 });
    await shopifyBtn.click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: join(OUT, "02-oauth-modal-consent.png"), fullPage: true });

    // Step 3: Authorize in OAuth modal
    steps.push(log("STEP3", "Click Authorize"));
    const authorizeBtn = page.getByRole("button", { name: "Authorize" });
    await authorizeBtn.waitFor({ timeout: 10000 });
    await authorizeBtn.click();

    // Wait for connected phase + modal close
    await page.waitForTimeout(4000);
    await page.screenshot({ path: join(OUT, "03-after-authorize.png"), fullPage: true });

    const connectedText = await page.locator("text=Connected ✓").count();
    steps.push(log("STEP3-result", `Connected badges on page: ${connectedText}`));

    // Step 4: Continue to plan step
    steps.push(log("STEP4", "Click Continue"));
    const continueBtn = page.getByRole("button", { name: "Continue" });
    await continueBtn.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(OUT, "04-plan-step.png"), fullPage: true });

    // Step 5: Start free trial
    steps.push(log("STEP5", "Start free trial"));
    await page.getByRole("button", { name: "Start free trial" }).click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(OUT, "05-card-step.png"), fullPage: true });

    // Step 6: Finish onboarding → dashboard
    steps.push(log("STEP6", "Submit demo card → dashboard"));
    await page.getByRole("button", { name: /Start free month/i }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 15000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: join(OUT, "06-dashboard.png"), fullPage: true });

    const dashboardUrl = page.url();
    const bodyText = await page.locator("body").innerText();
    const hasCrash = bodyText.includes("couldn't load") || bodyText.includes("Application error");
    const hasNoData = bodyText.includes("No data yet");
    const hasDashboard = bodyText.includes("Real Margin") || bodyText.includes("Dashboard");

    steps.push(log("STEP6-result", `url=${dashboardUrl} crash=${hasCrash} noData=${hasNoData} dashboard=${hasDashboard}`));

    // Step 7: Try /connect again with shopify only connected, re-enter dashboard
    steps.push(log("STEP7", "Direct /dashboard navigation after onboarding"));
    await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle", timeout: 15000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: join(OUT, "07-dashboard-revisit.png"), fullPage: true });

    const bodyText2 = await page.locator("body").innerText();
    steps.push(
      log(
        "STEP7-result",
        `crash=${bodyText2.includes("couldn't load") || bodyText2.includes("Application error")} noData=${bodyText2.includes("No data yet")}`
      )
    );
  } catch (err) {
    steps.push(log("FATAL", String(err)));
    await page.screenshot({ path: join(OUT, "99-error-state.png"), fullPage: true }).catch(() => {});
  }

  const report = {
    timestamp: new Date().toISOString(),
    steps,
    consoleErrors,
    networkFailures,
    allConsole: allConsole.slice(-50),
  };

  writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log("\n=== REPORT ===");
  console.log(JSON.stringify(report, null, 2));

  await browser.close();
  process.exit(consoleErrors.length > 0 || networkFailures.some((f) => f.status >= 500) ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
