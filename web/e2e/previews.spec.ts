import { expect, test } from "@playwright/test";

const DESIGNS = ["a", "b", "c"] as const;
const PAGES = ["", "/search", "/dashboard", "/watchlist", "/company/NWSC", "/company/NWSC/financials", "/company/NWSC/valuation", "/company/NWSC/scenarios", "/company/NWSC/thesis"];

test("design hub links to every preview page", async ({ page }) => {
  await page.goto("/");
  for (const d of DESIGNS) for (const p of PAGES) await expect(page.locator(`a[href="/${d}${p}"]`).first()).toBeAttached();
});

for (const d of DESIGNS) {
  for (const p of PAGES) {
    test(`/${d}${p} renders without runtime errors and labels data as illustrative`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      const res = await page.goto(`/${d}${p}`);
      expect(res?.status()).toBe(200);
      await expect(page.getByText(/illustrative/i).first()).toBeAttached();
      expect(errors).toEqual([]);
      // Responsive layouts must never scroll horizontally at the page level.
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
}

test("valuation sliders recompute intrinsic value", async ({ page }, info) => {
  test.skip(info.project.name === "mobile");
  await page.goto("/c/company/NWSC/valuation");
  const value = page.getByText("Intrinsic value per share (model)").locator("xpath=following-sibling::*[1]");
  const before = await value.textContent();
  const wacc = page.getByRole("slider", { name: "WACC" }).first();
  await wacc.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(value).not.toHaveText(before ?? "");
});

test("command palette searches and navigates", async ({ page }, info) => {
  test.skip(info.project.name === "mobile");
  await page.goto("/a/dashboard");
  await page.keyboard.press("Control+k");
  await page.getByRole("textbox", { name: "Search companies" }).fill("meridian");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/a\/company\/MRDN$/);
});

test("unknown design or ticker returns 404", async ({ page }) => {
  expect((await page.goto("/z"))?.status()).toBe(404);
  expect((await page.goto("/a/company/AAPL"))?.status()).toBe(404);
});
