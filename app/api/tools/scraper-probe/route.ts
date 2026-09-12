/**
 * GET /api/tools/scraper-probe
 *
 * Pre-deploy diagnostic: launches serverless/local Chromium and runs one
 * lightweight Trendyol visibility scrape. Protected by CRON_SECRET.
 *
 * Use on Vercel preview before enabling live guest tools in production.
 */

import { NextResponse } from "next/server";
import { createBrowserSession, isServerlessRuntime } from "@/lib/scrapers/browser";
import { searchProductRank, buildSearchUrl } from "@/lib/scrapers/visibility";

export const runtime = "nodejs";
export const maxDuration = 120;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

/**
 * TEMPORARY diagnostic path (?diag=1) — bypasses searchProductRank's selector
 * loop and instruments the raw page (console + network) to determine WHY
 * hydration produces zero product cards in the serverless runtime while the
 * same selectors succeed locally (see scripts/selector-probe.ts).
 *
 * Remove once the root cause behind cards=0/outcome=empty_extraction on
 * production is confirmed and the real fix is in place.
 */
async function runDiagnostic(page: unknown, started: number, runtime: "serverless" | "local") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = page as any;
  const consoleMessages: string[] = [];
  const responses: Array<{ url: string; status: number }> = [];

  if (typeof p.on === "function") {
    p.on("console", (msg: { type: () => string; text: () => string }) => {
      consoleMessages.push(`${msg.type()}: ${msg.text()}`);
    });
    p.on("pageerror", (err: Error) => {
      consoleMessages.push(`pageerror: ${err.message}`);
    });
    p.on("response", (res: { url: () => string; status: () => number }) => {
      const url = res.url();
      if (url.includes("trendyol.com")) {
        responses.push({ url, status: res.status() });
      }
    });
  }

  const url = buildSearchUrl("trendyol", "bluetooth kulaklık", 1);
  await p.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });

  // Give client-side hydration a fixed window, independent of selector waits.
  await new Promise((resolve) => setTimeout(resolve, 8_000));

  const diag = await p.evaluate(() => {
    return {
      readyState: document.readyState,
      scriptTagCount: document.querySelectorAll("script").length,
      bodyTextLength: document.body?.innerText?.length ?? 0,
      hasNextData: Boolean(document.getElementById("__NEXT_DATA__")),
      cardCounts: {
        productCardTestId: document.querySelectorAll('[data-testid="product-card"]').length,
        pCardWrppr: document.querySelectorAll(".p-card-wrppr").length,
        article: document.querySelectorAll("article").length,
      },
      title: document.title,
    };
  });

  return NextResponse.json({
    ok: true,
    mode: "diagnostic",
    runtime,
    diag,
    consoleMessages: consoleMessages.slice(0, 30),
    trendyolResponses: responses.slice(0, 30),
    elapsedMs: Date.now() - started,
  });
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isDiag = new URL(req.url).searchParams.get("diag") === "1";
  const started = Date.now();
  const session = await createBrowserSession();

  if (!session) {
    return NextResponse.json(
      {
        ok: false,
        mode: "preview",
        runtime: isServerlessRuntime() ? "serverless" : "local",
        error: "Browser session unavailable — check Vercel logs for launch error.",
        elapsedMs: Date.now() - started,
      },
      { status: 503 },
    );
  }

  if (isDiag) {
    try {
      return await runDiagnostic(session.page, started, session.runtime);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json(
        { ok: false, mode: "diagnostic-error", runtime: session.runtime, error: message, elapsedMs: Date.now() - started },
        { status: 500 },
      );
    } finally {
      await session.close();
    }
  }

  try {
    const result = await searchProductRank(
      {
        marketplace: "trendyol",
        keyword: "bluetooth kulaklık",
        targetTitle: "kulaklık",
        maxPages: 1,
      },
      session.page,
    );

    const sample = result.results.slice(0, 3).map((r) => ({
      title: r.title,
      price: r.price,
      position: r.position,
    }));

    return NextResponse.json({
      ok: !result.errorCode,
      mode: "live",
      runtime: session.runtime,
      serverless: isServerlessRuntime(),
      found: result.found,
      rank: result.rank,
      resultsCount: result.results.length,
      error: result.error,
      errorCode: result.errorCode,
      sample,
      elapsedMs: Date.now() - started,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        ok: false,
        mode: "error",
        runtime: session.runtime,
        error: message,
        elapsedMs: Date.now() - started,
      },
      { status: 500 },
    );
  } finally {
    await session.close();
  }
}
