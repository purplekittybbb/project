"""Normalizer katmanı: ham veri -> kanonik Transaction listesi.

Her pazaryeri için ayrı bir normalize fonksiyonu bulunur, ancak hepsi aynı
kanonik `Transaction` tipini üretir. Böylece üst katmanlar (profit, main)
pazaryeri farklarından habersiz kalır.
"""

from typing import Any

from .canonical import Transaction


def normalize_trendyol(raw: Any) -> list[Transaction]:
    """Ham Trendyol settlement verisini kanonik Transaction listesine çevirir.

    Bu fonksiyon Trendyol'a özgü alan adlarını okuyup her kaydın
    marketplace_id="trendyol", country_code="TR", currency="TRY" gibi
    bağlam bilgilerini doldurmalıdır. (Henüz uygulanmadı.)
    """
    raise NotImplementedError
