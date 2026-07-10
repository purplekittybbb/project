"""Trendyol pazaryeri connector'ı.

Trendyol settlement verisini (API veya CSV) getirmekten sorumludur.
Şimdilik iskelet; iş mantığı sonra eklenecek.
"""

from typing import Any

from .base import BaseConnector


class TrendyolConnector(BaseConnector):
    """Trendyol'a özgü ham veri getirme connector'ı."""

    def __init__(self, seller_id: str | None = None, credentials: dict | None = None):
        self.seller_id = seller_id
        self.credentials = credentials or {}

    def fetch_raw(self) -> Any:
        """Trendyol settlement ham verisini getirir. (Henüz uygulanmadı.)"""
        raise NotImplementedError
