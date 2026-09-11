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
export const SCRAPER_BROWSER_CONTEXT = {
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  locale: "tr-TR",
  viewport: { width: 1280, height: 720 },
} as const;

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function openScraperPage(browser: any): Promise<ScraperPage> {
  const context = await browser.newContext(SCRAPER_BROWSER_CONTEXT);
  const page = await context.newPage();
  return page as ScraperPage;
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
    args: Chromium.args,
    executablePath,
    headless: true,
  });
  const page = await openScraperPage(browser);

  return {
    page,
    runtime: "serverless",
    close: async () => {
      await page.close?.();
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
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await openScraperPage(browser);
    return {
      page,
      runtime: "local",
      close: async () => {
        await page.close?.();
        await browser.close();
      },
    };
  } catch {
    const { chromium } = await import("playwright-core");
    const browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await openScraperPage(browser);
    return {
      page: page as unknown as ScraperPage,
      runtime: "local",
      close: async () => {
        await page.close();
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
