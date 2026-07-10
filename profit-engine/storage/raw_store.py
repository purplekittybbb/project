"""Ham veri deposu: değişmez (immutable / append-only) saklama.

Ham veri "gerçeğin kaynağı"dır. Hesaplama hatası bulunduğunda orijinale dönüp
yeniden işleyebilmek için ham veri asla değiştirilmez, yalnızca eklenir.
Kanonik model ve kâr sonuçları bu ham veriden türetilen katmanlardır.
"""

from typing import Any


class RawStore:
    """Ham veriyi dokunmadan saklayan depo. (İskelet.)"""

    def __init__(self, base_path: str = "data"):
        self.base_path = base_path

    def save(self, marketplace_id: str, seller_id: str, raw: Any) -> str:
        """Ham veriyi değiştirmeden kaydeder ve referansını (yol/ID) döner.

        (Henüz uygulanmadı.)
        """
        raise NotImplementedError

    def load(self, reference: str) -> Any:
        """Daha önce kaydedilmiş ham veriyi referansına göre getirir.

        (Henüz uygulanmadı.)
        """
        raise NotImplementedError
