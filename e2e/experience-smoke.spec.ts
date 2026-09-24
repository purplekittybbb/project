import { expect, test } from "@playwright/test";

const PUBLIC_OK = [
  "/",
  "/pricing",
  "/araclar",
  "/araclar/kar-hesapla",
  "/demo",
  "/signup",
  "/login",
  "/sss",
  "/hakkimizda",
];

test.describe("experience smoke", () => {
  for (const path of PUBLIC_OK) {
    test(`${path} is not a 404`, async ({ page }) => {
      const res = await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(res?.ok() ?? false).toBeTruthy();
      await expect(page.getByRole("heading", { name: /Sayfa bulunamadı/i })).toHaveCount(0);
    });
  }

  test("homepage does not sell fake reviews", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Kullananlar ne diyor/i })).toHaveCount(0);
    await expect(page.getByText(/Elif K\./)).toHaveCount(0);
    await expect(page.getByText(/temsili senaryolar/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /Örnek paneli incele/i })).toBeVisible();
  });

  test("guest calculator stays honest on garbage price", async ({ page }) => {
    await page.goto("/araclar/kar-hesapla", { waitUntil: "domcontentloaded" });
    await page.locator('input[inputmode="decimal"]').first().fill("-999");
    await expect(page.getByRole("status")).toContainText(/büyük bir sayı/i);
  });
});
