# TrueMargin Asistan — Chrome Uzantısı

Trendyol Partner ve Hepsiburada Partner sayfalarında çalışarak kendi ürünleriniz için
**gerçek net kâr/zarar hesabı** yapmanızı sağlar.

---

## v1 Kapsamı

**v1'de yapılanlar:**
- Taban fiyat (break-even) hesaplama
- Hedef marj için satış fiyatı hesaplama
- Net kâr ve gerçek marj yüzdesi gösterimi
- Trendyol / Hepsiburada / N11 partner sayfalarında yüzen buton
- Form değerleri `chrome.storage.local` ile kalır
- Partner panelindeki **kendi** satış fiyatını okur (rakip sayfası yok)

**v1'de YAPILMAYANLAR:**
- Rakip fiyat analizi yok (v2'de gelecek)
- Canlı API / pazaryeri çağrısı yok — tüm hesaplamalar tarayıcı içi
- Bulut senkronizasyonu yok

---

## Chrome'a Kurulum (Geliştirici Modu)

1. Chrome'u açın ve `chrome://extensions` adresine gidin
2. Sağ üstte **"Geliştirici modu"**nu açın
3. **"Paketsiz uzantı yükle"** butonuna tıklayın
4. Bu `chrome-extension/` klasörünü seçin
5. Uzantı yüklendikten sonra Trendyol Partner'a gidin — sağ üstte "TM" butonu görünecektir

---

## Kullanım

1. Trendyol Partner veya Hepsiburada Partner sayfasını açın
2. Araç çubuğundaki **TrueMargin** ikonuna tıklayarak popup'ı açın
3. Şu alanları doldurun:
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
- Trendyol ürün sayfasından otomatik fiyat okuma
- Rakip fiyat dağılımı analizi
- Arama sıralaması görünürlük kontrolü
- TrueMargin hesabıyla senkronizasyon

---

## Geliştirici Notları

- Build adımı yoktur — tüm kod saf JavaScript (vanilla JS)
- Node.js bağımlılığı yoktur
- `icons/` klasöründe gerçek PNG dosyaları olmadan da çalışır (Chrome uyarı verir)
- Üretim için `icon16.png` ve `icon48.png` dosyalarını `icons/` klasörüne ekleyin
