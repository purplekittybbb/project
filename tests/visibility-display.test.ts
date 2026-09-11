import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { SharedVisibilityScan, WatchedVisibility } from "@/lib/domain/visibility";
import {
  formatVisibilityPage,
  formatVisibilityRank,
  pickWatchedVisibility,
} from "@/lib/visibility/display";
import { VisibilityPanel, VisibilityRankBadge } from "@/components/VisibilityRank";

function watch(
  sku: string,
  marketplace: string,
  keyword: string,
  scan: SharedVisibilityScan | null,
): WatchedVisibility {
  return {
    watch: {
      id: `${sku}-${keyword}`,
      tenantId: "u1",
      marketplace,
      sku,
      keyword,
      createdAt: "2026-09-01T00:00:00.000Z",
    },
    scan,
  };
}

function scan(overrides: Partial<SharedVisibilityScan> = {}): SharedVisibilityScan {
  return {
    id: "s1",
    marketplace: "trendyol",
    keyword: "kulaklık",
    sku: "SKU-A",
    rank: 4,
    page: 1,
    isIndexed: true,
    isOnFirstPage: true,
    scrapedAt: "2026-09-11T12:00:00.000Z",
    ...overrides,
  };
}

describe("pickWatchedVisibility", () => {
  it("returns null when the SKU is not watched", () => {
    expect(pickWatchedVisibility([watch("OTHER", "trendyol", "x", null)], "SKU-A")).toBeNull();
  });

  it("filters by marketplace unless combined", () => {
    const rows = [
      watch("SKU-A", "n11", "x", scan({ marketplace: "n11", rank: 9, scrapedAt: "2026-09-11T13:00:00.000Z" })),
      watch("SKU-A", "trendyol", "kulaklık", scan({ rank: 4 })),
    ];
    expect(pickWatchedVisibility(rows, "SKU-A", "trendyol")?.scan?.rank).toBe(4);
    expect(pickWatchedVisibility(rows, "SKU-A", "combined")?.scan?.rank).toBe(9);
  });

  it("prefers a row that has a scan over a pending watch", () => {
    const rows = [
      watch("SKU-A", "trendyol", "eski", null),
      watch("SKU-A", "trendyol", "kulaklık", scan({ rank: 2 })),
    ];
    expect(pickWatchedVisibility(rows, "SKU-A", "trendyol")?.scan?.rank).toBe(2);
  });
});

describe("formatVisibilityRank", () => {
  it("labels pending / missing / found states in Turkish", () => {
    expect(formatVisibilityRank(null)).toEqual({ label: "Tarama yok", tone: "pending" });
    expect(formatVisibilityRank(scan({ rank: null }))).toEqual({ label: "Bulunamadı", tone: "missing" });
    expect(formatVisibilityRank(scan({ rank: 4 }))).toEqual({ label: "Sıra 4", tone: "found" });
  });

  it("formatVisibilityPage uses 1-indexed page copy", () => {
    expect(formatVisibilityPage(scan({ page: 2, isOnFirstPage: false }))).toBe("2. sayfa");
    expect(formatVisibilityPage(scan({ page: null, isOnFirstPage: true }))).toBe("1. sayfa");
  });
});

describe("VisibilityRank UI", () => {
  const found = watch("SKU-A", "trendyol", "kulaklık", scan({ rank: 4 }));

  it("badge shows the shared rank and panel never names other watchers", () => {
    const badge = renderToStaticMarkup(createElement(VisibilityRankBadge, { row: found }));
    expect(badge).toContain("Sıra 4");
    expect(badge).toContain("SKU-A görünürlük");

    const panel = renderToStaticMarkup(createElement(VisibilityPanel, { row: found }));
    expect(panel).toContain("Arama görünürlüğü");
    expect(panel).toContain("kulaklık");
    expect(panel).toContain("1. sayfa");
    expect(panel).toContain("Dizinde");
    expect(panel).toContain("Sıra paylaşılan pazaryeri taramasıdır");
    expect(panel).not.toMatch(/user-|izleyen|başka satıcı/i);
  });

  it("pending watch renders Tarama yok without a rank", () => {
    const html = renderToStaticMarkup(
      createElement(VisibilityRankBadge, { row: watch("SKU-A", "trendyol", "x", null) }),
    );
    expect(html).toContain("Tarama yok");
    expect(html).not.toContain("Sıra");
  });
});
