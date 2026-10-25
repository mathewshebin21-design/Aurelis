/**
 * Milestone 5.2: company search and company overview, end to end against the real API.
 * Data is the SYNTHETIC fixture (Fixture Corp, FXTR) seeded into the e2e database only.
 */
import { expect, test, type Page } from "@playwright/test";
import { fmtByUnit, fmtCurrency } from "../../src/lib/api/format.ts";

const API = `http://127.0.0.1:${process.env.E2E_API_PORT ?? 8100}`;

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && !m.text().includes("404") && errors.push(m.text()));
  return errors;
}

async function noHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
}

test("search lists covered companies and SEC registrants without data, honestly labelled", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/terminal/search");
  const coverage = page.getByRole("table", { name: "Covered companies" });
  await expect(coverage.getByRole("link", { name: /FXTR/ })).toBeVisible();
  await expect(coverage.getByText("EUFX")).toHaveCount(0); // listed with the SEC, but no statements

  await page.getByRole("searchbox", { name: "Search companies" }).or(page.getByLabel("Search companies")).fill("fixture");
  await expect(page).toHaveURL(/\?q=fixture/);
  const results = page.getByRole("table", { name: "Search results" });
  const fxtr = results.getByRole("row", { name: /FXTR/ });
  const eufx = results.getByRole("row", { name: /EUFX/ });
  await expect(fxtr.getByText("Statements")).toBeVisible();
  await expect(eufx.getByText("Not ingested")).toBeVisible();
  await noHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test("search with no match says so instead of showing an empty table", async ({ page }) => {
  await page.goto("/terminal/search?q=zzqqxx");
  await expect(page.getByText("No SEC registrant matches “zzqqxx”")).toBeVisible();
});

test("command palette searches the live index and opens a company", async ({ page }, info) => {
  test.skip(info.project.name === "mobile", "keyboard shortcut");
  await page.goto("/terminal/search");
  await page.keyboard.press("Control+K");
  await page.getByRole("textbox", { name: "Search issuers" }).fill("FXTR");
  await expect(page.getByRole("option").first()).toContainText("Fixture Corp");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/terminal\/company\/FXTR$/);
  await expect(page.getByRole("heading", { level: 1, name: "Fixture Corp (synthetic)" })).toBeVisible();
});

test("overview shows engine values from the API, stale filings and limitations explicitly", async ({ page, request }) => {
  const errors = watchErrors(page);
  const metrics = await (await request.get(`${API}/v1/companies/FXTR/metrics?limit=5`)).json();
  const latest: string = metrics.periods.at(-1);
  const gm = metrics.metrics.find((m: { key: string; period: string }) => m.key === "gross_margin" && m.period === latest);
  const card = await (await request.get(`${API}/v1/companies/FXTR/scorecard`)).json();

  await page.goto("/terminal/company/FXTR");
  await expect(page.getByRole("heading", { level: 1, name: "Fixture Corp (synthetic)" })).toBeVisible();
  await expect(page.getByText("SEC filings", { exact: true })).toBeVisible();

  // Stale filings: the fixture's last 10-K is from 2024, so a newer filing is overdue.
  await expect(page.getByTestId("freshness")).toContainText("Newer filing expected");
  await expect(page.getByTestId("freshness")).toContainText("through 2024-09-28");
  await expect(page.getByTestId("data-quality")).toContainText("was due by 2025-02-11; it has not been ingested");

  // Values are the engine's, formatted for display only.
  await expect(page.getByText(`Key metrics · ${latest}`)).toBeVisible();
  await expect(page.getByTestId("metric-gross_margin")).toContainText(fmtByUnit(gm.value, gm.unit));
  await expect(page.getByTestId("line-Revenue")).toContainText(fmtCurrency("1200000000"));
  // Unavailable metrics are labelled with the engine's reason, never shown as zero.
  await expect(page.getByTestId("metric-roic")).toContainText("Not available");
  await expect(page.getByTestId("data-quality")).toContainText("not available");

  await expect(page.getByTestId("health-total")).toHaveText(`${card.total}/100`);
  await expect(page.getByTestId("pillar-coverage")).toContainText("20/20");
  await expect(page.getByTestId("market-data-note")).toContainText("No licensed price feed");
  await expect(page.getByText("No AI research has been generated for this company")).toBeVisible();
  await noHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test("a registrant without ingested statements shows no figures", async ({ page }) => {
  await page.goto("/terminal/company/EUFX");
  await expect(page.getByText("Filings for Euro Fixture SE (synthetic) have not been ingested")).toBeVisible();
  await expect(page.getByText("Not ingested", { exact: true })).toBeVisible();
  await expect(page.getByText(/Key metrics/)).toHaveCount(0);
  await expect(page.getByTestId("health-total")).toHaveCount(0);
});

test("unknown tickers get a 404 with a way back to search", async ({ page }) => {
  const res = await page.goto("/terminal/company/NOSUCHCO");
  expect(res?.status()).toBe(404);
  await expect(page.getByText("Unknown company")).toBeVisible();
  await expect(page.getByRole("link", { name: "Search the SEC company index" })).toBeVisible();
});

test("watchlist is kept on this device and survives a reload", async ({ page }) => {
  await page.goto("/terminal/company/FXTR");
  await page.getByRole("button", { name: "Add FXTR to watchlist" }).click();
  await page.goto("/terminal/watchlist");
  await expect(page.getByRole("link", { name: "FXTR" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("link", { name: "FXTR" })).toBeVisible();
  await page.getByRole("button", { name: "Remove FXTR from watchlist" }).click();
  await expect(page.getByText("Your watchlist is empty")).toBeVisible();
});

test("sections that are still in development are disabled, not broken links", async ({ page }) => {
  await page.goto("/terminal/company/FXTR");
  const tabs = page.getByRole("navigation", { name: "Company sections" });
  await expect(tabs.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
  await expect(tabs.locator('[aria-disabled="true"], [aria-disabled=""]').first()).toBeVisible();
});

test("the terminal proxy refuses admin endpoints", async ({ request }) => {
  const r = await request.post("/terminal/api/v1/admin/ingest/FXTR");
  expect(r.status()).toBe(404);
});
