/**
 * Playwright browser session factory.
 *
 * ARCHITECTURE RULE: NEVER instantiate a browser session directly in
 * business logic — only in API routes or cron jobs. All scraping functions
 * accept `ScraperPage` as a parameter to enable mock injection in tests.
 *
 * Runtime strategy:
 *   - Vercel / AWS Lambda → @sparticuz/chromium + playwright-core
 *   - Local dev           → full `playwright` package (devDependency) when available
 */

import { tmpdir } from "node:os";
import { join } from "node:path";

// Sparticuz reads this at module init (before al2023.tar.br extraction). Must be
// set before the first `@sparticuz/chromium` import — see sparticuz/chromium#340.
if (process.env.VERCEL && !process.env.AWS_LAMBDA_JS_RUNTIME) {
  process.env.AWS_LAMBDA_JS_RUNTIME = "nodejs22.x";
}

/** Realistic desktop Chrome profile — matches scripts/selector-probe.ts. */
export const SCRAPER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export const SCRAPER_VIEWPORT = { width: 1280, height: 720 };

/** Context options for local Playwright (full package). */
export const SCRAPER_BROWSER_CONTEXT = {
  userAgent: SCRAPER_USER_AGENT,
  locale: "tr-TR",
  viewport: SCRAPER_VIEWPORT,
} as const;

/** Append UA + language flags without breaking Sparticuz default args. */
export function scraperChromiumArgs(baseArgs: string[]): string[] {
  return [...baseArgs, `--user-agent=${SCRAPER_USER_AGENT}`, "--lang=tr-TR"];
}

/**
 * Minimal interface mirroring the Playwright `Page` surface used by our scrapers.
 */
export interface ScraperPage {
  goto(
    url: string,
    options?: { waitUntil?: string; timeout?: number },
  ): Promise<unknown>;
  content(): Promise<string>;
  title?(): Promise<string>;
  waitForSelector?(selector: string, options?: { timeout?: number }): Promise<unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  evaluate?<T>(fn: (arg: any) => T, arg?: unknown): Promise<T>;
  close?(): Promise<void>;
}

export interface BrowserSession {
  page: ScraperPage;
  close(): Promise<void>;
  /** Where the session was launched — useful for diagnostics. */
  runtime: "serverless" | "local";
}

export function isServerlessRuntime(): boolean {
  return Boolean(
    process.env.VERCEL ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.AWS_EXECUTION_ENV,
  );
}

interface OpenScraperPageResult {
  page: ScraperPage;
  /** Tear down page (and context when applicable). */
  dispose: () => Promise<void>;
}

/**
 * Open a scraper page with realistic browser fingerprinting.
 *
 * Serverless (Sparticuz + playwright-core): use default context via
 * browser.newPage() + launch args. Custom browser.newContext() options break
 * frame init on goto (_initializer TypeError) in Lambda.
 *
 * Local: full newContext() with UA, locale, viewport (selector-probe parity).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function openScraperPage(browser: any, runtime: "serverless" | "local"): Promise<OpenScraperPageResult> {
  if (runtime === "serverless") {
    const page = await browser.newPage();
    await page.setViewportSize(SCRAPER_VIEWPORT);
    // browser.newContext({ locale: "tr-TR" }) breaks frame init in Lambda
    // (_initializer TypeError — see module comment), so locale can't be set
    // via context here. Without it, Accept-Language defaults to the
    // Chromium build's locale (not tr-TR), and Trendyol geo/lang-redirects
    // the request to /en/select-country — an empty page with zero product
    // cards. setExtraHTTPHeaders on the page (not the context) sidesteps
    // the newContext bug and fixes that redirect.
    await page.setExtraHTTPHeaders({ "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.3" });
    return {
      page: page as ScraperPage,
      dispose: async () => {
        await page.close();
      },
    };
  }

  const context = await browser.newContext({
    userAgent: SCRAPER_USER_AGENT,
    locale: "tr-TR",
    viewport: SCRAPER_VIEWPORT,
  });
  const page = await context.newPage();
  return {
    page: page as ScraperPage,
    dispose: async () => {
      await page.close();
      await context.close();
    },
  };
}

async function launchServerlessBrowser(): Promise<BrowserSession> {
  const chromiumPack = await import("@sparticuz/chromium");
  const { setupLambdaEnvironment } = chromiumPack;
  const { chromium: playwrightChromium } = await import("playwright-core");
  const Chromium = chromiumPack.default;

  // Sparticuz API: property setter disables WebGL stack in serverless.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Chromium as any).setGraphicsMode = false;

  const executablePath = await Chromium.executablePath();
  // al2023.tar.br extracts NSS/NSPR libs to /tmp/al2023/lib — do not overwrite
  // LD_LIBRARY_PATH with the chromium binary dir (/tmp) only.
  setupLambdaEnvironment(join(tmpdir(), "al2023", "lib"));

  const browser = await playwrightChromium.launch({
    args: scraperChromiumArgs(Chromium.args),
    executablePath,
    headless: true,
  });
  const { page, dispose } = await openScraperPage(browser, "serverless");

  return {
    page,
    runtime: "serverless",
    close: async () => {
      await dispose();
      await browser.close();
    },
  };
}

async function launchLocalBrowser(): Promise<BrowserSession> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const playwright: any = require("playwright");
    const browser = await playwright.chromium.launch({
      headless: true,
      args: scraperChromiumArgs(["--no-sandbox", "--disable-setuid-sandbox"]),
    });
    const { page, dispose } = await openScraperPage(browser, "local");
    return {
      page,
      runtime: "local",
      close: async () => {
        await dispose();
        await browser.close();
      },
    };
  } catch {
    const { chromium } = await import("playwright-core");
    const browser = await chromium.launch({
      headless: true,
      args: scraperChromiumArgs(["--no-sandbox", "--disable-setuid-sandbox"]),
    });
    const { page, dispose } = await openScraperPage(browser, "local");
    return {
      page: page as unknown as ScraperPage,
      runtime: "local",
      close: async () => {
        await dispose();
        await browser.close();
      },
    };
  }
}

/**
 * Create a real Playwright browser session.
 *
 * Returns `null` when launch fails (callers fall back to preview mode).
 */
export async function createBrowserSession(): Promise<BrowserSession | null> {
  try {
    if (isServerlessRuntime()) {
      return await launchServerlessBrowser();
    }
    return await launchLocalBrowser();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[createBrowserSession] launch failed:", message);
    return null;
  }
}
