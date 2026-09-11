import { afterEach, describe, expect, it, vi } from "vitest";
import { createBrowserSession, isServerlessRuntime } from "@/lib/scrapers/browser";

describe("isServerlessRuntime", () => {
  const env = process.env;

  afterEach(() => {
    process.env = { ...env };
  });

  it("detects Vercel", () => {
    process.env.VERCEL = "1";
    expect(isServerlessRuntime()).toBe(true);
  });

  it("is false locally", () => {
    delete process.env.VERCEL;
    delete process.env.AWS_LAMBDA_FUNCTION_NAME;
    delete process.env.AWS_EXECUTION_ENV;
    expect(isServerlessRuntime()).toBe(false);
  });
});

describe("createBrowserSession", () => {
  it("returns a local session when playwright is available", async () => {
    if (isServerlessRuntime()) return;
    const session = await createBrowserSession();
    expect(session).not.toBeNull();
    expect(session?.runtime).toBe("local");
    await session?.close();
  }, 30_000);
});
