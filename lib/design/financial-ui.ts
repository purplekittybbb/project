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
