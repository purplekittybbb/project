# profit-engine

Pazaryeri satıcılarının **settlement verisinden gerçek kârını** hesaplayan motor.

Şu an kapsam: **Trendyol + Türkiye.** Mimari, ileride başka pazaryeri/ülke
(ör. Amazon + ABD) eklendiğinde çekirdeğin değişmeyeceği şekilde tasarlandı.

## Tasarım İlkesi

Her pazaryerinin ham veri formatı farklıdır. Bu farkı sistemin geri kalanından
izole etmek için iki temel katman var:

1. **Connector** — pazaryerinden ham veri getirir, hesaplama yapmaz.
2. **Kanonik model** (`Transaction`) — pazaryerinden bağımsız ortak dil.
   Motorun geri kalanı sadece bunu bilir.

Her kanonik kayıt kendi bağlamını taşır: `marketplace_id`, `country_code`,
`currency`. Böylece yeni bir pazaryeri/ülke eklemek yalnızca **1 connector +
1 normalize fonksiyonu** gerektirir; `core/` ve üst akış değişmez.

## Klasör Yapısı

```
profit-engine/
  data/                  # ham ve örnek veriler
  connectors/
    base.py              # BaseConnector (soyut): fetch_raw()
    trendyol.py          # TrendyolConnector(BaseConnector)
  core/
    canonical.py         # Kanonik veri modeli: Transaction dataclass
    normalizer.py        # ham veri -> kanonik Transaction listesi
    profit.py            # kanonik Transaction -> kâr hesabı
  storage/
    raw_store.py         # ham veriyi değişmez (immutable) saklama
  main.py                # katmanları bağlayan giriş noktası
  README.md
```

## Veri Akışı

```
Connector.fetch_raw()  ->  raw_store (değişmez arşiv)
                       ->  normalizer  ->  Transaction[]  ->  profit  ->  sonuç
```

## Çalıştırma

```bash
python main.py
```

> Not: Şu an yalnızca iskelet. İş mantığı (`fetch_raw`, `normalize_trendyol`,
> `hesapla_kar`, `RawStore`) henüz uygulanmadı; bunlar `NotImplementedError`
> döner.

## Yol Haritası

- [ ] Trendyol settlement ham verisini getirme (`TrendyolConnector.fetch_raw`)
- [ ] Trendyol -> kanonik çeviri (`normalize_trendyol`)
- [ ] Kâr hesabı (`hesapla_kar`)
- [ ] Değişmez ham veri deposu (`RawStore`)
- [ ] İleride: Amazon + ABD connector'ı (çekirdek değişmeden)
```
