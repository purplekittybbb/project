# TrueMargin Asistan — Chrome Uzantısı

Trendyol Partner ve Hepsiburada Partner sayfalarında çalışarak kendi ürünleriniz için
**gerçek net kâr/zarar hesabı** yapmanızı sağlar.

---

## v1.1 Kapsamı

**Yapılanlar:**
- Taban fiyat (break-even) hesaplama
- Hedef marj için satış fiyatı hesaplama
- Net kâr ve gerçek marj yüzdesi gösterimi
- Trendyol / Hepsiburada / N11 partner sayfalarında yüzen buton
- Partner panelindeki **kendi** satış fiyatını, ürün adını ve barkodunu okumayı
  dener (best-effort — panel HTML'i eşleşmezse sessizce boş bırakır, hiçbir
  zaman uydurma bir değer göstermez)
- **Hesabı Bağla**: dashboard'da oluşturduğunuz kişisel token'ı yapıştırarak
  uzantıyı TrueMargin hesabınıza bağlayabilirsiniz. Bağlıyken "Hesaptan Getir"
  butonu, sayfadaki ürünü hesabınızdaki gerçek satış verinizle eşleştirip
  maliyet/kargo alanlarını gerçek verinizden doldurur.
- Form değerleri pazaryerine göre ayrı ayrı `chrome.storage.local`'da kalır

**Hâlâ YAPILMAYANLAR:**
- Rakip fiyat analizi yok (v2'de gelecek)
- "Hesaptan Getir" dışında canlı API / pazaryeri çağrısı yok
- Bulut senkronizasyonu yalnızca token bağlıyken ve yalnızca aradığınız ürün
  için çalışır — arka planda otomatik senkron yok

---

## Chrome'a Kurulum (Geliştirici Modu)

1. Chrome'u açın ve `chrome://extensions` adresine gidin
2. Sağ üstte **"Geliştirici modu"**nu açın
3. **"Paketsiz uzantı yükle"** butonuna tıklayın
4. Bu `chrome-extension/` klasörünü seçin
5. Uzantı yüklendikten sonra Trendyol Partner'a gidin — sağ üstte "TM" butonu görünecektir

---

## Hesabı Bağlama

1. TrueMargin dashboard'unda **Uzantı** sekmesine gidin
2. **"Bağlan"** butonuna tıklayıp gösterilen token'ı kopyalayın (yalnızca bir kez gösterilir)
3. Uzantının popup'ında üstteki alana yapıştırıp **"Bağla"**'ya tıklayın
4. Bir ürün sayfasında popup'ı açtığınızda artık **"Hesaptan Getir"** butonu görünür

Token yalnızca cihazınızdaki `chrome.storage.local`'da tutulur; sunucu tarafında
yalnızca token'ın SHA-256 özeti saklanır (ham token hiçbir zaman kaydedilmez).

---

## Kullanım

1. Trendyol Partner veya Hepsiburada Partner sayfasını açın
2. Araç çubuğundaki **TrueMargin** ikonuna tıklayarak popup'ı açın
3. Bağlıysanız **"Hesaptan Getir"**'i deneyin; eşleşme yoksa veya bağlı değilseniz şu alanları elle doldurun:
   - **Maliyet (₺)** — ürünün net maliyeti (COGS)
   - **Kargo (₺)** — kargo maliyeti
   - **Komisyon (%)** — pazaryeri komisyon oranı (örn. 15 için Trendyol tekstili)
   - **KDV (%)** — komisyon üzerindeki KDV oranı (genellikle 20)
   - **Hedef Marj (%)** — ulaşmak istediğiniz net marj (varsayılan: 15)
4. **Hesapla** butonuna tıklayın

---

## Sonuçların Yorumu

| Satır | Açıklama |
|-------|----------|
| **Taban Fiyat** | Bu fiyatın altında zarar edersiniz (break-even noktası) |
| **Hedef Satış Fiyatı** | Girdiğiniz marj yüzdesine ulaşmak için gereken fiyat |
| **Net Kâr** | Hedef fiyattan elde edilecek kâr (yeşil = pozitif, kırmızı = zarar) |
| **Gerçek Marj** | Gerçek net kâr marj yüzdesi |

---

## Formüller

```
Taban Fiyat  = (Maliyet + Kargo) / (1 - k × (1 + v))
Hedef Fiyat  = (Maliyet + Kargo) / (1 - k × (1 + v) - m)
Net Kâr      = Fiyat - Maliyet - Kargo - Komisyon - KDV

k = komisyon oranı (0-1)
v = KDV oranı      (0-1)
m = hedef marj     (0-1)
```

---

## Yol Haritası

**v2 (planlanan):**
- Trendyol ürün sayfasından otomatik rakip fiyat dağılımı analizi
- Arama sıralaması görünürlük kontrolü
- Hesaba bağlıyken otomatik (buton beklemeden) eşleşme

---

## Geliştirici Notları

- Build adımı yoktur — tüm kod saf JavaScript (vanilla JS)
- Node.js bağımlılığı yoktur
- Gerçek `icon16.png` / `icon48.png` / `icon128.png` dosyaları `icons/` klasöründedir
- "Hesaptan Getir" `app/api/extension/lookup/route.ts`'e (production: matsorular.vercel.app)
  Bearer token ile çağrı yapar — bkz. `manifest.json`'daki `host_permissions`
