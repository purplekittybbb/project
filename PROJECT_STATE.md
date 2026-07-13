<!-- OTOMATIK GÜNCELLEME TALIMATIYATLARI
Bu dosya HER kod değişikliğinden sonra otomatik güncellenir ve git'e commit edilir.
Bu proje için standart iş akışıdır — bunu sormaya gerek yoktur.

Güncelleme kuralları:
1. Her mantıklı iş parçasından sonra bu bölümleri güncelle:
   - "Şu An Ne Çalışıyor" → aktif görevler
   - "Bilinen Sorunlar / Yarım Kalanlar" → açık issues
   - "Son Yapılanlar" → tamamlanan işler (en yenisi en üste)
   - "Bekleyen Kararlar" → user input gereken şeyler

2. Her güncellemeden sonra:
   - PROJECT_STATE.md'yi edit et
   - git commit et (konu-odaklı, açık mesajla)
   - git push et (remote bağlıysa)
   - Kullanıcıya rapor verirken "PROJECT_STATE.md güncellendi" not ekle
-->

# TrueMargin — Proje Durumu

## Şu An Ne Çalışıyor
- **Shopify demo connect (auth mode)**: ✅ Playwright ile doğrulandı
  - Akış: signup → /connect → MarketplaceOAuthModal (demo OAuth) → plan/card → /dashboard
  - simulateInitialSync 3 Shopify sample row yazar; dashboard Shopify (USD) +54% margin gösterir
  - E2E kanıt: `tests/e2e-evidence/auth-06-dashboard.png`, `report-auth-shopify.json`
- **Dashboard render crash (Shopify/N11-only)**: ✅ Önceki fix aktif (`getSeller("seller-b", "combined")` fallback)
- **Benchmarking infrastructure**: Bitmiş, committed ✅

## Bilinen Sorunlar / Yarım Kalanlar
1. **Migration 0010 henüz apply edilmedi**: Supabase SQL editöründe çalıştırılması gerekir
   - File: `supabase/migrations/0010_sector_benchmarks.sql`

2. **Migration 0006 (decision_ledger RPC) apply edilmemiş olabilir**
   - `/api/ledger/record` artık 502 yerine 200 + `{ recorded: false, reason: "rpc_unavailable" }` döner
   - Dashboard akışını bloklamaz; History sekmesi RPC apply edilene kadar boş kalabilir

3. **Demo mode (/demo) Shopify-only tab**: Seed seller-b'de shopify verisi yok — tab "Shopify" seçiliyken combined fallback gösterir (crash yok, UX karışıklığı)

## Son Yapılanlar
- **2026-07-13**: Shopify connect sorunu araştırıldı ve düzeltildi
  - **Kök neden (eski)**: Dashboard `view.currency` crash — channel=shopify iken seed fallback undefined (commit 329026f)
  - **Kök neden (güncel)**: Auth connect sonrası `/api/ledger/record` 502 — migration 0006 RPC eksik; F12'de kırmızı hata
  - **Fix**: ledger/record graceful degrade (200 rpc_unavailable); OAuth modal sync hatasını gösterir; Shopify view fallback testleri
  - **Doğrulama**: Playwright auth E2E — consoleErrors=[], networkFailures=[], dashboard Shopify SKU'ları görünür

- **2026-07-13**: Benchmarking infrastructure tamamlandı ve committed
- **2026-07-13**: Dashboard crash fix + onboarding redirect loop fix (329026f)

## Bekleyen Kararlar
1. **Migration 0006 + 0010 apply timeline**: Supabase production/staging?
2. **Live Shopify OAuth**: ShopifyConnectModal + /api/shopify/oauth/* hazır ama connect-step default demo OAuth

---

**Son güncelleme**: 2026-07-13 (Shopify connect fix + E2E doğrulama)  
**Sonraki adım**: Supabase'de migration 0006 ve 0010 apply
