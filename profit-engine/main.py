"""profit-engine giriş noktası.

Katmanları birbirine bağlar:
    connector.fetch_raw()  ->  raw_store'a arşivle
                           ->  normalizer ile kanonik Transaction'a çevir
                           ->  profit ile kâr hesapla
"""

from connectors import TrendyolConnector
from core import hesapla_toplam, normalize_trendyol
from storage import RawStore


def run() -> None:
    """Uçtan uca akışı çalıştırır. (İskelet — henüz uygulanmadı.)"""
    connector = TrendyolConnector()
    store = RawStore()

    # 1. Ham veriyi getir
    raw = connector.fetch_raw()

    # 2. Ham veriyi değişmez şekilde arşivle
    store.save(marketplace_id="trendyol", seller_id="", raw=raw)

    # 3. Kanonik modele çevir
    transactions = normalize_trendyol(raw)

    # 4. Kâr hesapla
    results = hesapla_toplam(transactions)

    return results


if __name__ == "__main__":
    run()
