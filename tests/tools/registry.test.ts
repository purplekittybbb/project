import { describe, expect, it } from "vitest";
import {
  STANDALONE_TOOLS,
  STORE_REQUIRED_TOOLS,
  getToolBySlug,
  isStandaloneToolId,
} from "../../lib/tools/registry";

describe("tool registry", () => {
  it("has five standalone and six store-required tools", () => {
    expect(STANDALONE_TOOLS).toHaveLength(5);
    expect(STORE_REQUIRED_TOOLS).toHaveLength(6);
  });

  it("includes barcode analysis store tool", () => {
    expect(getToolBySlug("barkod-analizi")?.id).toBe("barcode-analysis");
  });

  it("includes guest profit calculator", () => {
    expect(getToolBySlug("kar-hesapla")?.id).toBe("profit-calc");
  });

  it("maps slugs to definitions", () => {
    expect(getToolBySlug("gorunurluk")?.id).toBe("visibility");
    expect(getToolBySlug("net-kar")?.category).toBe("store");
  });

  it("identifies standalone tool ids", () => {
    expect(isStandaloneToolId("top100")).toBe(true);
    expect(isStandaloneToolId("profit")).toBe(false);
  });
});
