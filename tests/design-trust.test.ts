import { describe, expect, it } from "vitest";
import { finLossClass, finProfitClass, finSignedClass } from "@/lib/design/financial-ui";

describe("PDF §4 — fin-profit / fin-loss sınıfları", () => {
  it("kâr sınıfı tnum içerir", () => {
    expect(finProfitClass()).toContain("fin-profit");
    expect(finProfitClass()).toContain("tnum");
  });

  it("zarar sınıfı tnum içerir", () => {
    expect(finLossClass()).toContain("fin-loss");
    expect(finLossClass()).toContain("tnum");
  });

  it("finSignedClass işaret seçer", () => {
    expect(finSignedClass(5)).toContain("fin-profit");
    expect(finSignedClass(-1)).toContain("fin-loss");
  });
});
