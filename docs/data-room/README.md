# TrueMargin — Data Room indeksi

Kaynak: *Hızlı Maksimum Yatırım Alma Stratejileri* (data room mimarisi) +
*Marketplace-Data-to-Credit* (Pre-seed day-1 artefaktlar).

Bu klasör **hukuki/finansal gizli belgeleri tutmaz**. Amaç: diligence ekibinin
“nerede ne var?” sorusuna hızlı cevap. Gerçek şirket evrakları (esas sözleşme,
cap table, NDA’lı mali tablolar) dışarıda / güvenli odada tutulur.

## 1. Şirket & yasal

| Belge | Konum | Not |
|-------|--------|-----|
| Ticaret unvanı / adres / MERSİS | `lib/legal/company.ts` | Gerçek değerler doldurulunca UI otomatik |
| Gizlilik / KVKK | `/gizlilik` | Yayında |
| Kullanım koşulları | `/kullanim-kosullari` | Yayında |
| İptal-iade | `/iptal-iade` | Yayında |

## 2. Ürün & teknik (yazılım wedge)

| Belge | Konum |
|-------|--------|
| Sistem röntgeni | `SISTEM_RONTGENI.md` |
| Operasyon günlüğü | `PROJECT_STATE.md` |
| Güven tasarımı kuralları | `PDF-GUVEN-TASARIM-KURALLARI.md` |
| Marj motoru | `lib/domain/margin-engine.ts`, `lib/engine.ts` |
| Underwriting modeli | `lib/domain/underwriting.ts` |
| Pazaryeri adaptörleri | `lib/adapters/*` |
| Decision ledger | `lib/domain/ledger.ts`, `/api/ledger/*` |
| RLS migrations | `supabase/migrations/0038_*.sql`, `0039_*.sql` |

## 3. Yatırımcıya açık canlı yüzeyler

| URL | Ne gösterir |
|-----|-------------|
| `/yatirimci` | Tez + seed backtest metrikleri + lisans dürüstlüğü |
| `/demo` | Seed dashboard (Financing sekmesi dahil) |
| `/reveal/seller-b` | Görünen → gerçek marj |
| `/financing/seller-b` | Limit, take-rate, karar izi vs incumbent |

## 4. Bilinçli olarak burada olmayanlar

- Lisanslı kredi ürünü / BDDK başvurusu (henüz yok — böyle iddia edilmez)
- SOC 2 sertifikası (yol haritası; iddia yok)
- Canlı üretim GMV / ARR tabloları (seed ≠ production)
- Cap table, term sheet, banka mutabakatları (gizli data room)

## 5. Sıralama tezi (Marketplace → Credit)

1. Analitik wedge (şimdi)  
2. Underwriting sinyali + lender LOI (sonraki)  
3. Bilanço / warehouse facility (en son)
