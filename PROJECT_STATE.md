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
6. **tests/e2e-evidence/** dizininde bazı eski/başarısız debug taramaları var (`99-error*.png`, `report.json` — port
   3001 bağlantı hatası içeriyor, muhtemelen yanlışlıkla farklı porta işaret etmiş). Temizlenmeli mi, yoksa referans
   için mi kalsın?

## Paralel Geliştirme Notu
Bu proje AYNI ANDA hem Claude Code hem Cursor'dan geliştiriliyor olabilir (aynı dizin, aynı git repo). Commit
mesajlarında `Co-authored-by: Cursor` görürsen, o iş zaten Cursor tarafından tamamlanmış demektir — tekrar araştırma
yapmadan önce `git log` ve ilgili dosyaları oku.

---

**Son güncelleme**: 2026-07-14 (Shopify OAuth uçtan uca gerçek test mağazasıyla doğrulandı — tam başarı)
**Sonraki adım**: İstenirse gerçek sipariş verisiyle (test mağazaya ürün/sipariş ekleyip) dashboard sayılarının
doğru yansıdığı da doğrulanabilir; aksi halde Shopify entegrasyonu tamamlanmış kabul edilebilir
