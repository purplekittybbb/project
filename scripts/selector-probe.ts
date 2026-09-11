/**
 * Selector probe — find title + price selectors in the new Trendyol DOM.
 */
import { chromium } from "playwright";
import { buildSearchUrl } from "../lib/scrapers/visibility";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    locale: "tr-TR",
  });
  const page = await context.newPage();
  const url = buildSearchUrl("trendyol", "usb c kablo", 1);
  await page.goto(url, { waitUntil: "networkidle", timeout: 20_000 });

  // Extract data-testid attributes and inner text from first card's children
  const cardData = await page.evaluate(() => {
    const cards = document.querySelectorAll('[data-testid="product-card"]');
    const results: Array<{ title: string; price: string; allTestIds: string[] }> = [];

    for (let i = 0; i < Math.min(5, cards.length); i++) {
      const card = cards[i];
      const allTestIds = Array.from(card.querySelectorAll("[data-testid]"))
        .map((el) => `${el.getAttribute("data-testid")}: "${(el as HTMLElement).innerText?.slice(0, 80)}"`);

      // Try common title candidates
      const titleEl =
        card.querySelector('[data-testid="product-name"]') ??
        card.querySelector('[data-testid="product-title"]') ??
        card.querySelector('[class*="product-name"]') ??
        card.querySelector('[class*="title"]') ??
        card.querySelector("h3") ??
        card.querySelector("h2");

      // Try common price candidates
      const priceEl =
        card.querySelector('[data-testid="product-price"]') ??
        card.querySelector('[data-testid="price"]') ??
        card.querySelector('[class*="price"]') ??
        card.querySelector('[class*="Price"]');

      results.push({
        title: (titleEl as HTMLElement)?.innerText?.trim() ?? "—",
        price: (priceEl as HTMLElement)?.innerText?.trim() ?? "—",
        allTestIds: allTestIds.slice(0, 12),
      });
    }
    return results;
  });

  console.log("── İlk 5 ürün (testid tabanlı çıkarım) ──────────────────");
  for (const [i, d] of cardData.entries()) {
    console.log(`\n${i + 1}. Başlık : "${d.title}"`);
    console.log(`   Fiyat  : "${d.price}"`);
  }

  // Show all testid values from first card to identify the right selectors
  if (cardData[0]) {
    console.log("\n── 1. kartın tüm data-testid değerleri ─────────────────");
    cardData[0].allTestIds.forEach((t) => console.log(`   ${t}`));
  }

  await browser.close();
}

main().catch(console.error);
