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

## Shopify Entegrasyonu — DURUM: KARIŞIK (bu deployment'ta LIVE, credential'sız deployment'larda DEMO)
Bu ortamda (`.env.local`'da `SHOPIFY_CLIENT_ID`/`SHOPIFY_CLIENT_SECRET` tanımlı) `/connect` sayfasındaki
"Connect Shopify" butonu artık **gerçek** Shopify Partner OAuth'una gidiyor (canlı doğrulandı — aşağıya bak).
`SHOPIFY_CLIENT_ID` tanımlı OLMAYAN bir deployment'ta ise otomatik olarak demo moda düşer — ve o demo modu artık
"Demo mode — no real {platform} account is contacted" şeklinde AÇIKÇA etiketleniyor (öncesinde sadece küçük,
kolayca gözden kaçan bir "demo consent" rozeti vardı).

## Şu An Ne Çalışıyor
- **Shopify gerçek OAuth kablolaması**: ✅ Tamamlandı, canlı doğrulandı, committed
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
- **2026-07-13**: Shopify "sahte bağlantı" sorunu teşhis edildi ve düzeltildi (Claude Code)
  - **Teşhis (kullanıcının şüphesi doğru çıktı)**: `/connect`'te "Connect Shopify" butonu HİÇBİR ZAMAN gerçek
    Shopify kimlik doğrulaması istemiyordu — `MarketplaceConnectStep.startConnect()` Shopify dahil TÜM oauth-tipi
    pazaryerlerini kayıtsız şartsız demo consent modal'ına (`MarketplaceOAuthModal`) yönlendiriyordu. Bu modal
    `completeDemoLink()` ile SADECE localStorage'a "bağlandı" yazıyor, `simulateInitialSync()` ile örnek/seed
    satırları `user_transactions`'a yazıyordu — kullanıcının gerçek mağazasına HİÇ dokunulmuyordu. Bu davranış
    `tests/shopify-live-enabled.test.ts`'te AÇIKÇA test edilip "doğru" kabul edilmişti (`pickShopifyConnectStepModal`
    her zaman `"MarketplaceOAuthModal"` döndürüyordu, `liveEnabled` parametresi görmezden geliniyordu).
  - **Önemli bulgu**: Gerçek Shopify Partner OAuth entegrasyonu (`ShopifyConnectModal.tsx` + `/api/shopify/oauth/
    start` + `/api/shopify/oauth/callback` + `lib/shopify-api/client.ts` — gerçek HMAC doğrulama, gerçek GraphQL
    Admin API, şifreli token saklama) TAM VE ÇALIŞIR DURUMDA kod olarak zaten yazılmıştı, ve bu deployment'ta
    `SHOPIFY_CLIENT_ID`/`SHOPIFY_CLIENT_SECRET` bile `.env.local`'da TANIMLIYDI — ama UI hiçbir zaman bu kodu
    çağırmıyordu. Yani senaryo ne saf "hiç kurulmadı" (2a) ne saf "hatalı çalışıyor" (2b) — backend hazır ve
    kullanılabilirdi ama kasıtlı olarak devre dışı bırakılmıştı.
  - **Fix 1 (gerçek bağlantıyı aç)**: `MarketplaceConnectStep.tsx`'te `isShopifyLiveEnabled()` true ise (yani
    live credential varsa) "Connect Shopify" artık `ShopifyConnectModal`'ı açıyor — gerçek mağaza domaini sorup
    gerçek `https://{shop}.myshopify.com/admin/oauth/authorize` adresine yönlendiriyor.
  - **Fix 2 (şeffaflık — credential yoksa)**: `MarketplaceOAuthModal`'a göze çarpan amber bir uyarı bandı eklendi:
    "Demo mode — no real {platform} account is contacted." + CSV/manuel girişe yönlendirme. "Connected ✓" ekranı
    da artık "· demo — sample data" diyor. Bağlı listesindeki demo bağlantılar "· demo, sample data" etiketi taşıyor
    (manuel/CSV girişleri hariç — onlar zaten gerçek kullanıcı verisi). Buton metni credential yoksa
    "Connect Shopify (Demo)" oluyor.
  - **CANLI KANIT (gerçek Shopify altyapısına ulaştığı ispatı)**: Var olmayan bir mağaza adıyla
    ("truemargin-diagnostic-check-nonexistent") "Continue to Shopify" tıklandı → tarayıcı GERÇEKTEN
    `https://truemargin-diagnostic-check-nonexistent.myshopify.com` adresine yönlendirildi → Shopify'ın KENDİ
    gerçek "Store unavailable" hata sayfası döndü (yerel mock DEĞİL). Uygulamaya geri dönüldüğünde Shopify
    "Connected" listesinde GÖRÜNMEDİ — başarısız/var olmayan mağaza denemesi asla sahte bir "bağlandı" durumu
    yaratmadı.
  - **Test güncellendi**: `tests/shopify-live-enabled.test.ts` artık `pickShopifyConnectStepModal(true)` için
    `"ShopifyConnectModal"` bekliyor (eskiden yanlışlıkla `"MarketplaceOAuthModal"` bekliyordu — davranışı DEĞİL,
    testin YANLIŞ varsayımını düzelttim).
  - Doğrulama: `tsc --noEmit` temiz, 176/176 test geçti, canlı tarayıcı testi yukarıdaki gibi.
  - **DÜZELTİLMEDİĞİ NOKTA**: `SHOPIFY_CLIENT_ID` tanımlı OLMAYAN bir deployment (örn. Vercel prod, eğer oraya
    henüz eklenmediyse) hâlâ demo moda düşer — ama artık AÇIKÇA etiketlenmiş demo moda, sessiz sahte veriye değil.

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
2. **Vercel production'da `SHOPIFY_CLIENT_ID`/`SHOPIFY_CLIENT_SECRET` tanımlı mı?** — Bu sadece bu makinenin
   `.env.local`'ında doğrulandı. Prod'da tanımlı DEĞİLSE, gerçek kullanıcılar hâlâ (artık açıkça etiketlenmiş) demo
   moda düşecek. Tanımlıysa `/api/shopify/oauth/callback`'in redirect URI'si (`{origin}/api/shopify/oauth/callback`)
   Shopify Partner App ayarlarında "Allowed redirection URL" olarak kayıtlı olmalı — kontrol edilmeli.
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
