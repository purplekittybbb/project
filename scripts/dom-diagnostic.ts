/**
 * DOM diagnostic — what product-related elements actually exist after full load?
 * Single request, headless Chromium.
 */
import { chromium } from "playwright";
import { buildSearchUrl } from "../lib/scrapers/visibility";

async function main() {
  const url = buildSearchUrl("trendyol", "usb c kablo", 1);
  console.log(`URL: ${url}\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    locale: "tr-TR",
  });
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 20_000 });
    console.log(`networkidle @ ${Date.now()} ms`);

    // Check candidate selectors
    const selectors = [
      ".p-card-wrppr",
      ".product-card",
      "[data-testid='product-card']",
      "[class*='productCard']",
      "[class*='product-card']",
      "[class*='p-card']",
      ".srch-prdct-block",
      ".search-result",
      "article",
    ];

    for (const sel of selectors) {
      const count = await page.locator(sel).count();
      if (count > 0) console.log(`  ✅  ${sel.padEnd(35)} → ${count} eleman`);
      else               console.log(`  ✗   ${sel.padEnd(35)} → 0`);
    }

    // Show first product-like element's outer HTML (first 400 chars)
    const firstCard = page.locator("article, [class*='card'], [class*='product']").first();
    if (await firstCard.count() > 0) {
      const html = await firstCard.evaluate((el) => el.outerHTML.slice(0, 500));
      console.log(`\nİlk eşleşen elemanın HTML'i:\n${html}`);
    }

    // Also grab page title to confirm it's the right page
    const title = await page.title();
    console.log(`\nSayfa başlığı: ${title}`);

  } catch (err) {
    console.log(`Hata: ${(err as Error).message}`);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
