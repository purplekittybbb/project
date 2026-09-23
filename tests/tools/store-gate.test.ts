import { describe, expect, it } from "vitest";
import {
  buildConnectUrl,
  evaluateStoreGate,
  userHasStoreConnection,
} from "../../lib/tools/store-gate";

describe("store gate", () => {
  it("builds connect URL with next param", () => {
    expect(buildConnectUrl("/araclar/net-kar")).toBe("/connect?next=%2Faraclar%2Fnet-kar");
  });

  it("requires sign-in for anonymous users", async () => {
    const result = await evaluateStoreGate(null, null, "/araclar/net-kar");
    expect(result.signedIn).toBe(false);
    expect(result.allowed).toBe(false);
    expect(result.loadError).toBeNull();
  });

  it("requires store when signed in without credentials or sales data", async () => {
    const mockSupabase = {
      from: (table: string) => ({
        select: () => ({
          eq: async () => ({
            count: table === "user_transactions" ? 0 : 0,
            error: null,
          }),
        }),
      }),
    };

    const hasStore = await userHasStoreConnection(mockSupabase as never, "u1");
    expect(hasStore).toBe(false);

    const gate = await evaluateStoreGate(mockSupabase as never, "u1", "/araclar/zarar-alarmi");
    expect(gate.signedIn).toBe(true);
    expect(gate.hasStore).toBe(false);
    expect(gate.allowed).toBe(false);
    expect(gate.loadError).toBeNull();
    expect(gate.connectUrl).toContain("/connect?next=");
  });

  it("allows when user has marketplace credentials", async () => {
    const mockSupabase = {
      from: (table: string) => ({
        select: () => ({
          eq: async () => ({ count: table === "marketplace_credentials" ? 2 : 0, error: null }),
        }),
      }),
    };

    const gate = await evaluateStoreGate(mockSupabase as never, "u1", "/araclar/liste-kalite");
    expect(gate.allowed).toBe(true);
    expect(gate.hasStore).toBe(true);
    expect(gate.loadError).toBeNull();
  });

  it("allows when user has CSV/manual sales rows but no credentials", async () => {
    const mockSupabase = {
      from: (table: string) => ({
        select: () => ({
          eq: async () => ({
            count: table === "user_transactions" ? 12 : 0,
            error: null,
          }),
        }),
      }),
    };

    const gate = await evaluateStoreGate(mockSupabase as never, "u1", "/araclar/net-kar");
    expect(gate.allowed).toBe(true);
    expect(gate.hasStore).toBe(true);
    expect(gate.loadError).toBeNull();
  });

  it("surfaces DB error instead of pretending there is no store", async () => {
    const mockSupabase = {
      from: () => ({
        select: () => ({
          eq: async () => ({ count: null, error: { message: "relation missing" } }),
        }),
      }),
    };

    const gate = await evaluateStoreGate(mockSupabase as never, "u1", "/araclar/net-kar");
    expect(gate.allowed).toBe(false);
    expect(gate.hasStore).toBe(false);
    expect(gate.loadError).toBe("relation missing");
  });
});
