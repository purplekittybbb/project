/** Shared Turkish formatting for tool result panels. */

export function fmtTry(value: number): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function fmtPct(value: number, digits = 1): string {
  const sign = value >= 0 ? "+" : "−";
  return `${sign}${Math.abs(value).toFixed(digits)}%`;
}

export function fmtInt(value: number): string {
  return new Intl.NumberFormat("tr-TR").format(Math.round(value));
}

/**
 * Turkish relative time for "this result was fetched X ago" freshness
 * labels — shown on every scraper result (live/cached/stale alike) so a
 * guest always knows exactly how current their data is, not just when it's
 * stale. Honest-by-default rather than only flagging the bad case.
 */
export function fmtRelativeTr(isoString: string): string {
  const t = new Date(isoString).getTime();
  if (Number.isNaN(t)) return "bilinmiyor";
  const diffSec = Math.max(0, Math.round((Date.now() - t) / 1000));

  if (diffSec < 30) return "az önce";
  if (diffSec < 60) return `${diffSec} saniye önce`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} dakika önce`;
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `${diffHour} saat önce`;
  const diffDay = Math.round(diffHour / 24);
  return `${diffDay} gün önce`;
}
