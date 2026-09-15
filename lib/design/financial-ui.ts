/**
 * PDF §4 — kâr/zarar renk sınıfları. Neon emerald/red kullanma.
 */

export function finProfitClass(extra = ""): string {
  return `fin-profit tnum ${extra}`.trim();
}

export function finLossClass(extra = ""): string {
  return `fin-loss tnum ${extra}`.trim();
}

export function finSignedClass(value: number, extra = ""): string {
  return (value >= 0 ? finProfitClass : finLossClass)(extra);
}

/** Form hata border — tm-alert-clay */
export const FIELD_ERROR_BORDER = "border-[var(--tm-alert-clay)]";
export const FIELD_ERROR_TEXT = "text-[var(--tm-alert-clay)]";

/** Alan bazlı olumlu/onay metni — tm-ledger-green. */
export const FIELD_SUCCESS_TEXT = "text-[var(--tm-ledger-green)]";

/**
 * Koyu/doygun marka yüzeyleri için (örn. --tm-ledger-green hero bandı)
 * hata/başarı metni — temel tonlar bu zeminde kontrastı düşük kalır.
 * globals.css'teki [data-financial-surface="dark"] --fin-loss/--fin-profit
 * tonlarıyla eşleşir.
 */
export const FIELD_ERROR_TEXT_ON_DARK = "text-[#d17a62]";
export const FIELD_SUCCESS_TEXT_ON_DARK = "text-[#6baa88]";
