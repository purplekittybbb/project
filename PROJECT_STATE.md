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
- **Benchmarking infrastructure**: Bitmiş, committed ✅
  - Pure core (lib/benchmarks/*): types, metrics, aggregate, rank, published
  - Cron: /api/cron/compute-benchmarks (service-role, k-anon pooling)
  - Read route: /api/benchmarks/segment (kullanıcı ranklama)
  - UI: PeerBenchmarkingSection.tsx (rewritten, bilingual, 6 metrics)
- **İçişleri**: Sonraki görev bekleniyor

## Bilinen Sorunlar / Yarım Kalanlar
1. **Migration 0010 henüz apply edilmedi**: Supabase SQL editöründe çalıştırılması gerekir
   - File: `supabase/migrations/0010_sector_benchmarks.sql`
   - Durum: Committed, waiting for user to apply

2. **Typecheck + full test suite verification**: Classifier outage nedeniyle verifylemedi
   - Pure core (17 vitest benchmark tests): ✅ PASS
   - Full `tsc` typecheck: ⏳ Pending (classifier recovery)
   - Full 157-test suite: ⏳ Pending (classifier recovery)
   - Browser render test: ⏳ Pending (classifier recovery)

3. **Benchmark pooled data activation**: K-anon=5 sellers ile başlar
   - Şu anda: Published (representative) fallback aktif
   - Live data: 5+ distinct sellers per segment

## Son Yapılanlar
- **2026-07-13**: Benchmarking infrastructure tamamlandı ve committed
  - Built: 5 pure libs (types, metrics, aggregate, rank, published)
  - Built: Cron route (service-role k-anon aggregation)
  - Built: Read route (/api/benchmarks/segment)
  - Built: Rewritten PeerBenchmarkingSection (6 metrics, bilingual, N disclosure)
  - Built: Migration 0010 (sector_benchmarks table + RLS)
  - Built: Vitest benchmarks (17 tests, all passing)
  - Fixed: Dashboard crash for Shopify/N11-only users (channel-proof fallback)
  - Committed: edf4214 "Fix dashboard render crash..." + PROJECT_STATE.md workflow setup

- **2026-07-13**: Dashboard crash fix (prior session context)
  - Root cause: View fallback undefined when channel had no seed data
  - Fix: getSeller("seller-b", "combined") instead of getSeller("seller-b", channel)
  - Verified: Live on seed seller's real Shopify data

- **2026-07-13**: Bilingual i18n rollout (prior session context)
  - Added EN/TR language selector to Settings
  - Gemini system_instruction with single-language directive (no mixing)
  - Display-only translator for engine text (rationale, benchmark labels)
  - Rule-based bilingual fallback (11 branches, EN+TR)
  - Fixed: demoMode/Supabase session bleed prevention

## Bekleyen Kararlar
1. **Migration 0010 apply timeline**: Ne zaman çalıştırılacak?
   - Supabase production ortamı mı, staging mi?
   - Cron trigger zamanı (şu an: 02:30 UTC daily)

2. **Benchmark pooled data activation strategy**: İlk K-anon segmentleri ne zaman bekleniyor?
   - Current cohort size estimates?
   - Monitoring strategy for pooled activation?

3. **Next phase features** (enterprise roadmap):
   - Indexing improvements (daha hızlı sorgulamalar)
   - K-anon configurability via env var (K_ANONYMITY_THRESHOLD)
   - CI/CD pipeline enhancements
   - Fallback logging improvements

---

**Son güncelleme**: 2026-07-13 (benchmarking infrastructure tamamlanması)  
**Sonraki adım**: User will apply migration 0010, trigger compute-benchmarks cron
