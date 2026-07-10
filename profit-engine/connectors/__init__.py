"""Connector katmanı: pazaryerlerinden ham veri getiren adaptörler."""

from .base import BaseConnector
from .trendyol import TrendyolConnector

__all__ = ["BaseConnector", "TrendyolConnector"]
