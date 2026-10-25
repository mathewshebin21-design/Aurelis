/** Terminal data selection: lookups only, gaps never turned into zeros. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { caveats, lineFor, metricFor, periodLabel, seriesOrGaps, unavailable, type Line, type Metric } from "../src/lib/terminal/select.ts";
import { companyRoutes, tickerFromPath } from "../src/lib/terminal/routes.ts";

const metric = (key: string, period: string, value: string | null, extra: Partial<Metric> = {}): Metric => ({
  key, label: key, unit: "ratio", formula: "", period, value, inputs: [], assumptions: [], reason: value === null ? "Inputs missing" : null, ...extra,
});

test("metric and line lookups match the API's period labels", () => {
  const ms = [metric("gross_margin", "FY2024", "0.4"), metric("gross_margin", "FY2025", "0.5")];
  assert.equal(metricFor(ms, "gross_margin", "FY2025")?.value, "0.5");
  assert.equal(metricFor(ms, "roic", "FY2025"), undefined);
  assert.equal(periodLabel({ fiscal_period: "FY", fiscal_year: 2025 }), "FY2025");
  assert.equal(periodLabel({ fiscal_period: "Q3", fiscal_year: 2026 }), "Q3 2026");
  const line = { line_key: "revenue", fiscal_period: "FY", fiscal_year: 2025, value: "1" } as Line;
  assert.equal(lineFor([line], "revenue", "FY2025"), line);
});

test("a series with any missing period is not plotted; the gaps are reported", () => {
  assert.deepEqual(seriesOrGaps(["FY1", "FY2"], (p) => ({ FY1: "1.5", FY2: "2" })[p]), { ok: true, values: [1.5, 2] });
  assert.deepEqual(seriesOrGaps(["FY1", "FY2", "FY3"], (p) => ({ FY1: "1", FY2: null, FY3: undefined })[p]), { ok: false, missing: ["FY2", "FY3"] });
  assert.deepEqual(seriesOrGaps(["FY1"], () => "0"), { ok: true, values: [0] }); // a reported zero is a value
});

test("caveats are de-duplicated and unavailable metrics carry the engine's reason", () => {
  const ms = [
    metric("a", "FY2025", "1", { assumptions: ["total_debt (FY2025): Partial"] }),
    metric("b", "FY2025", "2", { assumptions: ["total_debt (FY2025): Partial"] }),
    metric("c", "FY2025", null, { label: "ROIC", reason: "Operating income missing" }),
    metric("d", "FY2024", null),
  ];
  assert.deepEqual(caveats(ms, "FY2025"), ["total_debt (FY2025): Partial"]);
  assert.deepEqual(unavailable(ms, "FY2025"), [{ label: "ROIC", reason: "Operating income missing" }]);
});

test("terminal routes encode tickers and read them back from paths", () => {
  assert.equal(companyRoutes("brk.b").financials, "/terminal/company/BRK.B/financials");
  assert.equal(tickerFromPath("/terminal/company/aapl/valuation"), "AAPL");
  assert.equal(tickerFromPath("/terminal/search"), null);
  assert.equal(tickerFromPath("/c/company/NWSC"), null); // previews keep their own routing
});
