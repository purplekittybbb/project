# TrueMargin — Finansal Güven Tasarımı (cursor-design-prompt)

Kaynak: *Finansal Arayüzlerde Kurumsal Güven, Estetik ve Nöro-Davranışsal Tasarım* (PDF).  
Uygulama: pazarlama, auth, onboarding, dashboard, modallar.

---

## 1. Renk semantiği (§4)

| Token | Hex | Kullanım |
|-------|-----|----------|
| `--tm-ink` | `#12181B` | Metin, başlık |
| `--tm-paper` | `#F7F6F2` | Arka plan (kağıt) |
| `--tm-ledger-green` | `#1F4D3A` | **Kâr / pozitif** — neon yeşil YASAK |
| `--tm-alert-clay` | `#B3442C` | **Zarar / uyarı** — agresif kırmızı YASAK |
| `--tm-copper` | `#9C6B3E` | CTA / aksiyon (sınırlı) |
| `--tm-mist` | `#DCD9D2` | Border, ayırıcı |

- Kar = yeşil (`--tm-ledger-green`), zarar = kil (`--tm-alert-clay`). Marka için tersine çevirme.
- Koyu operasyonel yüzey (dashboard): `[data-financial-surface="dark"]` → `--fin-profit` / `--fin-loss` okunaklı tonlar.

## 2. Tipografi (§4.2)

- Gövde: Inter; başlık: Inter Tight.
- **Tüm para ve yüzde alanları:** `.tnum` (tabular-nums) — jitter/dancing digits yasak.
- Hassasiyet: TRY için kuruş (`X,XX`) ledger’da; özet KPI’larda yuvarlama OK.

## 3. Görsel kapsülleme (§3.1)

- API anahtarı, kart, kimlik alanları: `.tm-secure-field-group` (border + hafif arka plan).
- Kilit ikonu **işlem noktasında** (submit yanında), footer’da değil.
- Ödeme kutusu sayfadan görsel olarak ayrılmış olmalı.

## 4. Formlar (§3.3)

- Tek sütun, lineer akış; hata sonrası alanları silme.
- Hata: `.tm-field-error` — suçlamayan, alan bazlı Türkçe mesaj.
- Çok sütunlu karma layout yok (kart son kullanma/CVC yan yana istisna).

## 5. Dashboard (§5)

- **3-30-300:** Sol üstte tek kritik özet (`DashboardSummaryHeader`).
- Kademeli açıklama: detay sekmede / tıklanınca.
- **Data-ink:** 3D pasta, chartjunk, ağır grid yok. Bar/line, direct labeling.
- Gerçek zamanlı: yanıp sönme yok; `.tm-num-transition` / yumuşak geçiş.

## 6. Mikro-metin (§6)

- Belirsiz “İşleniyor” yerine adım + süre tahmini.
- Finansal jargon minimum; aktif Türkçe ses.
- AI çıktıları: güven skoru / “sınırlı veri” kaçışı (XAI §7).

## 7. Yasaklar

- “Yeni!” rozetleri, reklam kutuları, sidebar pop-up, tutarsız buton stilleri.
- `animate-pulse` finansal rakamlarda.
- `emerald-*` / `red-*` Tailwind — yerine `.fin-profit` / `.fin-loss`.

## 8. Bileşen haritası

| Bileşen | PDF maddesi |
|---------|-------------|
| `NetProfitLedger` | Kapsül, tnum, data-ink |
| `LossAlarmBanner` | §4 sakin clay alarm |
| `MarketplaceApiKeyModal` | §3 kapsül + kilit |
| `SecurePaymentCapsule` | §3.1 ödeme |
| `DashboardSummaryHeader` | §5 3-sn kural |
| `hero.tsx` (marketing) | §4 çam yeşili hero, kapsül net kâr |
