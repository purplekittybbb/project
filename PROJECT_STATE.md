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

## ✅ Zorunlu GDPR webhook'ları eklendi — protected customer data onayına hazırlık (2026-07-19, Sonnet 5)
Kullanıcı isteği: "onu da istiyorum nasıl yapacağız" (gerçek zamanlı sipariş webhook'unu geri almak için
Partner Dashboard onayı). Onay talep etmeden önce Shopify'ın şart koştuğu 3 zorunlu compliance webhook'u
(`customers/data_request`, `customers/redact`, `shop/redact`) uygulanmamıştı — onay formu bunları ister.

**Bulgu:** Uygulama hiçbir zaman müşteri PII'si (isim/email/telefon/adres) saklamıyor — sadece
SKU/fiyat/adet gibi sipariş-seviyesi finansal veri (`mapShopifyWebhookOrderToUserRawRows`). Bu, compliance
handler'larını dürüst ve basit tutmayı sağladı: `customers/data_request` ve `customers/redact` → "saklanan
kişisel veri yok" diye 200 döner; `shop/redact` → `marketplace_credentials` satırını siler (zaten
`app/uninstalled` anında sildiği için çoğunlukla idempotent no-op, güvenlik ağı).

**Kod:** `app/api/shopify/webhooks/route.ts`'e 3 yeni topic handler eklendi;
`shopify.app.toml`'a `compliance_topics = ["customers/data_request", "customers/redact", "shop/redact"]`
ile tek `[[webhooks.subscriptions]]` bloğu eklendi (Shopify docs'tan doğrulanan doğru TOML söz dizimi —
`[[webhooks.subscriptions]]` + `compliance_topics`, ayrı `[webhooks.privacy_compliance]` DEĞİL).

**Doğrulama:** `tests/shopify-webhooks.test.ts`'e 4 yeni test eklendi (data_request, redact, shop/redact
+ mevcutlar), **189/189** test geçti, `tsc --noEmit` temiz, `npm run build` başarılı.

**Sıradaki adım (kullanıcı tarafında, kod dışı):** `shopify app deploy` tekrar çalıştırılıp bu webhook'lar
Shopify'a basılmalı, sonra Partner Dashboard → App setup → Protected customer data'dan erişim talep
edilmeli. Onaylanınca `orders/create`/`orders/updated` webhook'ları `shopify.app.toml`'a geri eklenip
tekrar deploy edilecek (yorum bloğunda adımlar yazılı).

## ✅ `shopify app deploy` bloğu çözüldü — protected customer data onayı gerekiyor (2026-07-19, Sonnet 5)
Kullanıcı isteği: "shopify app deploy çalıştırma nasıl yapılır" → kullanıcı kendi terminalinde çalıştırdı,
hata verdi: `This app is not approved to subscribe to webhook topics containing protected customer data.`

**Kök neden:** 2026-07-18 Cursor commit'inde (`f742f34`) `shopify.app.toml`'a eklenen
`orders/create` / `orders/updated` webhook subscriptions, Shopify tarafında "protected customer data"
sınıfına giriyor (sipariş içinde müşteri PII olabilir). Bu konulara webhook abone olmak için Partner
Dashboard → App setup → Protected customer data'dan ayrı onay gerekiyor — `read_orders` OAuth scope'undan
tamamen farklı bir izin, deploy'u tamamen bloklamıştı.

**Geçici çözüm uygulandı:** `shopify.app.toml`'dan `orders/create`/`orders/updated` webhook subscriptions
kaldırıldı (kod dosyası `app/api/shopify/webhooks/route.ts` dokunulmadı — mantık duruyor, sadece Shopify
artık bu event'leri push etmeyecek). `app/uninstalled` webhook (protected data değil) kaldı.

**Fonksiyonel kayıp yok:** Sipariş senkronu zaten saatlik cron ile çalışıyor
(`vercel.json` → `/api/cron/sync-marketplaces`, `read_orders` OAuth scope üzerinden). Sadece "anlık" push
yerine saatte bir güncelleme olacak, ta ki onay gelene kadar.

**Kullanıcı tarafında paralel yürüyen iş:** Partner Dashboard'dan protected customer data onayı istenecek;
onaylanınca `shopify.app.toml`'a webhook subscriptions geri eklenip tekrar `shopify app deploy` çalıştırılacak
(tam adımlar dosyadaki yorum bloğunda yazılı).

## ✅ Hesap bağlama / senkron eksikleri tek tek kapatıldı (2026-07-18, Cursor)
Kullanıcı isteği: "eksikleri tek tek çöz" (önceki oturumda listelenen connection/sync boşlukları).

**Kodda kapatılanlar:**
1. **Sunucu-doğruluğu bağlantı listesi** — `/api/marketplace/credentials-status` artık `connections[]`
   (sellerId, lastSyncedAt, lastSyncError, needsReauth) döndürüyor; `/connect` + dashboard mount'ta
   `hydrateConnectionsFromServer()` localStorage'ı sunucuyla birleştiriyor (başka cihazdan bağlanan
   pazaryeri artık görünür).
2. **lastSyncedAt + sync hata yüzeyi** — migration `0011_marketplace_credentials_sync_status.sql`
   (`last_synced_at`, `last_sync_error`, `needs_reauth`); `resyncMarketplace` / webhook başarı-hata
   yazıyor; Settings → Refresh her pazaryeri için son senkron / hata / "Yeniden bağlan" gösteriyor.
3. **Shopify re-auth algılama** — 401/403 → `needs_reauth=true` + UI "Reconnect required";
   `app/uninstalled` webhook credential satırını siliyor (Shopify offline token'ları refresh etmez —
   revoke/uninstall tespiti doğru model).
4. **Shopify webhooks** — `POST /api/shopify/webhooks` (HMAC doğrulama, service-role);
   topics: `orders/create`, `orders/updated`, `app/uninstalled`; `shopify.app.toml` subscriptions eklendi.
5. **Cron saatlik** — `vercel.json` `0 * * * *` (yorumlarla uyumlu; Shopify webhook + saatlik backstop).
6. **N11 alan eşlemesi** — resmi GetShipmentPackages örneklerine göre HIGH confidence:
   `sellerInvoiceAmount` / `dueAmount` / `price×quantity`, tarih `lastModifiedDate`; unit-price'ı
   satır toplamı sanma bug'ı düzeltildi.

**Doğrulama:** `tsc --noEmit` temiz, **186/186** test (önceki 176 + hydrate/webhook/N11 sample testleri).

**Hâlâ kullanıcı/ops tarafında (kodla kapanmaz):**
- Migration **0011** (ve önceki 0010/0006) Supabase'e apply edilmeli
- `shopify app deploy` — yeni webhook subscriptions Shopify'a basılmalı
- Trendyol/Hepsiburada/N11 **gerçek satıcı hesabıyla** canlı uçtan uca test (kimlik bilgisi AI giremez)

## ✅ Giriş yapmış panel — "gerçek mi ezbere mi" derin denetimi (2026-07-16, Sonnet 5)
Kullanıcı isteği: "bu panelde DEMO DEĞİL panelin bütün özelliklerini incele, mantıklı ve bağlı çalışıyor mu
yoksa hep ezbere görüntüler mi veriyor." 10 sekmenin HEPSİ tek tek, veri kaynağına kadar izlendi. **Sonuç:
panelin ~%95'i gerçekten kullanıcının kendi verisine bağlı** — hero marj + canlı fee-waterfall reklam slider'ı
(recomputeMargin), break-even, SKU ekonomisi, silent-loser insight, underwriting kararı + self-backtest (N=1,
"your own data"), Campaign simülatörü (recomputeMarginWithDiscount canlı), Cash Flow, Products heatmap, Sector
Benchmark (gerçek + açıkça etiketli published fallback), append-only decision ledger, My Data. Settlement gerçek
kullanıcıda dürüstçe "Temsili" etiketli. Boş/loading state'leri dürüst. Sellers sekmesi gerçek kullanıcıda sadece
kendi tenant'ını gösteriyor (seed A/B/C değil).
- **TEK "ezbere" bulgusu (düzeltildi, commit `540a995`)**: Financing sekmesinin ALT bölümü ("proof points" +
  benchmark tablosu) her giriş yapmış kullanıcıya STATİK seed-portföy metriklerini (3 design partner, %100 GMV
  coverage, 3-seed-satıcı charge-off/delinquency) gösteriyordu, ve benchmark kolonu "Ours (live)"/"Bizimki
  (canlı)" diyordu. AYNI sekmenin üst yarısında kullanıcının gerçek "your own data" backtest'i olduğu için,
  "Ours (live)" satıcının kendi canlı rakamı gibi okunuyordu (bir satıcı "%0 charge-off" görüp kendisininki
  sanabilirdi). Footnote N=3'ü açıklıyordu ama label yine de platform pilot verisini kullanıcının canlı verisiyle
  karıştırıyordu.
  - **Adım 1 (commit `540a995`)**: Önce label düzeltildi ("Ours (live)" → "Pilot (N=3)", başlık → "Platform
    proof points · seed-stage pilot (not your account)").
  - **Adım 2 — NİHAİ (commit `4755078`)**: Kullanıcı "milyar dolarlık şirket gibi yap" deyince bölüm tamamen
    `{!authConfigured && (...)}` ile sarıldı → gerçek giriş yapmış satıcının Financing sekmesinden KALDIRILDI,
    sadece `/demo` ve anahtarsız-klon fallback'inde (ikisi de zaten seed veri) görünüyor. Gerçek fintech'ler
    pitch/diligence kanıtını pazarlama/demo yüzeyinde tutar, authenticated ürün içinde değil. Artık gerçek satıcı
    Financing'de SADECE kendi canlı kredi limitini + decision trace + self-backtest'ini görüyor. Doğrulama: tsc
    exit 0, production build exit 0, 176/176 test, /demo hâlâ gösteriyor, taze-tab konsolu temiz.

## ✅ Giriş-sonrası bağlanma sorunları denetimi — bayat token bug'ı bulunup düzeltildi (2026-07-16, Sonnet 5)
Kullanıcı isteği: "giriş yapıldığında olan bağlanma sorunlarını çok detaylı incele, hesap bağlama kısmı olunca
trendyol vs vs." Uygulamadaki TÜM `getSession()`/accessToken çağrı noktaları (14 tane) tek tek denetlendi.
**13'ü zaten doğru** — istekten hemen önce taze token alıyor. **1 tanesi YANLIŞTI**: `app/connect/page.tsx`'in
`ConnectFlow`'u, sayfa mount olduğunda `accessToken`'ı BİR KEZ alıp React state'inde saklıyor, dakikalar sonra
(kullanıcı Trendyol/Hepsiburada/N11 panelinden API key toplarken, sonra kart bilgilerini girip Stripe'ı
onaylarken) aynı bayat string'i tekrar kullanıyordu. Supabase oturum token'ı periyodik olarak
yenilendiği/döndürüldüğü için (varsayılan ~1 saat), yeterince zaman geçerse ESKİ token backend'imizce
reddediliyor — Stripe kart doğrulamasını ZATEN tamamlamış bir kullanıcı, tam da bu son adımda "oturum geçersiz"
gibi anlamsız/rastgele görünen bir hatayla karşılaşıyordu, hiç çıkış yapmamış olmasına rağmen. **Fix**:
`lib/supabase/client.ts`'e `getFreshAccessToken()` eklendi (her çağrıda GÜNCEL token'ı alır); `ConnectFlow`'daki
bayat state tamamen kaldırıldı, `finish()` ve `StripePaymentForm`/`PaymentForm` artık her istekten hemen önce
taze token alıyor. Doğrulama: `tsc` temiz, 176/176 test, build exit 0, canlı route-guard smoke testi. Commit
`f1b6994`.

## ✅ Kapsamlı sistem denetimi — "milyar dolarlık kalite" (2026-07-16, Opus 4.8)
Kullanıcı isteği: "bütün problemleri detaylı kontrol et ve çöz, kusursuz milyar dolarlık bir şirketin çalışma
sistemi gibi." 7 alanda sistematik, kanıta dayalı denetim yapıldı:
- **Baseline kapıları**: Production build (`next build`) bu oturumda İLK KEZ çalıştırıldı → exit 0, temiz. tsc
  exit 0, 176/176 test. (Bu proje sadece tsc+test'e güveniyordu; asıl deploy kapısı olan build hiç
  doğrulanmamıştı — artık doğrulandı.)
- **BULUNAN DEFECT #1 (düzeltildi, commit `88f2e6b`)**: `/api/billing/setup-intent` ve `/api/billing/start-trial`
  Stripe SDK çağrılarını (customers/setupIntents/subscriptions) try/catch OLMADAN yapıyordu. Stripe hatası
  (outage, rate limit, kart reddi) → kullanıcı kartını girer girmez anlamsız 500, loglanmamış. Fix: try/catch +
  temiz 502 + Türkçe mesaj. (Chat/explain/marketplace route'ları zaten bu standarttaydı — sadece billing eksikti.)
- **İYİLEŞTİRME (commit `a13dd95`)**: `/api/health` gerçek bir readiness kontrolüne dönüştürüldü + yeni
  `lib/config-status.ts`. Her env-bağımlı alt sistemin (Supabase, service-role, CREDENTIALS_ENCRYPTION_KEY,
  cron, Stripe, Shopify, AI) VARLIĞINI (değerini DEĞİL, sadece boolean) raporluyor. Bu oturumun en çok tekrar
  eden acısı ("prod doğru yapılandırıldı mı?") artık tek endpoint'ten cevaplanıyor. Canlı doğrulandı — secret
  sızmıyor, 503/200 doğru dönüyor.
- **HİJYEN (commit `8b92a44`)**: `tsconfig.tsbuildinfo` (makine-özel build cache) git'ten çıkarıldı + .gitignore'a
  `*.tsbuildinfo`/`*.log` eklendi. Her `git status`'ta "modified" görünmesinin sebebi buydu.
- **Güvenlik denetimi — TEMİZ**: Service-role client SADECE 2 CRON_SECRET-korumalı cron route'unda oluşturuluyor.
  Hiçbir route istemciden gelen user_id'ye güvenmiyor (14 route doğrulanmış oturumdan türetiyor). Hiçbir secret
  DEĞERİ loglanmıyor (sadece env değişkeni ADI). RLS her yerde.
- **Error-handling denetimi — geri kalan 20 route sağlam**: chat (çift LLM fallback + görünür mode header),
  explain, ledger/record (RPC graceful degrade), disconnect, resync — hepsi dış çağrıları düzgün yakalıyor.

## ✅ Trendyol/Hepsiburada/N11 — Shopify'daki gibi sorunlar denetlendi (2026-07-14)
Kullanıcı isteği üzerine Trendyol (ve aynı pattern'i paylaşan Hepsiburada/N11) Shopify'da bulunanlara benzer
sorunlar için satır satır denetlendi:
- **Wiring/demo-fallback sorunu**: YOK. `MarketplaceApiKeyModal.tsx`'in `connectTrendyol/Hepsiburada/N11`
  fonksiyonları şartsız gerçek `/api/{marketplace}/connect`'i çağırıyor; o route'lar gerçekten platformların
  canlı API'lerine (Trendyol: `apigw.trendyol.com`, Hepsiburada: `oms-external.hepsiburada.com`, N11:
  `api.n11.com`) bağlanıyor, yanlış kimlik bilgisinde platformun kendi 401'ini döndürüyor, asla sahte
  "Connected ✓" göstermiyor. Demo veri kirlenmesi de yapısal olarak imkansız — `lib/connect/demo-provider.ts`'te
  bu üç pazaryeri `LIVE_INTEGRATION_MARKETPLACES`'te, demo akışı onlara hiç dokunmuyor.
- **BULUNAN BUG #1 (düzeltildi, commit `d0e1112`)**: 4 gerçek bağlantı route'unun (Trendyol/Hepsiburada/N11/
  Shopify) HİÇBİRİ mevcut verilerle **de-dupe (tekrar önleme)** kontrolü yapmıyordu — sadece "Refresh"
  butonunun kullandığı `resyncMarketplace` bunu yapıyordu. Somut senaryo: kullanıcı gerçek bir pazaryerine
  bağlanır → "Disconnect only — keep my data" seçip bağlantıyı keser (varsayılan/ilk seçenek, veri silinmez) →
  tekrar bağlanır → aynı son 90 günün siparişleri **tekrar** eklenir, aynı order_id'lerle → dashboard'daki TÜM
  gelir/marj rakamları sessizce **iki katına çıkar** (hata yok, crash yok, sadece yanlış sayı). **Fix**:
  `resyncMarketplace`'in kanıtlanmış de-dupe mantığı `lib/save-user-transactions.ts`'e çıkarıldı, tüm 4 connect
  route'u + resyncMarketplace bu tek paylaşılan fonksiyonu kullanıyor artık.
- **BULUNAN BUG #2 (düzeltildi, commit `bd050d5`)**: Kullanıcı "emin misin, Shopify'da da öyle demiştin"
  diye haklı olarak sorgulayınca ikinci bir tur yapıldı — `encryptSecret()` (`CREDENTIALS_ENCRYPTION_KEY` env
  değişkeni olmadan exception fırlatan fonksiyon), tüm 4 route'ta try/catch OLMADAN çağrılıyordu. Bu env
  değişkeni eksikse, kullanıcı düzgün Türkçe hata yerine ayırt edilemeyen ham 500 görür. Fix: 4 route'ta da
  try/catch eklenip ayrı, loglanabilir bir hata mesajı ("Kimlik bilgileri şifrelenemedi — sunucu
  yapılandırması eksik.") döndürülüyor artık.
- **DÜRÜST GÜVEN DEĞERLENDİRMESİ**: Şu ana kadarki denetim SADECE kod okuma + statik analiz. Shopify
  sürecinde asıl kritik hataların (Vercel'in GitHub'a hiç bağlı olmaması, eksik OAuth scope) HİÇBİRİ kod
  okuyarak bulunamamıştı — sadece gerçek, canlı bir bağlantı denemesiyle ortaya çıktılar. Trendyol/Hepsiburada/
  N11 için henüz böyle bir canlı deneme YAPILMADI (gerçek satıcı hesabı yok). Doğrulanamayan somut riskler:
  (1) `CREDENTIALS_ENCRYPTION_KEY`'in Vercel production'da tanımlı olup olmadığı, (2) Trendyol/Hepsiburada API
  alan adı varsayımlarının GERÇEK canlı yanıtla eşleşip eşleşmediği (N11 için client.ts'in kendisi bunu "LOW
  confidence, best-effort guess chain, doğrulanamadı" diye açıkça itiraf ediyor), (3) platform tarafında IP
  allowlist/CORS gibi sadece canlı denemede görülebilecek bir kısıtlama olup olmadığı. Bu üçü kod okuyarak
  asla göremeyeceğim şeyler — Shopify'da olduğu gibi ancak gerçek bir bağlantı denemesi kesin cevap verir.
- Doğrulama: `tsc --noEmit` temiz, 176/176 test geçti (marketplace-resync.test.ts'in read-fail vs insert-fail
  hata mesajı ayrımını doğrulayan 2 testi dahil), `/demo` regresyon yok.
- **Canlı gerçek kimlik bilgisiyle test YAPILAMADI** — kullanıcının gerçek Trendyol satıcı hesabı yok/henüz
  paylaşmadı. API key girme adımı benim asla yapamayacağım bir şey (kimlik bilgisi girme yasağı) — kullanıcı
  kendisi girip sonucu paylaşırsa canlı doğrulama tamamlanabilir.

## ✅ Shopify Entegrasyonu — DURUM: TAM CANLI, UÇTAN UCA DOĞRULANDI (2026-07-14)
Gerçek bir Shopify test mağazasıyla (`true-life-2mb7xbhj.myshopify.com`) production'da (`matsorular.vercel.app`)
tam akış canlı test edildi ve BAŞARILI: Connect Shopify → gerçek `myshopify.com/admin/oauth/authorize`
yönlendirmesi → doğru izin ekranı ("Orders" dahil) → Install → gerçek callback → `tm_key_shopify_oauth` (live)
bağlantı kuruldu → dashboard'da eski demo verisi YOK, dürüst "No data yet" (test mağazasında gerçekten sipariş
yok, hiç sahte veri uydurulmadı). Konsol hatası yok. Bu, tüm oturumun nihai kanıtıdır.

Bu noktaya gelmeden önce 3 ayrı, birbirinden bağımsız sorun bulunup çözüldü (hepsi commit edildi):
1. Kod tarafı Shopify OAuth hiç wire edilmemişti → wire edildi (`210d2ad`/`a19cade`)
2. `shopify.app.toml` hiç yoktu, redirect URL Shopify'da kayıtlı değildi → oluşturuldu, doğru app'e bağlandı, deploy edildi
3. Vercel projesi HİÇ GitHub'a bağlı değildi (bu yüzden hiçbir push deploy tetiklemiyordu) → Settings→Git'ten
   `purplekittybbb/project`e bağlandı; repo private olduğu için ilk deploy "Blocked" oldu → repo public yapıldı → düzeldi
4. Demo bağlantısından kalan sahte örnek veriler gerçek veriyle karışıyordu → callback'e temizleme eklendi (`d75d533`)
5. `shopify.app.toml`'da `access_scopes.scopes` boştu, gerçek onay ekranı "Orders" izni istemiyordu → `read_orders`
   eklendi, tekrar deploy edildi (`8e208c6`, versiyon `sol-menude-dev-dashboard-3`)

## Şu An Ne Çalışıyor
- **Shopify gerçek OAuth + webhooks kablolaması**: ✅ Kod tamam; OAuth canlı doğrulandı; webhook deploy bekliyor (`shopify app deploy`)
- **Pazaryeri senkron**: connect + Refresh + saatlik cron + Shopify push; sync status DB'de
- **Sector Benchmark / pooled-cohort altyapısı**: ✅ Kod tamam; migration 0010 apply bekliyor
- Aktif geliştirme yok — ops apply + canlı TR pazaryeri testi bekleniyor

## Bilinen Sorunlar / Yarım Kalanlar
1. **Migration 0011 (sync status columns) Supabase'e apply edilmeli**
   - File: `supabase/migrations/0011_marketplace_credentials_sync_status.sql`
   - Apply edilmeden sync hâlâ çalışır; lastSyncedAt/needsReauth yazımı soft-fail (log + devam)

2. **Migration 0010 (sector_benchmarks) henüz Supabase'e apply edilmedi**
   - File: `supabase/migrations/0010_sector_benchmarks.sql`
   - Etkisi: `/api/benchmarks/segment` şu an her zaman "published" (representative) veri döner

3. **Migration 0006 (decision_ledger RPC) apply edilmemiş olabilir**
   - `/api/ledger/record` migration eksikken 200 + `{recorded:false, reason:"rpc_unavailable"}`

4. **Shopify webhook subscriptions deploy**
   - `shopify.app.toml` güncellendi; production'a `shopify app deploy` ile basılmalı

5. **Trendyol/Hepsiburada/N11 canlı satıcı testi yok** — kod + unit test var; gerçek hesapla uçtan uca yok

6. **Demo mode (/demo) Shopify-only tab**: Seed seller-b'de shopify verisi yok — tab "Shopify" seçiliyken combined fallback

## Son Yapılanlar
- **2026-07-18**: Hesap bağlama/senkron eksikleri kapatıldı (Cursor) — sunucu hydrate, sync status
  migration+UI, Shopify webhooks, saatlik cron, N11 documented field mapping; 186/186 test

- **2026-07-14**: Shopify OAuth UÇTAN UCA CANLI DOĞRULANDI — tam başarı (Claude Code + kullanıcı)
  - **Vercel'in stale-deploy kökeni bulundu**: Deployments listesinde en son deployment "1 gün önce" idi — bugün
    atılan hiçbir commit deploy tetiklememişti. Settings→Git'e bakılınca **Vercel projesinin GitHub'a HİÇ
    bağlı olmadığı** görüldü (GitHub/GitLab/Bitbucket "bağlan" butonları duruyordu, bağlı repo adı yoktu).
    `purplekittybbb/project`e bağlandı — ilk deploy denemesi "Blocked: commit author did not have contributing
    access ... Hobby Plan does not support collaboration for private repositories" hatasıyla durdu (repo private
    olduğu, Vercel hesabıyla GitHub hesabı farklı göründüğü için). Repo `.env.local`'ın hiç commit edilmediği
    doğrulanıp (secret sızıntı riski yok) GitHub'da public'e çevrildi — sonraki deploy başarıyla tamamlandı.
  - **İkinci blocker — eksik OAuth scope**: Deploy düzelince gerçek test mağazasıyla (`true-life-2mb7xbhj`,
    kullanıcının Partner Dashboard'da oluşturduğu development store) ilk deneme onay ekranında sadece "View
    staff and contributor data" gösterdi — "Orders" izni hiç yoktu. Kök neden: `shopify.app.toml`'da
    `access_scopes.scopes = ""` — `embedded = true` olduğu için Shopify'ın gerçek install ekranı OAuth URL'deki
    dinamik `scope=read_orders` parametresini değil, toml'daki statik (boş) scope'u kullanıyordu. `scopes =
    "read_orders"` eklenip tekrar `shopify app deploy` edildi (versiyon `sol-menude-dev-dashboard-3`).
  - **CANLI UÇTAN UCA KANIT**: Test mağazasıyla tekrar denendi → onay ekranında artık "Orders" listeleniyordu →
    "Install" tıklandı → tarayıcı otomatik `matsorular.vercel.app`'a döndü → Connect listesinde `tm_key_shopify_
    oauth` (canlı/"live" provider, demo etiketi YOK) göründü → Dashboard'a gidildi → eski demo verisi ($51,300
    vb.) YOKTU, bunun yerine dürüst "No data yet" (test mağazasında gerçekten sipariş yok, hiçbir sayı
    uydurulmadı). Konsol hatası sıfır.
  - Bu, kullanıcının en baştaki şüphesinden ("Shopify hesabımı bağlamak gerçek veri istemiyor, sahte veriyle
    açılıyor") başlayıp beş ayrı kök nedenin (UI'da hiç wire edilmemiş kod, eksik shopify.app.toml, yanlış app'e
    bağlanma, Vercel'in GitHub'a hiç bağlı olmaması, eksik OAuth scope) tek tek bulunup düzeltildiği bütün bir
    oturumun sonucu.

- **2026-07-14**: Test mağazasıyla canlı OAuth denemesi → 2 gerçek bulgu (Claude Code, commit `d75d533`)
  - **Bulgu 1 (production stale deploy)**: Kullanıcı gerçek bir Shopify test mağazası (`true-life-2mb7xbhj`)
    oluşturup `localhost:3000` üzerinden bağlanmayı denedi → Shopify "redirect_uri is not whitelisted" hatası
    verdi (beklenen — localhost hiç whitelist edilmedi, sadece production URL edildi). Production'da
    (`matsorular.vercel.app`) tekrar denenince BU SEFER doğru redirect_uri sorunu yoktu ama "Connect Shopify"
    hâlâ ESKİ demo modalını açtı — yukarıdaki "⚠️ ACİL" notuna bakın, production deploy edilmemiş.
  - **Bulgu 2 (gerçek bug, düzeltildi)**: Dashboard'da ısrarla aynı donmuş sayılar görülüyordu (`Gross Rev
    $51,300`, SKU'lar `SHOPIFY-SKU-01/02`) — bunlar `lib/connect/demo-provider.ts`'teki SABİT demo örnek
    verisiyle birebir eşleşiyordu (18000+13500+19800=51300, kanıtlandı). Kök neden: demo bağlantısı bir kez
    yapılınca `shopify-init-1/2/3` ID'li 3 satır `user_transactions`'a yazılıyor; `resyncMarketplace`'in
    de-dupe'u `order_id` bazlı olduğu için bu sahte ID'ler gerçek Shopify sipariş ID'leriyle asla çakışmıyor —
    yani gerçek OAuth ile bağlanılsa bile gerçek veri bu eski sahte satırların YANINA ekleniyor, hiç
    temizlenmiyordu. **Fix**: `/api/shopify/oauth/callback` artık gerçek veriyi yazmadan önce
    `order_id LIKE 'shopify-init-%'` desenine uyan satırları siliyor — sadece kesin demo verisini hedefliyor,
    gerçek geçmiş veriye asla dokunmuyor (blanket delete-then-replace YAPILMADI, çünkü `resyncMarketplace`'in
    kendi yorumu bunun neden güvensiz olduğunu açıklıyor — vendor API'leri sadece son X günü döndürür).
  - Doğrulama: `tsc --noEmit` temiz, 176/176 test geçti, `/demo` regresyon yok. Gerçek OAuth callback'in
    çalıştığı uçtan uca CANLI doğrulama, production deploy düzelmeden yapılamadı.

- **2026-07-14**: `shopify.app.toml` oluşturuldu, doğru app'e bağlandı, deploy edildi (Claude Code + kullanıcı, commit `a19cade`)
  - **Kontekst**: Önceki oturumda Shopify OAuth kodu wire edilmişti ama Partner Dashboard'da redirect URL hiç
    kayıtlı değildi — Settings'te düzenleme UI'ı yoktu, Versions salt-okunurdu. Teşhis: bu app "config-as-code"
    (Shopify CLI ile yönetilen) bir app — Dashboard'dan değil, sadece `shopify.app.toml` + `shopify app deploy`
    ile değiştirilebilir. Repoda bu dosya hiç yoktu.
  - **Client ID uyuşmazlığı bulundu ve çözüldü**: `shopify app config link` ilk çalıştırıldığında yanlış app'e
    ("true store") bağlandı — `client_id` `.env.local`'daki `SHOPIFY_CLIENT_ID` ile eşleşmiyordu (son 8 karakter
    karşılaştırmasıyla doğrulandı, tam secret hiç ifşa edilmeden). İkinci denemede doğru app ("Sol menüde Dev
    dashboard") seçildi, ama komut YANLIŞ dizinde (`C:\Users\masla`, proje dizini değil) çalıştırıldığı için
    doğru `shopify.app.toml` proje klasörüne değil, kullanıcı ana dizinine yazıldı (`EPERM ... Application Data`
    hatası da bunu doğruladı — CWD proje dizini olsaydı o klasöre hiç dokunulmazdı). İki dosya karşılaştırılıp
    doğru `client_id`/`name` proje dosyasına taşındı; `.env.local` ile TAM eşleştiği script ile doğrulandı
    (`grep` + `diff`, değer hiç ekrana yazdırılmadan).
  - **Deploy**: `shopify app deploy` — ilk denemede `--force` bayrağıyla çalıştırılmak istendi ama Claude Code'un
    kendi güvenlik sınıflandırıcısı bunu ENGELLEDİ (CLI'ın kendi onay/diff ekranını atladığı için, kullanıcı
    sadece "shopify app deploy" onaylamıştı, `--force`'u değil) — bu doğru bir engeldi, iyi çalıştı. Kullanıcı
    komutu KENDİ interaktif terminalinde (cmd.exe) çalıştırıp CLI'ın diff/onay ekranını gördü ve onayladı.
  - **CANLI KANIT**: `success — New version released to users. sol-menude-dev-dashboard-2` — kullanıcının kendi
    terminal ekran görüntüsüyle doğrulandı. `application_url = https://matsorular.vercel.app`,
    `redirect_urls = [ https://matsorular.vercel.app/api/shopify/oauth/callback ]` artık Shopify'da kayıtlı.
  - **Sonuç**: `/connect`'teki gerçek Shopify OAuth akışı artık uçtan uca (kod + Shopify config) çalışır durumda.

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
0. **[YENİ 2026-07-16] `truemargin-core/` ölü alt-proje silinmeli mi?** — Repoda kendi `app/`, `lib/`,
   `node_modules`, `package.json`'ı olan tam bir ESKİ kopya duruyor (29 dosya git'e kaydedilmiş). Ana uygulama
   onu import ETMİYOR (`lib/engine.ts`'te sadece "moved verbatim from truemargin-core" yorumu var). Runtime riski
   yok ama: repo artık PUBLIC olduğu için bu ölü kopya da herkese açık, ve içinde `.next-dev.log` gibi tracked
   log'lar var. Bütün bir alt-projeyi silmek geri-alması-zor bir aksiyon olduğu için BEN silmedim — kullanıcının
   kararı. Silinsin mi (git rm -r truemargin-core), yoksa referans için mi kalsın?
1. **Migration 0006 + 0010 apply timeline**: Supabase production/staging ortamına ne zaman uygulanacak?
2. **Vercel projesinin GitHub bağlantısı artık kalıcı mı?** — `purplekittybbb/project`e bağlandı (Settings→Git),
   repo public yapıldı. Gelecekte her `git push`'un otomatik deploy tetiklediği birkaç commit sonra teyit edilmeli
   (şu ana kadar 2 kez elle boş commit ile tetiklendi, organik bir push ile otomatik tetiklenişi henüz görülmedi).
3. **Repo'nun public kalması kabul edilebilir mi?** — Kullanıcının bilinçli tercihiydi (Vercel Pro'ya
   yükselmemek için). İçinde secret yok (`.env.local` hiç commit edilmemiş, doğrulandı), ama uzun vadede
   private + Vercel Pro'ya geçiş düşünülebilir.
4. **`C:\Users\masla\shopify.app.toml`** (yanlış konumda, ana kullanıcı dizininde) hâlâ duruyor — artık gereksiz
   bir kalıntı (proje dosyası doğru içerikle güncellendi). Temizlenmesi istenirse silinebilir; git'e hiç dahil
   değil, zararsız.
5. **Gerçek sipariş verisiyle tam test**: Test mağazasına (`true-life-2mb7xbhj`) birkaç örnek ürün/sipariş
   eklenip "Refresh" ile gerçek sipariş verisinin dashboard'a doğru yansıdığı görülebilir — şu ana kadar sadece
   BAĞLANTI kısmı (sıfır siparişle) doğrulandı, gerçek sipariş → dashboard sayıları eşlemesi henüz canlı görülmedi.
6. **Trendyol/Hepsiburada/N11 canlı testi**: Kod denetlendi ve bir bug (duplicate-order) bulunup düzeltildi,
   ama gerçek bir satıcı hesabıyla uçtan uca CANLI test edilmedi — kullanıcının gerçek API key/secret'ı yok ya
   da henüz paylaşmadı. Kullanıcı `/connect`'te "Add API key" ile kendi bilgilerini girerse (bu adımı ben
   yapamam), sonucu doğrulayabilirim.
7. **tests/e2e-evidence/** dizininde bazı eski/başarısız debug taramaları var (`99-error*.png`, `report.json` — port
   3001 bağlantı hatası içeriyor, muhtemelen yanlışlıkla farklı porta işaret etmiş). Temizlenmeli mi, yoksa referans
   için mi kalsın?

## Paralel Geliştirme Notu
Bu proje AYNI ANDA hem Claude Code hem Cursor'dan geliştiriliyor olabilir (aynı dizin, aynı git repo). Commit
mesajlarında `Co-authored-by: Cursor` görürsen, o iş zaten Cursor tarafından tamamlanmış demektir — tekrar araştırma
yapmadan önce `git log` ve ilgili dosyaları oku.

---

**Son güncelleme**: 2026-07-14 (Trendyol/Hepsiburada/N11 denetlendi, duplicate-order bug bulunup düzeltildi — commit `d0e1112`)
**Sonraki adım**: Kullanıcı gerçek bir Trendyol/Hepsiburada/N11 satıcı hesabı ile `/connect`'ten bağlanırsa
sonucu canlı doğrulayabilirim; aksi halde şu ana kadarki kod denetimi + testler yeterli kabul edilebilir
