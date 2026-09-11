/**
 * Pure presentation helpers for watched + shared visibility.
 * No I/O — safe to unit-test and reuse from badge / panel / dashboard.
 */

import type { SharedVisibilityScan, WatchedVisibility } from "../domain/visibility";

export type VisibilityTone = "found" | "missing" | "pending";

export interface VisibilityRankLabel {
  label: string;
  tone: VisibilityTone;
}

/** Pick the current visibility row for a SKU (newest shared scan wins). */
export function pickWatchedVisibility(
  rows: WatchedVisibility[],
  sku: string,
  marketplace?: string,
): WatchedVisibility | null {
  const matches = rows.filter((row) => {
    if (row.watch.sku !== sku) return false;
    if (!marketplace || marketplace === "combined") return true;
    return row.watch.marketplace === marketplace;
  });
  if (matches.length === 0) return null;

  const withScan = matches.filter((row) => row.scan);
  const pool = withScan.length > 0 ? withScan : matches;
  pool.sort((a, b) => {
    const ta = a.scan?.scrapedAt ? Date.parse(a.scan.scrapedAt) : 0;
    const tb = b.scan?.scrapedAt ? Date.parse(b.scan.scrapedAt) : 0;
    return tb - ta;
  });
  return pool[0] ?? null;
}

export function formatVisibilityRank(scan: SharedVisibilityScan | null): VisibilityRankLabel {
  if (!scan) return { label: "Tarama yok", tone: "pending" };
  if (scan.rank == null) return { label: "Bulunamadı", tone: "missing" };
  return { label: `Sıra ${scan.rank}`, tone: "found" };
}

export function formatVisibilityPage(scan: SharedVisibilityScan): string {
  if (scan.page == null) return scan.isOnFirstPage ? "1. sayfa" : "Sayfa yok";
  return `${scan.page}. sayfa`;
}

export function formatVisibilityScrapedAt(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(ms));
}
