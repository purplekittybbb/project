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

3. NOT: Bu proje hem Claude Code hem Cursor'dan paralel geliştiriliyor
   (aynı repo, aynı çalışma dizini). Bir oturuma başlamadan önce HER ZAMAN
   `git log --oneline -10` ve `git status` ile diğer araçta ne olduğunu
   kontrol et — mükerrer araştırma/iş yapmaktan kaçının.
-->

# TrueMargin — Proje Durumu

## Şu An Ne Çalışıyor
- **Shopify connect akışı**: ✅ Çözüldü (hem Cursor hem Claude Code tarafında doğrulandı)
- **Sector Benchmark / pooled-cohort altyapısı**: ✅ Tamamlandı, sertleştirildi, committed
- Aktif geliştirme yok — bir sonraki görev bekleniyor

## Bilinen Sorunlar / Yarım Kalanlar
1. **Migration 0010 (sector_benchmarks) henüz Supabase'e apply edilmedi**
   - File: `supabase/migrations/0010_sector_benchmarks.sql`
   - Etkisi: `/api/benchmarks/segment` şu an her zaman "published" (representative) veri döner;
     kod tarafı hazır, migration apply edilip cron bir kez tetiklenince "pooled" (canlı) veri devreye girer
   - Log kanıtı: `[benchmark-fallback] reason:"unmigrated" ... PGRST205` (tekrarlı ama zararsız — artık redundant değil, bkz. madde 3)

2. **Migration 0006 (decision_ledger RPC — record_decision_if_changed) apply edilmemiş olabilir**
   - `/api/ledger/record` artık migration eksikken 502 DEĞİL, 200 + `{recorded:false, reason:"rpc_unavailable"}` döner (commit 4af7308)
   - Dashboard/Shopify connect akışını bloklamaz; History sekmesi migration apply edilene kadar boş kalabilir

3. **[ÇÖZÜLDÜ 2026-07-13] Benchmark panel gereksiz tekrar network çağrısı**
   - `PeerBenchmarkingSection`'daki fetch effect'i, memoize edilmemiş `view` objesine bağımlıydı
   - Etkisi: dashboard ilk yüklenirken ~6 saniyede 8-11 kez aynı `/api/benchmarks/segment` çağrısı (hata değil, gereksiz trafik)
   - Fix: `viewSignature` (primitive string) türetilip effect bağımlılığı ona çevrildi — commit 4f1be0a

4. **Demo mode (/demo) Shopify-only tab**: Seed seller-b'de shopify verisi yok — tab "Shopify" seçiliyken combined fallback gösterir (crash yok, sadece UX karışıklığı)

## Son Yapılanlar
- **2026-07-13**: Benchmark panelindeki redundant fetch loop'u düzelttim (Claude Code)
  - Kök neden: `view` her render'da yeni referans; `useEffect([...,view])` her parent re-render'da tekrar ateşleniyordu
  - Canlı kanıt: dev log'da aynı `/api/benchmarks/segment` isteği 550-650ms aralıklarla 8-11 kez tekrarlanıyordu (tek sayfa yüklemesinde)
  - Fix: primitive `viewSignature` ile stabilize edildi — commit `4f1be0a`
  - Doğrulama: `tsc --noEmit` temiz, 176/176 test geçti, `/demo` regresyon yok
  - NOT: Bu, kullanıcının orijinal "Shopify bağlantı hatası" şikayetiyle İLGİSİZ — araştırma sırasında bulundu, ayrıca düzeltildi

- **2026-07-13**: Cursor'un commit etmediği benchmark fallback-logging sertleştirmesini commit ettim
  - `lib/benchmarks/fallback-log.ts` (yeni) + segment/route.ts, compute-benchmarks/route.ts, published.ts güncellemeleri
  - `K_ANONYMITY_THRESHOLD` env var ile k-anon eşiği artık konfigüre edilebilir
  - Commit: `ea514dd`

- **2026-07-13 (Cursor, bu konuşmadan önce)**: Shopify connect'in GERÇEK kök nedeni bulundu ve düzeltildi — `4af7308`
  - **Kök neden**: Shopify demo OAuth bağlantısı BAŞARIYLA tamamlanıyordu, ama dashboard'a ulaşır ulaşmaz
    `recordLedgerDecision()` → `/api/ledger/record` → `record_decision_if_changed` RPC'si (migration 0006 apply
    edilmediği için) başarısız oluyor ve route sert bir 502 dönüyordu — tarayıcı konsolunda kırmızı hata olarak görünüyordu
  - **Fix**: RPC yoksa 502 yerine 200 + `{recorded:false, reason:"rpc_unavailable"}` (graceful degrade)
  - **Ek**: `simulateInitialSync` artık hatasını `MarketplaceOAuthModal`'a görünür şekilde yüzeye çıkarıyor (önceden sessizce yutuluyordu)
  - **E2E kanıt**: Playwright ile GERÇEK sıfırdan signup (`shopify-e2e-*@example.com`) → connect → Shopify demo OAuth →
    plan → card → dashboard. Sonuç: `consoleErrors: []`, `networkFailures: []`, `crash=false`. Kanıt dosyası:
    `tests/e2e-evidence/report-auth-shopify.json`, ekran görüntüleri `auth-01..06-*.png`
  - Bu konuşmada (Claude Code) BENZER bir demo-reconnect testi bağımsız olarak tekrarlandı (mevcut hesapla) — aynı sonuç: temiz, hatasız

- **2026-07-13**: Benchmarking infrastructure tamamlandı ve committed (Claude Code, commit `47ed6a5` öncesi)
- **2026-07-13**: Dashboard crash fix + onboarding redirect loop fix (`edf4214`, `329026f`)

## Bekleyen Kararlar
1. **Migration 0006 + 0010 apply timeline**: Supabase production/staging ortamına ne zaman uygulanacak?
2. **Live Shopify OAuth**: `ShopifyConnectModal` + `/api/shopify/oauth/*` (gerçek Partner OAuth) hazır ama connect-step
   varsayılanı hâlâ demo OAuth modal'ı — gerçek Shopify entegrasyonuna ne zaman geçilecek?
3. **tests/e2e-evidence/** dizininde bazı eski/başarısız debug taramaları var (`99-error*.png`, `report.json` — port
   3001 bağlantı hatası içeriyor, muhtemelen yanlışlıkla farklı porta işaret etmiş). Temizlenmeli mi, yoksa referans
   için mi kalsın?

## Paralel Geliştirme Notu
Bu proje AYNI ANDA hem Claude Code hem Cursor'dan geliştiriliyor olabilir (aynı dizin, aynı git repo). Commit
mesajlarında `Co-authored-by: Cursor` görürsen, o iş zaten Cursor tarafından tamamlanmış demektir — tekrar araştırma
yapmadan önce `git log` ve ilgili dosyaları oku.

---

**Son güncelleme**: 2026-07-13 (benchmark fetch-loop fix + Cursor'un Shopify fix'i entegre edildi)
**Sonraki adım**: Supabase'de migration 0006 ve 0010 apply edilmeli
