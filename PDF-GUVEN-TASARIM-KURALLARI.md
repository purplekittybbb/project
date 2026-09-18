# Finansal Arayüzlerde Güven Tasarımı — Tam Kural Kaydı

> Kaynak PDF: "Finansal Arayüzlerde Kurumsal Güven, Estetik ve Nöro-Davranışsal Tasarım:
> Veri Görselleştirme ve Yapay Zeka Etkileşimi Üzerine Kapsamlı Bir Analiz" (18 sayfa).
> Bu dosya PDF'teki **her kuralı, örneği ve detayı** madde madde kaydeder ve TrueMargin'deki
> uygulama durumunu işaretler. Durum kodları: ✅ uygulandı · 🟡 kısmi · ⬜ eksik/kullanıcı verisi.

---

## §1 — Fintek Ekosisteminde Güvenin Nöropsikolojik ve Teorik Temelleri

- Geleneksel banka şubesinin fiziksel güveni (mimari, güvenlik görevlisi, kasa) yerini
  tamamen piksellere ve dijital arayüze bıraktı; "finansal bütünlük" ekran mikro
  etkileşimlerine indirgendi. ✅ (kavramsal temel)
- Kötü tasarım finansal uygulamada salt kullanılabilirlik sorunu değil, doğrudan
  **"sermaye kaybı riski"** olarak algılanır. ✅ (tasarım felsefesi)
- **S-O-R teorisi (Stimulus-Organism-Response):** arayüzün görsel kalitesi + sistem
  stabilitesi + bilgi mimarisi (uyarıcı) → kullanıcının güven düzeyi/algılanan risk
  (organizma) → yatırım/kullanma/tavsiye/terk (tepki). ✅
- Ampirik bulgu: **sistem kalitesi** (hız, yanıt süresi, hata oranları) algılanan riskle
  güçlü **negatif** korelasyon; **bilgi kalitesi** (doğruluk, güncellik, anlaşılırlık)
  güvenle **pozitif** korelasyon. ✅ (hız + doğru veri)
- Yavaş yüklenen sayfa + karmaşık arayüz → kurumsal yetkinlikte şüphe → düşük güven sarmalı. ✅
- İki güven bileşeni: **Bilişsel temelli güven** (teknik yetkinlik/güvenilirlik analitik
  değerlendirmesi) ve **Duygu temelli güven** (kişisel bağ, içgüdüsel, estetik). ✅

## §2 — Estetik-Kullanılabilirlik Etkisi ve Bilişsel Biyoloji

- **Estetik-Kullanılabilirlik Etkisi (Aesthetic-Usability Effect):** görsel çekici tasarım,
  daha az çekiciye kıyasla kullanımı kolay algılanır (1995 Hitachi, Kurosu & Kashimura;
  26 ATM varyasyonu, 252 katılımcı). ✅
- İşlevsel olarak aynı iki arayüzden **estetik açıdan rafine olan**, daha güvenilir ve üstün
  mühendislik ürünü olarak değerlendirilir. ✅
- Nöropsikolojik altyapı: **Bilişsel Akıcılık (Cognitive Fluency)** + **Halo Etkisi**.
  Hizalamaları kusursuz, beyaz boşluğu doğru, renk paleti dengeli arayüz → **düşük bilişsel
  yük** → beynin bunu genel kalite/güvenilirliğe genellemesi. ✅
- **Fogg / Stanford Web Güvenilirlik:** insanların **%46'sı** bir sitenin güvenilirliğini
  öncelikle görsel tasarıma (tipografi, sayfa düzeni, renkler, görsel hiyerarşi, fotoğraf
  kalitesi) bakarak değerlendiriyor. ✅
- Profesyonel görünüm için: gerçek/dürüst insanların olduğunu **fiziksel adresler ve iletişim
  bilgileriyle kanıtlamak**, **uzmanlığı ön plana çıkarmak**, **tipografik hatalardan arınmış
  kusursuz metin mimarisi**. ⬜ fiziksel adres/MERSİS (yapı hazır, gerçek veri bekliyor) · ✅ iletişim + Türkçe metin
- Sınır: estetik, güvenliğin/kullanılabilirliğin ikamesi değil. Para transferi çalışmıyorsa
  veya bakiye yanlışsa "tolerans halesi" hızla tükenir. ✅ (gerçek hesap doğru)
- Estetik, CRO için **temel altyapı** olarak ele alınmalı; süs değil, kullanıcıyı platformda
  tutan **tolerans tamponu** ve yatırım arzusu tetikleyicisi. ✅

## §3 — Algılanan Güvenlik: Kapsülleme ve Görsel İpuçları

- Kullanıcılar HTTPS/PCI'yı kod düzeyinde değerlendiremez; güveni **içgüdüsel his + görsel
  ipuçlarıyla** kurar. Güvenlik sadece arka planda değil, **ön yüzde gösterilmeli**. ✅

### §3.1 Görsel Kapsülleme (Visual Encapsulation)
- Kritik hassas veri alanları (**kredi kartı no, KYC belgeleri, cüzdan bağlama, hisse alım
  emri**) arayüzün geri kalanından **belirgin şekilde ayrıştırılmalı**. ✅
- Teknik: ince kenarlık (border), arka plan renk değişimi (örn. sayfa off-white iken kutu
  beyaz), veya hafif gölge (drop shadow) ile izole. ✅ (`tm-secure-field-group`)
- Baymard: aynı düzeyde şifrelense bile görsel kapsüllenmiş alanlar daha korunaklı algılanır. ✅
- En yüksek anksiyete anında **"dijital kasa"** hissi verir. ✅ (şifre alanı, API anahtarı, Stripe kart alanı)

### §3.2 Güven Sinyalleri ve Rozetlerin Stratejik Konumlandırılması
- Asma kilit (padlock), Norton/McAfee/GeoTrust rozetleri: **nereye konduğu** rozetin
  kendisinden daha önemli. ✅
- **Footer'a veya genel menüye koymak yetersiz** (sürtünme anında güven telkin etmez). ✅
- Doğru yer: rozet **kredi kartı alanının / "Yatırımı Onayla" butonunun tam yanına** veya
  **kapsüllenmiş alanın içine**. ✅ (submit yanında kilit + "256-bit şifreleme · KVKK")
- İlginç bulgu: 2016+ testlerde tamamen **kendi yapımı (homemade) asma kilit ikonları bile**
  birçok gerçek SSL rozetinden daha fazla algılanan güven yaratmış — beyin şifreleme görselini
  görmeye odaklanır. ✅ (`LockIcon`)

### §3.3 Hata Toleransı ve Form Dengeleme
- Güven, hata anında da test edilir (yanlış giriş / kart reddi). ✅
- **Luhn algoritması** ile kart no **yazılırken ön yüzde doğrulanmalı**. ✅ (Stripe)
- **Kart tipi (Visa, MasterCard vb.) otomatik algılanıp logolara yansıtılmalı.** ✅ (Stripe)
- **Boşluklar arayüz tarafından otomatik biçimlendirilmeli.** ✅ (Stripe)
- Hata durumunda **asla tüm form verisi silinmemeli** (kullanıcıyı tekrar girmeye zorlamamak). ✅
- Sadece hatalı alan işaretlenmeli, **kullanıcı suçlanmamalı**; **bağlamsal + yol gösterici
  (adaptive) doğrulama mesajları**. ✅ ("E-posta veya şifre kayıtlarımızla eşleşmiyor")
- **Gereksiz çok sütunlu (multicolumn) mizanpajlardan kaçınılmalı**; tamamen **lineer,
  öngörülebilir form akışı**. ✅ (kaydol/giriş/ödeme tek sütun)

## §4 — Renk Semantiği, Tipografi ve Kurumsal Hiyerarşi

Bir yatırımcı platformu ilk milisaniyelerde etiketler; renk = risk yönetimi + duygu durum mühendisliği.

### §4.1 Renk Psikolojisi (tablo)
- **Mavi (Lacivert / Gök / Gece Mavisi):** istikrar, profesyonellik, geleneksel güven, mantık,
  sadakat. Beynin analitik bölgesini uyarır. **Fintek'in evrensel taban rengi** (PayPal, Stripe,
  Barclays). Aşırı kullanımı "soğuk / kurumsal hantal" yapabilir. ✅ (`--tm-navy #13385E` — hero/marka)
- **Yeşil (Zümrüt/Nane/Çam/Turkuaz):** para, organik büyüme, servet, pozitif finansal aksiyon,
  tasarruf. Yatırım ekranlarında yükseliş/portföy büyümesi. **Koyu yeşil (#0E3B2E) kurumsallığı
  artırır.** **Neon/çok açık yeşil güvensizlik** hissi → zümrüt/çam tercih. ✅ (`--tm-ledger-green #1F4D3A`, sadece kâr/para)
- **Koyu Nötrler (Karakalem/Koyu Gri/Siyah):** lüks, premium, analitik derinlik, güç. Varlık
  yönetimi + profesyonel trading **karanlık mod** (TradingView, Robinhood Legend, Bloomberg);
  saatlerce ekrana bakan trader'ın göz yorgunluğunu azaltır. ✅ (dashboard koyu zinc)
- **Altın/Bakır/Mercan (Vurgu):** premium değer/miras (altın/bakır); uyarı/dikkat/pozitif aksiyon
  (mercan). **Yalnızca aksiyon butonları (CTA) veya VIP statüsü için, çok sınırlı alanlarda.**
  (Kripto cüzdanları, Revolut Metal, N26.) ✅ (CTA/aksiyon mavi `--tm-copper #2563C9`; bakır demote)
- Veri-yoğun alanlar: yüksek kontrastlı, **"Temiz Beyaz" / "Açık Gri"** arka plan → bilişsel yük
  azalır. ✅ (`--card: #ffffff`)
- Yenilikçilik için butonlarda parlak mor / **hafif degrade (gradient)** geçişleri modern imaj verir. ✅ (hero + `tm-btn-primary` degrade)
- **SERT KURAL:** Marka kimliği için renk yönünü değiştirmek ölümcül güven kaybı yaratır.
  **Kâr/kazanç HER ZAMAN yeşil (veya mavi); zarar/düşüş HER ZAMAN KIRMIZI.** ✅ (kâr yeşil `#1F4D3A`, zarar kırmızı `#C62828`)

### §4.2 Tipografi, Bilişsel Yük ve "Tabular Figures" (Eşaralıklı Rakamlar)
- Sayılar finansal arayüzde harflerden çok daha ağırlıklı (bakiye, anlık fiyat, yüzde getiri). ✅
- Önerilen font aileleri: **Inter, Manrope, Geist, Roboto, IBM Plex Mono.** ✅ (Inter + Inter Tight)
- **Zorunlu:** "Eşaralıklı (Monospaced)" font veya **"Tabular Figures / Tablolu Rakam"** özelliği.
  Orantılı fontta "1" dar, "8" geniş → canlı veri güncellenince genişlik değişir → **fiyat satırı
  titrer (jitter / dancing digits)** → sistem "hatalı/buggy" algısı, profesyonellik yok olur. ✅ (`.tnum` + `tabular-nums`)
- **TradingView** endüstri standardı olarak **IBM Plex Mono** kullanır → rakam değişiminde piksel
  hizası milimetrik sabit. ✅ (IBM Plex Mono yüklendi, `--font-mono`, tüm rakamlar)

## §5 — Veri Görselleştirme ve Dashboard Mimarisi

- Kullanıcı paneli "kitap gibi" değil **"görsel harita gibi"** tarar (NN/g). Akılda hazır soru
  vardır ("Bugün zararda mıyım?", "Hedeflere ulaştık mı?"). Panel keşif için değil, **asgari
  bilişsel yükle eyleme dönüştürülebilir hızlı yanıt** için tasarlanmalı. ✅
- **Dashboard türleri:** Operasyonel (trader; zaman hassasiyeti yüksek, sistem sağlığı, anlık emir,
  günlük PnL, alarm, anlık delta), Stratejik (CEO/CFO; yüksek özet, geçmiş kıyaslama, aylık/yıllık
  CAGR, statik, geniş perspektif), Analitik (analist/quant; filtreleme, brushing, drill-down, trend). ✅ (Operasyonel odaklı)

### §5.1 Bilişsel Yükün Azaltılması ve Bilgi Hiyerarşisi
- Her metrik eşit büyüklük/renk/vurguda = hiçbir şey vurgulanmamış. Hiyerarşi organizasyonel
  öncelikle belirlenmeli. Göz sayfayı **F veya Z harfi** şeklinde tarar. ✅
- **3-30-300 Kuralı + Yerleşim Geometrisi:** En kritik özet (**Toplam Bakiye, Günlük Net
  Kâr/Zarar, Bekleyen İşlemler**) **sol üst köşeye**. İyi panel: **3 sn**'de genel durum, **30 sn**'de
  bağlam/makro trend, **300 sn**'de detaylı mikro analiz (drill-down). ✅ (`DashboardSummaryHeader` sol-üst tek sayı)
- **Kademeli Açıklama (Progressive Disclosure):** ilk açılışta aşırı veri = amatör algısı. Günlük
  cüzdan hareketleri ana ekranda; **RSI/MACD, korelasyon matrisleri, sipariş derinliği (order books)**
  ikincil sekme/detay sayfasında gizli. Yeni başlayanı korkutmaz, profesyonelin derinliğini korur. ✅ (Pro sekmeler, açılır detay)
- **Bağlamsal Veri (Contextual Clues):** çıplak sayı anlamsız. "Günlük İşlem Hacmi: 1.5 Milyon
  Dolar" bağlamsız. Mutlaka **önceki güne/aya göre % değişim, endüstri ortalaması veya hedefe
  uzaklık** eklenmeli. ✅ ("puan düşük", "%X daha az zarar", sparkline)

### §5.2 Veri-Mürekkep Oranı (Data-Ink Ratio) ve Görsel Sadelik
- Edward Tufte; formül: (Arayüzde sadece veriyi ifade eden mürekkep) / (grafiği basmak için
  kullanılan toplam mürekkep). Profesyonel finansal grafikte oran **1'e olabildiğince yakın**. ✅
- **Chartjunk = çöp:** 3D (üç boyutlu) pasta efektleri, ağır/belirgin ızgara çizgileri (gridlines),
  kalın çerçeveler, estetik gölgeler → görsel gürültü. ✅ (yok)
- Yerine: minimalist, **iki boyutlu, temiz çizgi (line) ve çubuk (bar)** grafikler. ✅ (SVG şelale/çubuk)
- **Pasta grafiklerden (pie charts) kesinlikle kaçınılmalı** (çok nadir istisna hariç); insan gözü
  açıları ve 2B alanları kıyaslamada kötü. ✅ (hiç pasta yok)
- **Direkt etiketleme (direct labeling):** veri serilerinin sonuna metin etiketi doğrudan; lejant
  (legend) gidip gelme eforu en aza. ✅ (şelale/çubuk direkt etiket)
- **Sayı yuvarlama:** arayüzde aşırı/anlamsız yerine mantıklı yuvarlama. Örn. **"1.234.567,89 USD"
  → "1.23M USD"**. 🟡 (defter/hesaplayıcıda kuruş korunuyor — doğru; **dashboard özet tile'larında
  kompakt biçim henüz yok** — açık madde)

### §5.3 Gerçek Zamanlı Veri Akışı, Render Performansı ve Mikro-Animasyonlar
- Canlı fiyatta arayüz **yorgunluk/panik yaratmamalı**; agresif yanıp sönme (flashing) veya tüm
  ekranın sürekli yenilenmesi hem donanım/erişilebilirlik (epileptik risk) hem güven açısından
  zararlı. ✅ (flaş yok)
- Render motoru: TradingView (HTML5 Canvas) orta düzey için iyi ama devasa/yüksek frekansta lag +
  ~4000 mum limiti; SciChart (WebAssembly/C++) 100M+ nokta, GPU, 64-bit, takılmayan pürüzsüzlük.
  Kaydırma/yakınlaştırma (panning/zoom) **60 FPS** profesyonelliğin bir numaralı kriteri. 🟡 (özel SVG; canlı-tick akışı yok, gerekmiyor)
- **Delta İndikatörleri + Sparklines:** değişimi sadece renkle değil **yön sembolleriyle
  (yukarı/aşağı ok, delta)**; anlık değerin yanında **son 7 günlük küçük çizgi grafiği (sparkline)**. ✅ (dashboard ↑↓ + "Dönemsel Marj — Sparkline")
- **Zarif Mikro-Animasyonlar:** hücrenin/butonun kaba parlaması yerine **sadece değişen rakamın
  etrafında yumuşak atım (soft pulse)** VEYA **rakamın dikey kayarak güncellenmesi (odometre efekti)**.
  Animasyon süresi insan algısına uygun (**örn. buton renk geçişleri ~0.3 sn**). Gereksiz her türlü
  illüstrasyon/devasa animasyon finansal bağlamda kaçınılmalı. ✅ (`tm-roll` odometre + `tm-num-transition` 0.28sn)

## §6 — Duygusal Süreklilik ve Finansal Anksiyetenin Yönetimi

- Kullanıcı finansal uygulamayı "meraklı ve rahat" değil, **"savunmada, temkinli ve gergin (braced)"**
  ruh haliyle açar. Anksiyete **kozmetik değil yapısal** bir konudur (sıcak renkler/sevimli boş-durum
  illüstrasyonu ile hafifletilemez). ✅

### §6.1 Kontrol Algısı ve Sürecin Öngörülebilirliği
- Üç yapısal kalite: **Algılanan kontrol, öngörülebilirlik, duygusal süreklilik.** ✅
- **Algılanan Kontrol (Perceived Control):** belirsizlik alanlarını yok et. Bekleyen transferde
  robotik **"İşleniyor" / "Pending"** anksiyete artırır. Yerine **zaman damgalı + şeffaf UX metni:**
  *"Paranız bankaya iletildi, güvenlik ağında doğrulanıyor, Perşembe günü 14:00'te karşı hesaba
  geçmesi bekleniyor."* Her hareketin durumu **adım adım süreç çubuklarıyla (progress indicators)**
  açıkça görünür; para asla **"kaybolmuş"** hissi vermemeli. ✅ (nakit-akışı zaman-damgalı bant + Satış→Hakediş→Ödeme adım göstergesi)
- **Öngörülebilirlik (Predictability):** buton yerleşimi, navigasyon, ikonografi, uyarı mesajları
  her sayfada **tutarlı (consistency)**. Tutarsız tasarım = özensiz/hacklenebilir içgüdüsel ima. ✅ (tek tasarım sistemi)
- **Duygusal Süreklilik (Emotional Continuity):** web + mobil + push + e-posta bildirimleri **tek ses
  tonu ve tasarımsal bütünlük**. 🟡 (web tutarlı; e-posta/push tonu kısmen)

### §6.2 Şeffaflık ve Sürtünmesiz Doğrulama (KYC/Onboarding)
- KYC/onboarding, güvenin kazanıldığı/terkin en yüksek olduğu eşik. ✅
- Neden kimlik/adres/biyometrik istendiği, sıkıcı yasal metin yerine arayüzde **net, suçlayıcı olmayan,
  şeffaf dille:** *"Yasal bir zorunluluk ve hesabınızın güvenliğini sağlamak için."* ✅ (API modalı "yalnızca sipariş/ciro okumak için" + Maliyet "Neden önemli?")
- Uzun formlar bir kerede değil, **mantıksal adımlara bölünerek (progressive profiling) + ilerleme
  çubukları**. ✅ (`StepRail`: bağlan → plan → kart)
- Doğrulama sırasında **"Şu an arka planda ne yapılıyor ve işlem ne kadar sürecek?"** saniye saniye
  ekranda. ✅ (bağlantı aşamaları + "Genellikle 5–10 saniye sürer")

## §7 — Açıklanabilir Yapay Zeka (XAI) ve Güven Kalibrasyonu

- Platformlar veri panelinden → algoritmik botlar, robo-danışmanlar, dinamik kredi skorlama, YZ
  portföy önerilerine dönüşüyor. Derin modeller **"kara kutu (black box)"**. Yüksek riskli bağlamda
  matematiksel doğruluk tek başına yetmez; **şeffaflık + çıktıya güvenilebilmesi** zorunlu. **AB YZ
  Yasası (EU AI Act)** yüksek riskli sistemlerde Traceability + Explainability'yi yasal çerçeveye oturttu. ✅ (kural tabanlı şeffaflık; kredi modülü gerçek kullanıcıdan gizli)

### §7.1 İnsan-YZ Etkileşiminde Güven Kalibrasyonu (Trust Calibration)
- Amaç güveni "koşulsuz maksimize" değil, **Güven Kalibrasyonu**. Tuckman'ın Forming/Storming/
  Norming/Performing modeli gibi öngörülebilir yörünge. İki risk:
  1. **Aşırı Güven (Over-trust):** belirsiz/halüsinasyonlu YZ tavsiyesine körü körüne inanma → sermaye kaybı.
  2. **Eksik Güven / Algoritmik Kaçınma (Algorithmic Aversion):** doğru YZ kararını "kara kutu" diye reddetme. ✅
- XAI: doğruyken algılanan yetkinliği artır (eksik güveni engelle), yanılma payı varken şeffafça
  belirt (aşırı güveni engelle), human-in-the-loop denetim. Örtük güven (Implicit Trust) + açık güven
  (Explicit Trust). SHAP / Grad-CAM açık kalibrasyon; Echo State Networks örtük güven. ✅

### §7.2 Arayüzde Güven Skorları (Confidence UI) ve Kademeli Açıklama
- **Güven Arayüzü (Confidence UI):** YZ çıktısının yanına görsel olasılık / kesinlik / hata payı
  (margin of error) ata, insani dille anlat. ✅
- **Tablo satırı 1 — Güven Skorları (Confidence Visualization):** kararın eminlik derecesi. Sadece
  **"%72" demek yerine "Tahmin Güveni: Yüksek"** + renk kodları: **Yeşil=Yüksek, Turuncu=Orta,
  Kırmızı/Gri=Düşük**. (Hisse yön tahmini, kredi temerrüt, piyasa trend.) ✅ (talep kartı güven rozeti; Orta=amber)
- **Tablo satırı 2 — Karar Sınırlarının İfşası (Decision Boundaries):** YZ'nin ne bildiğini ve ne
  *bilmediğini* göster. Yeterli veri yoksa **"Sınırlı veriye dayanmaktadır, manuel inceleme önerilir"**
  zarif **kaçış kapağı (escape hatch)**. (Fraud alarmı, yeni kripto analizi.) ✅ (düşük güvende escape hatch)
- **Tablo satırı 3 — İnsan Denetimi (Human-in-the-Loop):** YZ'nin ağırlıklandırdığı faktörleri
  **grileştirilmiş kutularda (ghost text)** göster; kullanıcının **ezmesine (override)/düzenlemesine**
  izin ver. (Otomatik portföy rebalancing onayı.) ✅ (komisyon kategori oranı ghost text + override)
- **Kademeli Açıklama (Ne? Neden? Nasıl?)** — SAP XAI Fiori kılavuzları; 3 hiyerarşik seviye:
  - **Seviye 1 (İndikatör — Ne?):** sonucun YZ üretimi olduğunu gösteren **zarif rozet / parlak ikon**
    (örn. "AI Destekli"). Beklenti yönetimini başlatır. ✅ ("◇ AI destekli" rozeti)
  - **Seviye 2 (Basit Neden — Neden?):** ikon/link → araç ipucu (tooltip)/popover: *"Bu portföy önerisi,
    son 6 aylık işlem geçmişinizdeki düşük risk toleransınıza ve son teknoloji hissesi düşüşlerine
    dayanarak oluşturuldu."* İstatistik değil, **tamamen insani dil**. ✅ ("Neden bu tahmin?" açıklaması)
  - **Seviye 3 (Derinlemesine Mantık — Nasıl?):** şüpheci/analitik kullanıcı için "Detayları Gör" →
    **en önemli 3-5 faktörün ağırlıklandırıldığı (feature importance) grafikleri, karar ağaçları veya
    SHAP/LIME'ın basitleştirilmiş görselleştirmesi** açılan tam sayfa görünüm. 🟡 (satır içi ağırlıklı
    faktör çubukları eklendi; ayrı "tam sayfa" SHAP/LIME görünümü henüz yok)
- Bu yapı hem son tüketiciyi ürkütmez hem denetçinin (auditor) aradığı algoritmik şeffaflığı sunar. ✅

## §8 — Sonuç (Dört Sütun)

1. **Bilişsel Akıcılık + Estetik-Kullanılabilirlik** dönüşüm kaldıracı: ucuz/geçici algısı yaratan
   gereksiz animasyon, kalitesiz stok fotoğraf, karmaşık menü yok; lüks/analitik derinlik için koyu
   nötr + kurumsal mavi/yeşil; hassas alanlar Visual Encapsulation; işlem butonu yanında saygın rozet. ✅
2. **Veri Görselleştirme + Dashboard:** Tufte Data-Ink Ratio + 3-30-300; her piksel veriyi açıklamalı;
   3D/pasta çöpe; gerçek zamanlı akışta **Eşaralıklı/Tabular** tipografi (yoksa "titreme" ile buggy izlenim). ✅
3. **Duygusal Süreklilik + Şeffaflık:** finansal anksiyetenin tek çözümü kullanıcıya kontrol hissi
   (Perceived Control); indikatör/işlem onayı/hata mesajı finansal jargondan uzak, yol gösterici,
   sürecin aşamasını belirten insani microcopy (örn. **"Yapay zeka analiz ediyor, %80 tamamlandı"**). ✅
4. **XAI:** kara kutudan çıkar; görsel Güven Skorları (Confidence UI) + Ne/Neden/Nasıl kademeli açıklama
   + escape hatch. ✅
- Özet: yatırımcı, güvenliği sayfalarca politika okuyarak değil; sistemin ekranda gösterdiği **geometrik
  mükemmellik, verinin pürüzsüz akışı, anında şeffaf geri bildirim ve görsel kararlılık** sayesinde
  içgüdüsel hisseder. ✅

---

## Açık kalan maddeler (özet)

| # | Madde | PDF | Durum |
|---|-------|-----|-------|
| 1 | Dashboard özet tile'larında kompakt sayı (₺1,23M) | §5.2 | ⬜ kodlanabilir |
| 2 | XAI Seviye-3 ayrı "tam sayfa" SHAP/LIME görünümü | §7.2 | 🟡 satır içi çubuklar var, tam sayfa yok |
| 3 | Fiziksel adres + MERSİS/vergi no | §2 | ⬜ yapı hazır, gerçek şirket verisi bekliyor |
| 4 | E-posta/push bildirim tonu bütünlüğü | §6.1 | 🟡 web tutarlı |

Diğer tüm PDF kuralları uygulanmış durumda (✅).
