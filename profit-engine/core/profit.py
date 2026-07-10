"""Kâr hesaplama motoru: kanonik Transaction -> kâr.

Girdisi yalnızca kanonik modeldir; bu yüzden pazaryerinden ve ülkeden bağımsızdır.
Para birimi, KDV ve komisyon gibi bilgileri kaydın kendisinden okur (sabit "TL"
varsaymaz). İade işlemleri (islem_tipi=IADE) net etkiyi tersine çevirir.
"""

from dataclasses import dataclass
from decimal import Decimal

from .canonical import Transaction


@dataclass
class ProfitResult:
    """Tek bir işlemin kâr hesabı sonucu.

    currency alanı, sonucun hangi para biriminde olduğunu taşır ki farklı
    ülke/pazaryeri kayıtları karıştırılmasın.
    """

    transaction: Transaction
    net_kar: Decimal
    currency: str


def hesapla_kar(transaction: Transaction) -> ProfitResult:
    """Tek bir kanonik işlem için net kârı hesaplar. (Henüz uygulanmadı.)"""
    raise NotImplementedError


def hesapla_toplam(transactions: list[Transaction]) -> list[ProfitResult]:
    """Bir işlem listesi için kâr sonuçlarını üretir. (Henüz uygulanmadı.)"""
    raise NotImplementedError
