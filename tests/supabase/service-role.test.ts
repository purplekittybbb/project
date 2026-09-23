import { afterEach, describe, expect, it } from "vitest";
import { createServiceRoleClient, hasServiceRoleConfig } from "@/lib/supabase/service-role";

describe("createServiceRoleClient", () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it("returns null when service role key is missing", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;
    expect(createServiceRoleClient()).toBeNull();
    expect(hasServiceRoleConfig()).toBe(false);
  });

  it("returns a client when URL and service role key are set", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-secret";
    delete process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;
    const client = createServiceRoleClient();
    expect(client).not.toBeNull();
    expect(hasServiceRoleConfig()).toBe(true);
  });

  it("throws if service role key is exposed via NEXT_PUBLIC_", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-secret";
    process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY = "leaked";
    expect(() => createServiceRoleClient()).toThrow(/must never be set/i);
  });
});
