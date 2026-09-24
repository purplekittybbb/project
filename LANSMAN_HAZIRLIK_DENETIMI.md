# TrueMargin — Lansman Hazırlık Denetimi (Eksikler & Hatalar Master Listesi)

_Tarih: 25 Eylül 2026 · Dört boyutta sistematik denetim: Hesap · Ödeme · Ölçek/Güvenilirlik · UX/Test altyapısı_

---

## GÜNCEL DURUM (25 Eyl — DENETIM_GOREV_BELGESI turu)

**Kanıt:** `npx tsc --noEmit` temiz · `npm test` 689 geçti / 2 ödeme testi skip.

**Kritik / yüksek — kodda kapatıldı (commit'ler `c632d16`…`e4b1651`):**
- ✅ **AD-12** Break-even artık tüm waterfall'ı kullanıyor (`lib/engine.ts` + `tests/break-even-price.test.ts`).
- ✅ **AD-13** `saveDedupedTransactions` upsert + 0003 yoksa insert fallback. **Sahip: migration `0003`'ü Supabase SQL editöründe UYGULA** — yoksa eşzamanlı cron+Yenile hâlâ çiftleyebilir.
- ✅ **AD-14** Ürün maliyeti `marketplace::sku` anahtarı.
- ✅ **AD-15** Sipariş günü İstanbul (UTC+3); 4 pazaryeri client + Amazon TR.

**Ödeme:** dokunulmadı. `billing-demo-trial` / `billing-status` iki asılı gate `it.skip`.

**Açık (sonraki tur):** frontend dashboard boş/hata durumları; RLS/migration 0022/0042 prod; E2E-CI; AD-16 (enrich 0=gap) mimari; adaptör küçük flag'ler.

---

## GÜNCEL DURUM (24 Eyl — ödeme dışı çalışma turu)

**Bitti (kod cihazda; push + `npm test` bekliyor):**
- ✅ **P0-5** Hesap/ayarlar menüye bağlandı (Ayarlar sekmesinde "Profili düzenle · hesabı yönet ve sil").
- ✅ **P0-6** Sentry zaten kuruluydu (instrumentation + config'ler + `withSentryConfig`, PII kapalı).
- ✅ **P1-1** Uygulama içi şifre değiştirme (`/settings` → Profil).
- ✅ **P1-3** Çıkışta veri temizliği zaten kod içinde çözülmüş (doğrulandı).
- ✅ **P1-4** `user_transactions` okuma index'leri — migration `0042` (Supabase'e UYGULA).
- ✅ **P1-5 / P1-6** Fail-open korumaları artık Sentry'ye raporluyor (görünürlük); fail-open bilinçli korunuyor.
- ✅ **P1-8** Test güvenlik ağı başlatıldı — 6 test dosyası (izole ortamda çalıştırılıp doğrulandı):
  `not-found-page`, `format-tr`, `tool-limits`, `config-status`, `loss-alarm-banner`, `list-quality-badge`.
- ✅ **P1-9 (kısmi)** `/api/health` artık public (`proxy.ts`); dışarıdan smoke `scripts/smoke-test.mjs` yazıldı.
- ✅ **P2-2** Ad-soyad (`full_name`) artık `/settings`'te görünüyor + düzenlenebiliyor.
- ✅ **P2-5** Ayarlar "Kaydet" artık başarı/hata geri bildirimi veriyor.
- ✅ **P1-7** Panel mobil düzeltmesi (kod); canlı görsel doğrulama giriş gerektirdiği için kullanıcıda.

**Senin yapman gerekenler (kod dışı / hesap-ortam gerektiren):**
- ⏳ `git push` (25 Eyl commit'leri: AD-12…15 + test skip).
- ⏳ Migration **`0003`** (dedupe unique index) — AD-13 için şart.
- ⏳ Migration `0042` + `0022` (`product_name`) Supabase SQL editöründe.
- ⏳ **P1-9** izleme: harici uptime monitörü (UptimeRobot) VEYA Vercel firewall bypass.

**Bilerek dokunulmadı:** Tüm ödeme (P0-1/2/3/4, P1-2, P2-3/2-4) — ödeme sistemi değişecek.
**Ayrı oturum (tam checkout gerekli):** P0-9/P0-10 tam E2E-CI + k6 yük testi; P2-6 dashboard refactor.

---

## DERİN KOD DENETİMİ (24 Eyl — 3 paralel uzman ajan, 39 API rotası gerçek kod)

_Yöntem: kodu tek tek gözle değil, 3 izole ajanı aynı anda 3 kusur sınıfında (erişim
kontrolü/tenant izolasyonu · çökme güvenliği · veri bütünlüğü/eşzamanlılık) gerçek kod
üzerinde çalıştırdık; her bulgu dosya:satır kanıtlı. **"Seni bunları bulmaya nasıl zorlarız"ın
cevabı bu: tekrarlanabilir çok-ajanlı kod denetimi.**_

**Bulundu ve DÜZELTİLDİ (bu turda, kod cihazda):**
- 🔴 **AD-1 [YÜKSEK] Cron'lar middleware tarafından 401'leniyordu.** `/api/cron` `proxy.ts`
  PUBLIC listesinde değildi → Vercel cron (Supabase oturumu yok, yalnızca CRON_SECRET) rotaya
  ULAŞMADAN 401 alıyordu. Yani pazaryeri senkronu, görünürlük precrawl, benchmark, haftalık özet
  **muhtemelen hiç çalışmıyordu** — tam senin "göremediğim çalışmayan şeyler" korkun. `/api/cron`
  public yapıldı (her rota CRON_SECRET'i kendisi doğruluyor). → **Vercel cron loglarını kontrol et:**
  daha önce 401 mi alıyorlardı?
- 🔴 **AD-2 [YÜKSEK] Hesap silmede sessiz kısmi veri kaybı (KVKK/GDPR).** `account/delete` bir
  tablo silme başarısız olursa (supabase `throw` etmiyor, `{error}` dönüyor) bunu yok sayıp auth
  hesabını yok ediyor ve `ok:true` diyordu → PII kalıyor ama kullanıcı bir daha giremiyor. Artık
  herhangi bir silme hatasında hesap KORUNUYOR, 502 dönüyor.
- 🟡 **AD-3 [ORTA] compute-benchmarks tüm benchmark tablosunu silebiliyordu.** Boş çalıştırmada
  prune tüm satırları uçuruyordu. `payload boşsa prune atla` guard'ı eklendi.
- 🟢 **AD-4 team/context** tek bir kullanıcı aramasında tüm listeyi 500'lüyordu → per-lookup fallback.
- 🟢 **AD-5 admin/queues** Redis titrerse diagnostics ucu 500 → degrade ediliyor.

**Bulundu, SANA bırakıldı (düzeltme öncesi girdi/doğrulama gerekiyor):**
- 🟡 **AD-6 [ORTA] IDOR — marketplace/resync GET.** Giriş yapmış bir kullanıcı `jobId` tahmin
  ederek başka kullanıcının senkron iş durumunu (sayaç/hata metni) okuyabiliyor. Düzeltme
  job→userId sahiplik kontrolü gerektiriyor (mapping lib kodunda; önce görmek lazım).
- 🟡 **AD-7 [ORTA] Eşzamanlı sipariş-yazma yarışı.** Çift-sayımı önleme tamamen migration `0003`
  unique index'ine (`user_transactions_dedupe_idx`) dayanıyor. → **`0003`'ün prod'da uygulı
  olduğunu doğrula.** Uygulıysa güvendesin; değilse eşzamanlı senkronlar çift satır ekleyebilir.
- 💳 **AD-8 [ödeme, audit-only]** iyzico callback'te sarılmamış dış çağrı → 500; stripe webhook
  sırasız gelirse abonelik durumunu geri düşürebiliyor. Ödeme reworkünde ele al.

**Ajanların TEMİZ dediği (güven ver):** tüm IDOR yüzeyleri kimliği sunucuda yeniden türetiyor;
tüm cron'lar CRON_SECRET doğruluyor; ledger atomik advisory-lock kullanıyor; team rotaları üyelik
kontrol ediyor; JSON ayrıştırma her yerde try/catch'li; pazaryeri yazımları dedupe'tan geçiyor.
Kod tabanı gerçekten savunmacı — bunlar iyi kurulmuş bir uygulamadaki gerçek boşluklardı.

---

## DERİN KOD DENETİMİ — 2. TUR (24 Eyl — iş mantığı: para · veri · adaptör)

_3 ajan · 33 dosya (engine, calc, dedupe yazma yolu, pazaryeri API client'ları, CSV, kripto)._

**Bulundu ve DÜZELTİLDİ (kod cihazda, syntax doğrulandı):**
- 🟡 **AD-9 safe-price taban fiyatı sıfıra/negatife bölünebiliyordu.** `calc/safe-price.ts` floor
  hesabı `(1 − efektif komisyon)` guard'sızdı (hedef yolu guard'lıydı). Komisyon ≥ %100 → Infinity
  ya da NEGATİF taban fiyat → "rekabet edebilirsin" yeşil ışığı garantili zararda. Guard eklendi.
- 🟡 **AD-10 N11 tarih ayrıştırma sync'i çökertiyordu.** `n11-api/client.ts` `typeof raw==="number"?raw:raw`
  no-op ternary'di; N11 epoch'u string gönderirse `new Date("1699…")` → Invalid Date → `.toISOString()`
  RangeError → **tüm senkron abort.** Sayısal string coerce + NaN guard eklendi.
- 🟢 **AD-11 NaN para sütunlarına yazılıyordu.** `product-costs` ve `settlement` `?? 0` kullanıyordu —
  `??` NaN'i yakalamaz → NaN → NULL → maliyet sessizce kayıp → şişirilmiş marj. `Number.isFinite` guard'ı.

**Bulundu, TESTLE DÜZELTİLDİ (25 Eyl):**
- ✅ **AD-12 [KRİTİK] Break-even** — oranlar paydaya, sabitler paya. `c632d16`.
- ✅ **AD-13 [KRİTİK] Dedupe upsert** — `b281d11`. **Hâlâ sahip eylemi: migration `0003` prod'a uygulanmalı.**
- ✅ **AD-14 [YÜKSEK] marketplace::sku** — `6d4f4fa`.
- ✅ **AD-15 [YÜKSEK] İstanbul günü** — `e4b1651`.
- 🟠 **AD-16 enrich.ts "gerçek 0" konusu — ajanın önerdiği fix GÜVENSİZ.** `isGap(0)=true` bilerek
  API'nin 0 döndürdüğü (bilinmeyen) maliyetleri dolduruyor; naif "sadece null doldur" fix'i ana yolu
  KIRAR. Gerçek çözüm kaynakta (adaptörlerde) bilinmeyeni `null` olarak yaymak — mimari, ayrı ele alınmalı.
- 💳 **[ödeme, audit-only]** — ilgili bulgular ödeme reworkünde.

**Adaptör küçük bulgular (flag):** Shopify indirim-öncesi fiyat kullanıyor (canlı değil), Shopify çok
para birimi USD sabit, Trendyol fallback birim-fiyatı ×units yapmıyor (şema kayması durumunda), HB 50
sipariş sınırı + tarih penceresi yok, CSV 3-ondalık sezgisi bazı değerleri 1000× yapıyor. **Kripto
(crypto.ts) TEMİZ:** AES-256-GCM, her şifrelemede taze rastgele IV, authTag doğrulanıyor.

---

## ÖNCE EN ÖNEMLİ GERÇEK: kusursuzluk "daha dikkatli bakmak"la gelmez

Hiçbir insan (ve hiçbir yapay zeka) tek tek bakarak her hatayı bulamaz — milyar dolarlık
şirketler de bulamaz. Onların gözden kaçırmama sebebi **sistemler** kurmuş olmaları.
"Göremediğim 20 milyon hata" korkunun ilacı daha çok bakmak değil, aşağıdaki **3 sistemi**
kurmak. Bunlar kurulunca hatalar sana kendiliğinden görünür hale gelir:

1. **Hata izleme (Sentry)** — production'da gerçek kullanıcının yaşadığı HER hatayı otomatik
   toplar ve sana bildirir. Şu an sende **hiç yok** → bu yüzden hataları göremiyorsun. **1 numaralı iş bu.**
2. **Otomatik E2E test (Playwright + CI)** — her deploy'da "üye ol → mağaza bağla → panel",
   "ücretsiz araç", "boş ekran", "telefon görünümü" gibi gerçek akışları robot gibi test eder;
   bir şey bozulursa deploy'u durdurur. Şu an testler var ama **gerçek akışları test etmiyor** (aşağıda).
3. **Yük testi (k6)** — "1000 kişi aynı anda kullanırsa ne olur" korkusunun cevabı; gerçekten
   1000 sanal kullanıcı gönderip nerede çöktüğünü ölçer. Şu an **hiç yapılmadı.**

Bu üçü kurulunca, aşağıdaki listenin ötesinde senin de benim de aklımıza gelmeyen hatalar
otomatik yakalanmaya başlar. **Asıl yatırım bu.**

---

## 🔴 P0 — LANSMANI ENGELLEYEN / KRİTİK (reklamdan ve para almadan önce mutlaka)

### Ödeme (gerçek para)
- **[P0-1] Bugün gerçek para tahsil edilemiyor.** Stripe anahtarları ayarlı değil (`start-trial` → 503),
  iyzico ise sandbox'a kilitli — production URL'de hata fırlatıyor. Çalışan tek şey kartsız demo deneme
  ve iyzico sahte (sandbox) ödeme. → `app/api/billing/start-trial/route.ts`, `app/api/billing/iyzico/checkout/route.ts`
- **[P0-2] iyzico "abonelik" değil, tek seferlik çekim.** Ödeme sonrası 30 gün veriliyor ama **yenileme
  cron'u yok, iyzico webhook'u yok** (yenilendi/başarısız/iptal olayları yakalanmıyor), `markSubscriptionPastDue`
  ölü kod. 30 gün sonra erişim sessizce kapanıyor — tekrar çekim yok, hatırlatma e-postası yok. Kesin gelir kaybı/churn.
  → `app/api/billing/iyzico/callback/route.ts`

### Erişim / güvenlik (gelir sızıntısı)
- **[P0-3] "Pro" kilidi sadece tarayıcıda.** `/api/copilot` ve `/api/extension` uçlarında **sunucu tarafı
  abonelik kontrolü yok** → ücretsiz hesap doğrudan API çağrısıyla Pro özelliklerini kullanabilir.
  → `app/dashboard/page.tsx` (istemci kontrolü), sunucuda `app/api/tools/[toolId]/route.ts` var ama copilot/extension'da yok
- **[P0-4] Hata olunca Pro kilidi AÇILIYOR.** Herhangi bir `/api/billing/status` hatasında `hasProAccess=true`
  oluyor → billing'de en ufak aksaklıkta ücretsiz kullanıcılar Pro oluyor. (Fail-open — güvenli tarafı "kapalı" olmalı.)
  → `app/dashboard/page.tsx:1287`

### Hesap alanı
- **[P0-5] "Hesap ayarları" sayfası VAR ama HİÇBİR YERE bağlı değil.** Profil düzenleme + hesap silme
  yalnızca `app/settings/page.tsx`'te — ama menüde/hiçbir yerde linki yok, sadece URL'yi elle yazarak ulaşılıyor.
  Yani senin dediğin "hesap yeri görünmüyor" **gerçek bir bug** — sayfa var, kapısı yok.
  → Çözüm: bu sayfayı panelin menüsüne bağla (ya da panelin "Ayarlar" sekmesine göm).

### Görünürlük / güvenilirlik
- **[P0-6] Hiç hata izleme yok (Sentry yok).** Her hata geçici Vercel loglarına gidiyor, toplanmıyor,
  uyarı gelmiyor. "Kullanıcının yaşadığı ama benim görmediğim hatalar" tam olarak bu. → `package.json` (bağımlılık yok)
- **[P0-7] Ölçek Redis + worker'a bağlı ve sessizce çöküyor.** `REDIS_URL` ayarlı değilse, önbellek
  ıskalayınca **Vercel fonksiyonunun içinde senkron headless-Chromium taraması** çalışıyor (~500MB her biri).
  1000 misafir + Redis yok = fonksiyon şişip timeout/OOM. Yedek olan Postgres kilidi de hata olunca "izin ver"
  diyor. Prod'da Redis'in gerçekten ayarlı olduğunu **hiçbir şey doğrulamıyor.** → `lib/tools/run-standalone.ts`, `lib/supabase/scan-concurrency.ts`
- **[P0-8] Worker canlılığı izlenmiyor.** Tarama worker'ı ayrı bir sunucuda; ölürse işler sonsuza dek
  birikir, misafirler sonsuz bekler, kimse fark etmez (uyarı yok). → `lib/queue.ts`, `app/api/admin/scraper-health`

### Test güvenlik ağı
- **[P0-9] Otomatik E2E test hiç çalışmıyor.** CI sadece `tsc` + `vitest` çalıştırıyor. Playwright scriptleri
  var ama kimse tetiklemiyor, `playwright.config.ts` yok. → `.github/workflows/test.yml`, `tests/e2e-*.mjs`
- **[P0-10] Var olan E2E scriptleri ölü.** İngilizce metinleri ("Sign in", "Start free trial") kontrol
  ediyorlar — ama uygulama artık Türkçe, o metinler hiç görünmüyor → yanlış güven veriyorlar, aslında hiçbir şeyi test etmiyorlar.

---

## 🟡 P1 — ÖNEMLİ (lansmandan hemen sonra, ilk hafta)

### Hesap
- **[P1-1] Giriş yapmış kullanıcı şifresini değiştiremiyor.** Tek yol: çıkış yap → "şifremi unuttum". Panelde şifre değiştirme yok.
- **[P1-2] Faturalar yok.** `/settings` sekmesi "Abonelik ve **Faturalar**" yazıyor ama fatura listesi/indirme yok — etiket yalan söylüyor. → `components/billing/UpgradePlanPanel.tsx`
- **[P1-3] Çıkışta veri sızıntısı.** Çıkış yapınca localStorage (bağlı pazaryerleri, deneme sayacı) siliniyor değil
  → ortak bilgisayarda bir sonraki kullanıcı öncekinin bağlantılarını/denemesini görüyor. (Kodun kendi yorumu bunu doğruluyor; finansal veri RLS ile güvende ama bu yine de gerçek bir bug.) → `app/dashboard/page.tsx:1087`

### Ölçek / performans
- **[P1-4] `user_transactions` tablosunda `sale_date`/`marketplace`/`sku` index'i yok** ve dashboard her açılışta
  **tüm satırları limitsiz** çekiyor. Lansmanda sorun değil; 100 bin+ satırlı büyük satıcıda panel yavaşlar/çöker. → `lib/supabase/user-data.ts`, `supabase/migrations/0001`
- **[P1-5] Kötüye-kullanım korumaları DB hatasında "izin ver"e düşüyor.** Yoğunlukta bir DB aksaklığı, tam en
  kötü anda rate-limit ve eşzamanlılık kapağını kapatıyor. → `lib/tools/guest-rate-limit.ts`
- **[P1-6] Üye ol / giriş uçlarında uygulama katmanı rate-limit yok** — sadece misafir *araç* kullanımı sınırlı.
  Kayıt spam'i / şifre deneme saldırısı yalnızca Supabase'in yerleşik korumasına bağlı.

### UX
- **[P1-7] Panel telefonda BOZUK.** Giriş yapılmış uygulamanın kenar çubuğu `w-[220px]` sabit, katlanmıyor,
  hamburger yok → telefonda ekranın ~%60'ını yiyor. Dahası pazaryeri seçici mobilde gizli → telefonda pazaryeri
  değiştirilemiyor. (Pazarlama sitesinin menüsü responsive; sadece asıl ürün değil.) → `app/dashboard/page.tsx:1389`

### Test
- **[P1-8] Hiç bileşen/render testi yok.** ~60 test var ama hepsi saf mantık (hesap, adaptör). Boş/bozuk sekme,
  mobil düzen, hata bandı hiç test edilmiyor — "20 milyon görünmez hata" tam olarak bunlar (render/etkileşim hataları).
- **[P1-9] Staging (ön izleme) kapısı ve deploy smoke-testi yok.** Deploy = tsc+vitest → doğrudan prod. Ön izleme URL'inde test yok.

---

## 🟢 P2 — CİLA (zaman buldukça)

- **[P2-1]** Panel "Ayarlar" sekmesindeki hesap bloğu salt-okunur; düzenleme yalnızca orphan `/settings`'te → tekrar/kafa karışıklığı.
- **[P2-2]** Kayıtta alınan `full_name` (ad soyad) hiçbir yerde gösterilmiyor/düzenlenmiyor.
- **[P2-3]** Kaydedilmiş ödeme yöntemi, bir sonraki çekim tutarı gösterilmiyor; deneme "tarih" gösteriyor, "kaç gün kaldı" saymıyor.
- **[P2-4]** Plan değiştirme (yükselt/düşür) yok — sadece satın al veya iptal. (İptal doğru çalışıyor: dönem sonuna kadar erişim kalıyor.)
- **[P2-5]** Ayarlar "Kaydet" butonu geri bildirim vermiyor (başarı/hata mesajı yok, catch yok). → `app/settings/page.tsx:87`
- **[P2-6]** `app/dashboard/page.tsx` 137KB tek istemci bileşeni → büyük paket / yavaş ilk yükleme.

---

## ✅ ZATEN İYİ OLAN (denetimde doğrulandı — güven ver)

- DB erişimi sağlıklı: bağlantı havuzu tükenmesi riski yok, service-role anahtarı yalnızca sunucuda.
- E-posta doğrulama, şifre sıfırlama, auth-guard akışları TAM ve çalışıyor.
- Boş/ilk-kullanım ekranları dürüst ve düzgün (sahte yeşil yok, "Henüz ürün yok" nötr durumu var).
- i18n tamamen Türkçe (gerçek İngilizce sızıntı yok; sadece kabul gören "Copilot/Stripe" gibi kelimeler).
- İptal akışı, idempotency (çift çekim koruması), RLS veri izolasyonu sağlam.
- Ödeme sonrası görünürlük (plan, durum, yenileme tarihi, iptal butonu) ARTIK var.

---

## SIRALAMA: NE ÖNCE?

**Reklamdan / para almadan ÖNCE (bu hafta):**
1. **[P0-6] Sentry ekle** — her şeyden önce; yoksa diğer hataları görmen imkânsız.
2. **[P0-5] Hesap/ayarlar sayfasını menüye bağla** — senin gördüğün "hesap yeri yok" bug'ı; küçük ve hızlı.
3. **[P0-1/P0-2] Gerçek yinelenen ödeme yolunu kur** (bir sağlayıcı: iyzico'yu prod'a aç + yenileme/webhook, VEYA Stripe) — gerçek para almadan önce şart.
4. **[P0-3/P0-4] Pro kilidini sunucuya taşı + fail-open'ı kapat** — gelir sızıntısını durdur.
5. **[P0-7/P0-8] Redis + worker'ın prod'da gerçekten çalıştığını doğrula/izle**, fail-open kapakları "kapalı"ya çevir.

**Lansmandan hemen sonra (ilk hafta):**
6. **[P0-9/P0-10 + P1-8] Gerçek Playwright E2E testlerini CI'a bağla** (tr.json metinlerine göre) — kalıcı güvenlik ağı.
7. **[P1-7] Paneli telefonda düzelt.**
8. **Yük testi (k6)** — 1000 eşzamanlı kullanıcıyı gerçekten dene.

**Sonra:** kalan P1'ler → P2 cila.

---

_Bu liste sistematik bir denetimin çıktısıdır, ama "canlı" bir belgedir: yukarıdaki 3 sistem (Sentry,
E2E-CI, yük testi) kurulunca, buraya girmemiş yeni hatalar da otomatik yüzeye çıkacak. Kusursuzluk
tek seferlik değil, bu sistemlerin sürekli çalışmasıyla gelir._
