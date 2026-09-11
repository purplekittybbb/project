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
