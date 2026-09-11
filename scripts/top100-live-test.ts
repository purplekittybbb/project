/**
 * Top 100 — Manuel Canlı Test Scripti
 *
 * KULLANIM:
 *   npx tsx scripts/top100-live-test.ts --marketplace trendyol --keyword "bluetooth kulaklık"
 *   npx tsx scripts/top100-live-test.ts --marketplace trendyol --keyword "laptop çantası" --maxItems 36
 *
 * KISITLAR:
 *   - Bu script SADECE manuel tetiklemeli. Cron veya otomasyona bağlanmaz.
 *   - İlk çalıştırma kullanıcı gözetiminde yapılır.
 *   - DB'ye kayıt: migration 0025 uygulanana kadar KAPALI (DB_SAVE=true env ile açılır).
 *   - Circuit breaker 2 ardışık block sinyalinde taramayı durdurur.
 *   - Sayfalar arası 2-5 saniye rastgele gecikme aktif.
 *
 * ÇEVRE DEĞİŞKENLERİ:
 *   DB_SAVE=true          — Sonuçları top100_snapshots/top100_items tablolarına yaz
 *                           (0025 migrasyonu uygulanmadan açma)
 *   SCRAPE_DELAY_MIN_MS   — Gecikme alt sınırı ms (varsayılan: 2000)
 *   SCRAPE_DELAY_MAX_MS   — Gecikme üst sınırı ms (varsayılan: 5000)
 */

import { resolve } from "path";
import { config as loadDotenv } from "dotenv";
import { chromium } from "playwright";
import { analyzeTop100, type Top100Marketplace } from "../lib/demand/top100";

loadDotenv({ path: resolve(process.cwd(), ".env.local") });

// ── CLI argümanları ───────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : undefined;
  };

  const marketplace = (get("--marketplace") ?? "trendyol") as Top100Marketplace;
  const keyword = get("--keyword");
  const maxItems = parseInt(get("--maxItems") ?? "36", 10); // default: 1 sayfa (36 ürün)

  if (!keyword) {
    console.error("HATA: --keyword parametresi zorunlu.");
    console.error("Örnek: npx tsx scripts/top100-live-test.ts --marketplace trendyol --keyword \"bluetooth kulaklık\"");
    process.exit(1);
  }

  if (!["trendyol", "hepsiburada", "n11"].includes(marketplace)) {
    console.error("HATA: --marketplace değeri 'trendyol', 'hepsiburada' veya 'n11' olmalı.");
    process.exit(1);
  }

  return { marketplace, keyword, maxItems: Math.min(maxItems, 100) };
}

// ── Ana fonksiyon ─────────────────────────────────────────────────────────────

async function main() {
  const { marketplace, keyword, maxItems } = parseArgs();
  const dbSave = process.env.DB_SAVE === "true";

  console.log("═══════════════════════════════════════════════════════════════");
  console.log(" Top 100 Manuel Canlı Test");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(" Marketplace :", marketplace);
  console.log(" Keyword     :", keyword);
  console.log(" maxItems    :", maxItems);
  console.log(" DB kayıt    :", dbSave ? "AÇIK ⚠️" : "KAPALI (güvenli)");
  console.log(" Gecikme     :", process.env.SCRAPE_DELAY_MIN_MS ?? "2000", "–",
    process.env.SCRAPE_DELAY_MAX_MS ?? "5000", "ms");
  console.log("───────────────────────────────────────────────────────────────");
  console.log(" Circuit breaker aktif: 2 ardışık blok sinyalinde durur.");
  console.log(" İptal: Ctrl+C");
  console.log("═══════════════════════════════════════════════════════════════\n");

  // ── Tarayıcı oturumu ──────────────────────────────────────────────────────
  console.log("[browser] Chromium başlatılıyor...");
  const browser = await chromium.launch({
    headless: true, // headless=false yaparak görsel izleme de mümkün
    args: [
      "--no-sandbox",
      "--disable-blink-features=AutomationControlled",  // bot tespiti azaltır
    ],
  });

  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
    viewport: { width: 1280, height: 800 },
  });

  const browserPage = await context.newPage();

  // ScraperPage adaptör — Playwright page'i lib/scrapers/ arayüzüne uyarlar
  const scraperPage = {
    goto:              (url: string, opts?: { waitUntil?: string; timeout?: number }) =>
                         browserPage.goto(url, opts as Parameters<typeof browserPage.goto>[1]),
    content:           () => browserPage.content(),
    evaluate:          <T>(fn: (...args: unknown[]) => T, ...args: unknown[]) =>
                         browserPage.evaluate(fn as Parameters<typeof browserPage.evaluate>[0], ...args) as Promise<T>,
    waitForSelector:   (sel: string, opts?: { timeout?: number }) =>
                         browserPage.waitForSelector(sel, opts),
  };

  try {
    // ── Analiz çalıştır ────────────────────────────────────────────────────
    console.log(`[top100] Tarama başlıyor... (${new Date().toLocaleTimeString("tr-TR")})\n`);

    const result = await analyzeTop100(
      { marketplace, keyword, maxItems },
      scraperPage,
    );

    // ── Sonuçları yazdır ───────────────────────────────────────────────────
    console.log("\n═══════════════════════════════════════════════════════════════");
    console.log(" SONUÇ");
    console.log("═══════════════════════════════════════════════════════════════");
    console.log(` Toplanan ürün      : ${result.items.length}${result.isPartial ? " (kısmi)" : ""}`);
    console.log(` Aggregate güven    : ${result.aggregateConfidence}/100`);
    if (result.error) {
      console.log(` ⚠️  Hata/Uyarı     : ${result.error}`);
    }
    console.log("\n Fiyat İstatistikleri:");
    console.log(`   Min: ${result.priceStats.min.toFixed(2)} TL`);
    console.log(`   P25: ${result.priceStats.p25.toFixed(2)} TL`);
    console.log(`   P50: ${result.priceStats.p50.toFixed(2)} TL`);
    console.log(`   P75: ${result.priceStats.p75.toFixed(2)} TL`);
    console.log(`   Max: ${result.priceStats.max.toFixed(2)} TL`);

    if (result.reviewStats) {
      console.log("\n Yorum Sayısı İstatistikleri:");
      console.log(`   P25: ${result.reviewStats.p25.toFixed(0)}`);
      console.log(`   P50: ${result.reviewStats.p50.toFixed(0)}`);
      console.log(`   P75: ${result.reviewStats.p75.toFixed(0)}`);
    }

    if (result.entryBarrierEstimate != null) {
      console.log(`\n Giriş Bariyeri (top-20 medyan yorum): ${result.entryBarrierEstimate}`);
    }

    console.log("\n İlk 10 Ürün:");
    for (const item of result.items.slice(0, 10)) {
      const demand = item.demandEstimate;
      console.log(
        `   #${String(item.rank).padStart(3, " ")}  ${item.price.toFixed(0).padStart(6)} TL` +
        `  [talep: ${demand.rangeLow}–${demand.rangeHigh}/ay, güven: ${demand.confidenceLevel}]` +
        (item.reviewCount != null ? `  (${item.reviewCount} yorum)` : "") +
        `  ${item.title.slice(0, 50)}`,
      );
    }

    // ── DB kayıt (sadece DB_SAVE=true ise) ────────────────────────────────
    if (dbSave) {
      const supabaseUrl    = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (!supabaseUrl || !serviceRoleKey) {
        console.error("\n[db] HATA: NEXT_PUBLIC_SUPABASE_URL veya SUPABASE_SERVICE_ROLE_KEY eksik.");
      } else {
        const { createClient } = await import("@supabase/supabase-js");
        const { saveTop100Snapshot } = await import("../lib/supabase/top100-snapshots");

        const supabase = createClient(supabaseUrl, serviceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        console.log("\n[db] Snapshot kaydediliyor...");
        const { snapshotId, error } = await saveTop100Snapshot(supabase, result);
        if (error) {
          console.error("[db] Kayıt hatası:", error);
          console.error("[db] Migration 0025 uygulandı mı? Kontrol et: supabase migration list");
        } else {
          console.log("[db] Kaydedildi. snapshotId:", snapshotId);
        }
      }
    } else {
      console.log("\n[db] DB kayıt KAPALI. Kaydetmek için DB_SAVE=true ile çalıştır.");
    }

    console.log("\n═══════════════════════════════════════════════════════════════");
    console.log(` Tamamlandı: ${result.analysedAt}`);
    console.log("═══════════════════════════════════════════════════════════════\n");

  } finally {
    await browser.close();
    console.log("[browser] Chromium kapatıldı.");
  }
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
