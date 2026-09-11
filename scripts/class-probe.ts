import { chromium } from "playwright";

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ locale: "tr-TR" });
  const page = await context.newPage();
  await page.goto("https://www.trendyol.com/sr?q=usb+c+kablo&pi=1", { waitUntil: "networkidle", timeout: 20000 });
  const info = await page.evaluate(() => {
    const card = document.querySelector('[data-testid="product-card"]');
    if (!card) return "no card";
    const titleEl = card.querySelector("h3") ?? card.querySelector("h2");
    const priceEl = Array.from(card.querySelectorAll("*")).find(
      (el) => (el as HTMLElement).innerText?.match(/\d+[,.]?\d*\s*TL/)
    );
    return JSON.stringify({
      titleClass: titleEl?.className ?? "null",
      titleTag: titleEl?.tagName ?? "null",
      priceClass: (priceEl as HTMLElement)?.className ?? "null",
      priceTag: priceEl?.tagName ?? "null",
      priceText: (priceEl as HTMLElement)?.innerText?.slice(0, 40) ?? "null",
    }, null, 2);
  });
  console.log(info);
  await browser.close();
})().catch(console.error);
