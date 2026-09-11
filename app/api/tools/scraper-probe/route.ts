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
import { searchProductRank } from "@/lib/scrapers/visibility";

export const runtime = "nodejs";
export const maxDuration = 120;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
