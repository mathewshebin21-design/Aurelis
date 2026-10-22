/**
 * Financial engine tests. Expected values are worked by hand (shown in the
 * comments) rather than produced by the code under test.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as m from "../src/lib/finance/metrics.ts";
import { runDcf, wacc, costOfEquity, gordonTerminalValue, presentValue, sensitivityMatrix, probabilityWeighted, DcfInputError, type DcfAssumptions } from "../src/lib/finance/dcf.ts";
import { healthScore, scoreBand, HEALTH_RULES, valuationSignal } from "../src/lib/finance/score.ts";
import { COMPANY_DATA } from "../src/lib/data/build.ts";

const close = (a: number | null, b: number, eps = 1e-6) => {
  assert.ok(a !== null, "expected a number, got null");
  assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
};

test("growth, CAGR and margins", () => {
  close(m.growth(110, 100), 0.1);
  assert.equal(m.growth(100, 0), null);
  // 100 → 133.1 over 3 years = 10% CAGR (1.1³ = 1.331)
  close(m.cagr(100, 133.1, 3), 0.1);
  close(m.margin(25, 200), 0.125);
  assert.equal(m.margin(5, 0), null);
});

test("returns on capital", () => {
  // ROE: 120 / avg(500, 700) = 120 / 600 = 0.2
  close(m.roe(120, 500, 700), 0.2);
  // ROIC: EBIT 200, tax 25% → NOPAT 150; IC avg(900, 1100) = 1000 → 15%
  close(m.roic(200, 0.25, 900, 1100), 0.15);
  close(m.investedCapital(400, 800, 200), 1000);
});

test("liquidity, leverage and coverage", () => {
  close(m.currentRatio(300, 200), 1.5);
  close(m.quickRatio(80, 70, 200), 0.75);
  close(m.debtToEquity(500, 1000), 0.5);
  close(m.debtToEbitda(600, 200), 3);
  close(m.netDebtToEbitda(600, 100, 250), 2);
  close(m.interestCoverage(300, 50), 6);
  assert.equal(m.interestCoverage(300, 0), null);
  close(m.enterpriseValue(1000, 300, 100), 1200);
  close(m.median([3, null, 1, 2, 10]), 2.5);
});

test("CAPM and WACC", () => {
  // 4% + 1.2 × 5% = 10%
  close(costOfEquity(0.04, 1.2, 0.05), 0.1);
  // E 800, D 200; ke 10%, kd 5%, t 25% → 0.8·0.10 + 0.2·0.05·0.75 = 0.0875
  close(wacc({ equityValue: 800, debtValue: 200, costOfEquity: 0.1, preTaxCostOfDebt: 0.05, taxRate: 0.25 }), 0.0875);
});

test("terminal value and discounting", () => {
  // 100 × 1.02 / (0.08 − 0.02) = 1700
  close(gordonTerminalValue(100, 0.08, 0.02), 1700);
  // 100 / 1.1² = 82.6446281
  close(presentValue(100, 0.1, 2), 82.6446281, 1e-6);
  assert.throws(() => gordonTerminalValue(100, 0.02, 0.03), DcfInputError);
});

const twoYear: DcfAssumptions = {
  baseRevenue: 1000, years: 2, growthStart: 0.1, growthFinal: 0.1, marginStart: 0.2, marginTarget: 0.2,
  taxRate: 0.25, daPctRevenue: 0.05, capexPctRevenue: 0.05, nwcPctIncrementalRevenue: 0.1,
  wacc: 0.1, terminalGrowth: 0.02, netDebt: 100, dilutedShares: 100,
};

test("two-year DCF matches hand calculation", () => {
  // Y1: rev 1100, EBIT 220, NOPAT 165, D&A 55, CapEx 55, ΔNWC 10 → FCFF 155
  // Y2: rev 1210, EBIT 242, NOPAT 181.5, D&A 60.5, CapEx 60.5, ΔNWC 11 → FCFF 170.5
  // TV = 170.5 × 1.02 / 0.08 = 2173.875; PV(TV) = 2173.875 / 1.21 = 1796.5909091
  // PV FCFF = 155/1.1 + 170.5/1.21 = 140.9090909 + 140.9090909
  // EV = 2078.4090909; equity = 1978.4090909; per share = 19.784090909
  const r = runDcf(twoYear);
  close(r.rows[0].fcff, 155);
  close(r.rows[1].fcff, 170.5);
  close(r.terminalValue, 2173.875);
  close(r.pvTerminalValue, 1796.5909091, 1e-6);
  close(r.enterpriseValue, 2078.4090909, 1e-6);
  close(r.equityValue, 1978.4090909, 1e-6);
  close(r.perShare, 19.784090909, 1e-8);
});

test("growth and margin fade linearly across the explicit period", () => {
  const r = runDcf({ ...twoYear, years: 3, growthStart: 0.2, growthFinal: 0.1, marginStart: 0.1, marginTarget: 0.3 });
  close(r.rows[1].growth, 0.15);
  close(r.rows[1].margin, 0.2);
});

test("DCF rejects invalid inputs", () => {
  assert.throws(() => runDcf({ ...twoYear, wacc: 0.02 }), DcfInputError);
  assert.throws(() => runDcf({ ...twoYear, dilutedShares: 0 }), DcfInputError);
});

test("sensitivity matrix centre equals base case and invalid cells are null", () => {
  const grid = sensitivityMatrix(twoYear, [0.09, 0.1, 0.02], [0.01, 0.02, 0.03]);
  close(grid[1][1], runDcf(twoYear).perShare);
  assert.equal(grid[2][1], null); // WACC 2% ≤ g 2%
  assert.ok((grid[0][1] as number) > (grid[1][1] as number), "lower WACC → higher value");
});

test("probability-weighted scenarios", () => {
  const s = (p: number, w: number) => ({ id: "base" as const, label: "", probability: p, assumptions: { ...twoYear, wacc: w } });
  const res = probabilityWeighted([s(0.5, 0.1), s(0.5, 0.1)]);
  close(res.weighted, runDcf(twoYear).perShare);
  assert.throws(() => probabilityWeighted([s(0.5, 0.1)]), DcfInputError);
});

test("health score bands", () => {
  const [profit, , , leverage, coverage] = HEALTH_RULES;
  assert.equal(scoreBand(0.3, profit), 20);
  assert.equal(scoreBand(0.15, profit), 15); // inclusive threshold
  assert.equal(scoreBand(-0.01, profit), 0);
  assert.equal(scoreBand(-0.5, leverage), 20); // net cash
  assert.equal(scoreBand(4, leverage), 0);
  assert.equal(scoreBand(null, coverage), 20); // no interest expense
  const h = healthScore({ operatingMargin: 0.16, revenueCagr3y: 0.06, roic: 0.13, netDebtToEbitda: 1.5, interestCoverage: 5 });
  assert.equal(h.total, 15 + 10 + 15 + 12 + 14);
  assert.equal(h.grade, "Sound");
  assert.equal(valuationSignal(130, 100).label, "Screens attractive");
});

test("illustrative dataset is internally consistent", () => {
  for (const c of COMPANY_DATA) {
    c.statements.forEach((s, i) => {
      close(s.totalAssets, s.totalLiabilities + s.equity, 1e-6);
      close(s.grossProfit, s.revenue - s.costOfRevenue, 1e-6);
      if (i > 0) {
        const p = c.statements[i - 1];
        // Cash flow statement reconciles to the balance sheet with no plug
        close(s.cash - p.cash, s.operatingCashFlow - s.capex - s.dividends - s.buybacks + s.netDebtIssued, 1e-6);
      }
    });
  }
});
