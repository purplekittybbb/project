"""Connector katmanı için soyut temel sınıf.

Her pazaryeri connector'ı (Trendyol, ileride Amazon vb.) bu sözleşmeyi uygular.
Connector'ın tek sorumluluğu HAM veriyi getirmektir; hesaplama, yorumlama ya da
kanonik modele çevirme işini yapmaz.
"""

from abc import ABC, abstractmethod
from typing import Any


class BaseConnector(ABC):
    """Tüm pazaryeri connector'larının uyduğu soyut arayüz."""

    @abstractmethod
    def fetch_raw(self) -> Any:
        """Pazaryerinden ham (dokunulmamış) veriyi getirir.

        Dönen değer pazaryerine özgü olabilir (ör. dict listesi, CSV satırları).
        Kanonik modele çevirme işi normalizer katmanına aittir.
        """
        raise NotImplementedError
