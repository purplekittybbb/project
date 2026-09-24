/**
 * Turkey uses UTC+3 year-round (no DST since 2016).
 * Marketplace APIs return UTC instants; slicing toISOString() drops those
 * into the previous UTC day for 00:00–02:59 Istanbul time.
 */

const ISTANBUL_OFFSET_MS = 3 * 60 * 60 * 1000;

export function istanbulDayString(input: string | number | Date): string {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() + ISTANBUL_OFFSET_MS).toISOString().slice(0, 10);
}

/** Calendar day in Istanbul for "now", or empty-input fallback. */
export function istanbulTodayString(): string {
  return istanbulDayString(new Date());
}
