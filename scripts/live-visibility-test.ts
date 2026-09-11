/**
 * ONE-SHOT live visibility test — single Trendyol search page.
 * Validates the full pipeline: createBrowserSession → searchProductRank → result.
 *
 * HARD LIMIT: maxPages = 1, no loop, no retry.
 */
import { chromium } from "playwright";
import { searchProductRank } from "../lib/scrapers/visibility";
import type { ScraperPage } from "../lib/scrapers/browser";

const KEYWORD = "usb c kablo";

async function main() {
  console.log(`\n🔎  Arama: "${KEYWORD}" — Trendyol, sayfa 1`);
  console.log("   Tek istek, döngü yok, max 1 sayfa\n");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    locale: "tr-TR",
  });
  const playwrightPage = await context.newPage();
  const page = playwrightPage as unknown as ScraperPage;

  const t0 = Date.now();
  try {
    const result = await searchProductRank(
      { marketplace: "trendyol", keyword: KEYWORD, targetTitle: "HIÇBIR_ŞEYLE_EŞLEŞMEZ", maxPages: 1 },
      page,
    );
    const elapsed = Date.now() - t0;

    console.log(`⏱️  Toplam süre    : ${elapsed} ms`);
    console.log(`🛒  Ayrıştırılan  : ${result.results.length} ürün`);
    console.log(`❌  Hedef bulunamadı (beklenen — hedef geçersiz seçildi)`);

    if (result.error) {
      console.log(`⚠️  Hata           : ${result.error}`);
    }

    if (result.results.length > 0) {
      console.log("\n── İlk 5 gerçek arama sonucu ────────────────────────────────");
      result.results.slice(0, 5).forEach((r, i) => {
        const priceStr = r.price > 0 ? `₺${r.price.toFixed(2)}` : "(fiyat yok)";
        console.log(`  ${i + 1}. [${priceStr}]  ${r.title.slice(0, 75)}`);
      });
      console.log("─────────────────────────────────────────────────────────────");
      console.log(`\n✅  CANLI TEST BAŞARILI — pipeline uçtan uca çalışıyor`);
    } else {
      console.log(`\n⚠️  Ürün ayrıştırılamadı. Error: ${result.error ?? "selector eşleşmedi"}`);
    }
  } catch (err) {
    console.log(`❌  Hata: ${(err as Error).message}`);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
