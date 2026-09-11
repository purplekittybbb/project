import { describe, expect, it } from "vitest";
import {
  FALLBACK_INTERNAL_CATEGORY,
  mapToInternalCategory,
} from "../lib/domain/internal-category";
import { resolveCommissionRate } from "../lib/adapters/marketplace-adapter";
import { REPRESENTATIVE_TRENDYOL_FEES } from "../lib/adapters/trendyol";
import { REPRESENTATIVE_HEPSIBURADA_FEES } from "../lib/adapters/hepsiburada";

describe("mapToInternalCategory", () => {
  it("keeps exact internal bucket names", () => {
    expect(mapToInternalCategory("Ev & Yaşam")).toBe("Ev & Yaşam");
    expect(mapToInternalCategory("Elektronik")).toBe("Elektronik");
    expect(mapToInternalCategory("Moda")).toBe("Moda");
    expect(mapToInternalCategory("Kozmetik")).toBe("Kozmetik");
    expect(mapToInternalCategory("Anne & Bebek")).toBe("Anne & Bebek");
    expect(mapToInternalCategory("Diğer")).toBe("Diğer");
  });

  it("maps official / leaf marketplace strings onto the commission buckets", () => {
    expect(mapToInternalCategory("Sports Shoes")).toBe("Moda");
    expect(mapToInternalCategory("Dress")).toBe("Moda");
    expect(mapToInternalCategory("Giyim")).toBe("Moda");
    expect(mapToInternalCategory("Görüntü Sistemleri")).toBe("Elektronik");
    expect(mapToInternalCategory("Elektronik/Kulaklık")).toBe("Elektronik");
    expect(mapToInternalCategory("Anne Bebek Beşiği")).toBe("Anne & Bebek");
    expect(mapToInternalCategory("Parfüm")).toBe("Kozmetik");
    expect(mapToInternalCategory("Ev Tekstil")).toBe("Ev & Yaşam");
  });

  it("empty / unknown → Diğer and never throws", () => {
    expect(mapToInternalCategory("")).toBe(FALLBACK_INTERNAL_CATEGORY);
    expect(mapToInternalCategory("   ")).toBe("Diğer");
    expect(mapToInternalCategory(null)).toBe("Diğer");
    expect(mapToInternalCategory(undefined)).toBe("Diğer");
    expect(mapToInternalCategory("Kırtasiye")).toBe("Diğer");
    expect(mapToInternalCategory("????")).toBe("Diğer");
    expect(() => mapToInternalCategory("")).not.toThrow();
  });
});

describe("resolveCommissionRate — missing category never throws", () => {
  it("Trendyol: empty/unknown uses defaultCommission (0.15), not an error", () => {
    expect(resolveCommissionRate(REPRESENTATIVE_TRENDYOL_FEES, "")).toBe(0.15);
    expect(resolveCommissionRate(REPRESENTATIVE_TRENDYOL_FEES, "Kırtasiye")).toBe(0.15);
    expect(resolveCommissionRate(REPRESENTATIVE_TRENDYOL_FEES, "Diğer")).toBe(0.15);
  });

  it("Trendyol: Elektronik/Kulaklık uses the Elektronik table rate", () => {
    expect(resolveCommissionRate(REPRESENTATIVE_TRENDYOL_FEES, "Elektronik/Kulaklık")).toBe(0.12);
  });

  it("Hepsiburada: empty uses defaultCommission (0.14); Elektronik uses 0.11", () => {
    expect(resolveCommissionRate(REPRESENTATIVE_HEPSIBURADA_FEES, "")).toBe(0.14);
    expect(resolveCommissionRate(REPRESENTATIVE_HEPSIBURADA_FEES, "Elektronik")).toBe(0.11);
  });
});
