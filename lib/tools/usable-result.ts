/**
 * Whether a standalone tool envelope delivered usable market data.
 * Cached/stale hits count as usable. Queued is not a finished result.
 * Preview / empty live scrapes / explicit error are unusable (quota refund).
 */
export function isUsableStandaloneResult(
  toolId: string,
  result: { mode: string; data: unknown },
): boolean {
  if (result.mode === "queued") return false;
  if (result.mode === "cached" || result.mode === "stale") return true;
  if (result.mode === "preview") return false;

  const data = (result.data ?? {}) as Record<string, unknown>;
  if (typeof data.error === "string" && data.error.length > 0) return false;

  if (toolId === "price-track") {
    const prices = (data.prices as Array<{ price: number }> | undefined) ?? [];
    return prices.some((p) => Number.isFinite(p.price) && p.price > 0);
  }

  if (toolId === "top100") {
    const items = (data.items as Array<{ price: number }> | undefined) ?? [];
    return items.some((item) => Number.isFinite(item.price) && item.price > 0);
  }

  // visibility / index-check — any structured outcome without error is usable
  return true;
}
