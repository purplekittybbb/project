/** Shared number/currency formatting — every figure aligns the same way. */

const trNumber = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });

export function money(n: number, currency = "TRY"): string {
  const symbol = currency === "USD" ? "$" : "₺";
  return `${symbol}${trNumber.format(Math.round(n))}`;
}

export function pct(n: number, digits = 1): string {
  return `%${n.toFixed(digits)}`;
}

export function pp(n: number, digits = 1): string {
  return `${n.toFixed(digits)} puan`;
}
