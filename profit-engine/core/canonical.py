"""Kanonik veri modeli.

Bu modül motorun ortak dilidir. Connector ve normalizer katmanları farklı
pazaryerlerinin ham verisini buradaki `Transaction` tipine çevirir; profit ve
üst akış katmanları SADECE bu tipi bilir, hiçbir pazaryerine özgü detay görmez.

Önemli: her kayıt kendi bağlamını taşır (marketplace_id, country_code, currency).
Böylece ileride ABD/Amazon eklendiğinde mimari değişmez; aynı `Transaction`
farklı değerlerle doldurulur.
"""

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from enum import Enum


class IslemTipi(str, Enum):
    """İşlem tipi: satış geliri artırır, iade tersine çevirir."""

    SATIS = "satis"
    IADE = "iade"


@dataclass
class Transaction:
    """Pazaryerinden bağımsız tek bir işlem kaydı (kanonik model).

    Alanlar:
        seller_id:        Satıcı kimliği.
        marketplace_id:   Pazaryeri kimliği (ör. "trendyol", "amazon").
        country_code:     Ülke kodu, ISO 3166-1 alpha-2 (ör. "TR", "US").
        currency:         Para birimi, ISO 4217 (ör. "TRY", "USD").
        sku:              Ürün stok kodu.
        urun_adi:         Ürün adı.
        satis_fiyati:     Ürünün satış fiyatı (KDV dahil brüt).
        kdv_orani:        KDV oranı (ör. 0.20 = %20).
        komisyon_orani:   Pazaryeri komisyon oranı (ör. 0.15 = %15).
        kargo_maliyeti:   Kargo maliyeti.
        platform_bedeli:  Sabit platform/hizmet bedeli.
        cogs:             Satılan malın maliyeti (Cost of Goods Sold).
        islem_tipi:       satis / iade.
        tarih:            İşlem tarihi.
    """

    seller_id: str
    marketplace_id: str
    country_code: str
    currency: str
    sku: str
    urun_adi: str
    satis_fiyati: Decimal
    kdv_orani: Decimal
    komisyon_orani: Decimal
    kargo_maliyeti: Decimal
    platform_bedeli: Decimal
    cogs: Decimal
    islem_tipi: IslemTipi
    tarih: datetime
