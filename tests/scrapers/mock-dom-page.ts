/**
 * Mock ScraperPage that runs page.evaluate against a linkedom Document.
 * Production scrapers use real Playwright evaluate; tests need no Chromium binary.
 */

import { parseHTML } from "linkedom";
import type { ScraperPage } from "../../lib/scrapers/browser";

/**
 * Build a ScraperPage whose `evaluate` runs the given fn against a DOM
 * built from the current HTML fixture (linkedom).
 */
export function makeDomMockPage(htmlPages: string[]): ScraperPage {
  let callCount = 0;
  let currentHtml = htmlPages[0] ?? "<html></html>";

  return {
    goto: async () => {
      const idx = Math.min(callCount, htmlPages.length - 1);
      currentHtml = htmlPages[idx] ?? "<html></html>";
      callCount++;
      return { status: () => 200 };
    },
    content: async () => currentHtml,
    title: async () => {
      const m = currentHtml.match(/<title[^>]*>([^<]*)<\/title>/i);
      return m?.[1]?.trim() ?? "";
    },
    waitForSelector: async () => null,
    evaluate: async <T>(fn: (arg: unknown) => T, arg?: unknown): Promise<T> => {
      const { window, document } = parseHTML(currentHtml);

      // linkedom exposes textContent; scrapers prefer innerText — alias it.
      const proto = window.Element?.prototype as
        | (Element & { innerText?: string })
        | undefined;
      if (proto && !Object.prototype.hasOwnProperty.call(proto, "innerText")) {
        Object.defineProperty(proto, "innerText", {
          get(this: Element) {
            return this.textContent ?? "";
          },
          configurable: true,
        });
      }

      const prevDoc = (globalThis as { document?: Document }).document;
      const prevWin = (globalThis as { window?: unknown }).window;
      (globalThis as { document: Document }).document = document as unknown as Document;
      (globalThis as { window: unknown }).window = window;

      try {
        return (fn as (a: unknown) => T)(arg);
      } finally {
        if (prevDoc === undefined) {
          delete (globalThis as { document?: Document }).document;
        } else {
          (globalThis as { document: Document }).document = prevDoc;
        }
        if (prevWin === undefined) {
          delete (globalThis as { window?: unknown }).window;
        } else {
          (globalThis as { window: unknown }).window = prevWin;
        }
      }
    },
  };
}

/** No-op — kept for test afterAll compatibility. */
export async function closeMockDomBrowser(): Promise<void> {
  // linkedom needs no teardown
}
