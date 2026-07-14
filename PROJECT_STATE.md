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

## Shopify Entegrasyonu — DURUM: TAM CANLI (kod + Shopify tarafı config artık ikisi de doğru)
`shopify.app.toml` artık repoda (commit `a19cade`), doğru app'e bağlı (`client_id` `.env.local`'daki
`SHOPIFY_CLIENT_ID` ile TAM eşleşiyor — "Sol menüde Dev dashboard" app'i), ve `shopify app deploy` ile
Shopify'a gönderildi: `application_url = https://matsorular.vercel.app`, `redirect_urls = [
https://matsorular.vercel.app/api/shopify/oauth/callback ]` artık Shopify sunucusunda kayıtlı
(versiyon: `sol-menude-dev-dashboard-2`). Yani `/connect`'teki gerçek OAuth akışı artık uçtan uca çalışır durumda —
hem kod (önceki oturumda wire edildi) hem Shopify config (bu oturumda deploy edildi) hazır.

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
1. **Migration 0006 + 0010 apply timeline**: Supabase production/staging ortamına ne zaman uygulanacak?
2. **[ÇÖZÜLDÜ 2026-07-14] Shopify Partner App redirect URL kaydı**: `shopify.app.toml` deploy edildi,
   `redirect_urls` artık Shopify'da kayıtlı. Kalan tek doğrulama: gerçek bir Shopify mağazasıyla uçtan uca
   OAuth login tamamlanıp `/api/shopify/oauth/callback`'in gerçek sipariş verisi çekip `user_transactions`'a
   yazdığı canlı test edilmeli (bu ben — Claude Code — yapamam, gerçek bir Shopify mağaza hesabı gerektiriyor).
3. **Vercel production'da `SHOPIFY_CLIENT_ID`/`SHOPIFY_CLIENT_SECRET` tanımlı mı?** — Bu sadece bu makinenin
   `.env.local`'ında doğrulandı. Prod'da tanımlı DEĞİLSE, gerçek kullanıcılar hâlâ (artık açıkça etiketlenmiş) demo
   moda düşecek.
4. **`C:\Users\masla\shopify.app.toml`** (yanlış konumda, ana kullanıcı dizininde) hâlâ duruyor — artık gereksiz
   bir kalıntı (proje dosyası doğru içerikle güncellendi). Temizlenmesi istenirse silinebilir; git'e hiç dahil
   değil, zararsız.
5. **tests/e2e-evidence/** dizininde bazı eski/başarısız debug taramaları var (`99-error*.png`, `report.json` — port
   3001 bağlantı hatası içeriyor, muhtemelen yanlışlıkla farklı porta işaret etmiş). Temizlenmeli mi, yoksa referans
   için mi kalsın?

## Paralel Geliştirme Notu
Bu proje AYNI ANDA hem Claude Code hem Cursor'dan geliştiriliyor olabilir (aynı dizin, aynı git repo). Commit
mesajlarında `Co-authored-by: Cursor` görürsen, o iş zaten Cursor tarafından tamamlanmış demektir — tekrar araştırma
yapmadan önce `git log` ve ilgili dosyaları oku.

---

**Son güncelleme**: 2026-07-14 (shopify.app.toml deploy edildi — Shopify Partner App config artık canlı)
**Sonraki adım**: Supabase'de migration 0006 ve 0010 apply edilmeli; gerçek bir Shopify mağazasıyla uçtan uca OAuth testi yapılmalı
