/**
 * Kompakt sayı biçimi — PDF §5.2.
 *
 * Veri-yoğun / tek-bakış (3 saniye) özet alanlarında büyük sayılar mantıklı
 * yuvarlanmalı: "1.234.567,89 USD" → "1,2M USD". SADECE özet/glance tile'larda
 * kullanılır; net kâr defteri, hesaplayıcı ve tablo satırlarında kuruş
 * hassasiyeti korunur (orada tam değer gösterilir).
 *
 * Kısaltma yalnızca milyon ve üzeri için yapılır; milyon altı tam tr-TR
 * gösterilir (bin/"B" belirsizliğinden kaçınmak için).
 */
function compactAbs(abs: number): string {
  if (abs >= 1_000_000_000) {
    return `${(abs / 1_000_000_000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}Mr`;
  }
  if (abs >= 1_000_000) {
    return `${(abs / 1_000_000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}M`;
  }
  return abs.toLocaleString("tr-TR", { maximumFractionDigits: 0 });
}

/** Kompakt para: ₺1,2M / $3,4M / ₺48.760. Negatifte "−" öne gelir. */
export function fmtCompactMoney(value: number, currency: string): string {
  const sym = currency === "USD" ? "$" : "₺";
  const sign = value < 0 ? "−" : "";
  return `${sign}${sym}${compactAbs(Math.abs(value))}`;
}

/** Kompakt adet/sayı: 1,2M / 12.400. */
export function fmtCompact(value: number): string {
  const sign = value < 0 ? "−" : "";
  return `${sign}${compactAbs(Math.abs(value))}`;
}
