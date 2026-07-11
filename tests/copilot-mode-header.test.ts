import { describe, expect, it, beforeEach, afterEach } from "vitest";

/**
 * The Copilot panel (app/dashboard/page.tsx) reads the X-Copilot-Mode response
 * header to decide whether to show "Rule-based response (AI not configured)".
 * These tests pin that contract at the API boundary so the UI indicator can
 * never silently drift from what actually produced the answer.
 */
async function importRoute() {
  return import("../app/api/chat/route");
}

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/chat — X-Copilot-Mode header", () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    if (originalKey !== undefined) process.env.ANTHROPIC_API_KEY = originalKey;
  });

  it("marks the response rule-based when ANTHROPIC_API_KEY is not set", async () => {
    const { POST } = await importRoute();
    const res = await POST(
      makeRequest({ messages: [{ role: "user", content: "What is the approved limit?" }], tenantId: "seller-b", channel: "trendyol" })
    );
    expect(res.headers.get("X-Copilot-Mode")).toBe("rule-based");
    const text = await res.text();
    expect(text.length).toBeGreaterThan(0);
  });

  it("marks the response rule-based when the seller/channel has no data (before the key check even matters)", async () => {
    const { POST } = await importRoute();
    const res = await POST(makeRequest({ messages: [{ role: "user", content: "hi" }], tenantId: "no-such-seller" }));
    expect(res.headers.get("X-Copilot-Mode")).toBe("rule-based");
  });

  it("still returns rule-based text content, never an empty/silent answer, when no key is configured", async () => {
    const { POST } = await importRoute();
    const res = await POST(
      makeRequest({ messages: [{ role: "user", content: "explain the margin" }], tenantId: "seller-b", channel: "trendyol" })
    );
    const text = await res.text();
    expect(text).toContain("margin");
  });
});
