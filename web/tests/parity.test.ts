/**
 * Parity with the independent oracle (shared/fixtures/oracle.py) that the
 * Python engine is also tested against. Floats are compared with a relative
 * tolerance; the Python engine checks the same values to 1e-18 in Decimal.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as m from "../src/lib/finance/metrics.ts";
import { costOfEquity, gordonTerminalValue, presentValue, runDcf, wacc, type DcfAssumptions } from "../src/lib/finance/dcf.ts";

const cases = JSON.parse(readFileSync(new URL("../../shared/fixtures/quant-cases.json", import.meta.url), "utf8"));
const n = (s: string) => Number(s);

function near(actual: number | null, expected: string, rel = 1e-12) {
  assert.ok(actual !== null, "expected a number");
  const e = n(expected);
  assert.ok(Math.abs(actual - e) <= rel * Math.max(1, Math.abs(e)), `${actual} ≠ ${expected}`);
}

function assumptions(i: Record<string, string | number>): DcfAssumptions {
  return {
    baseRevenue: n(i.base_revenue as string), years: i.years as number, growthStart: n(i.g0 as string), growthFinal: n(i.g1 as string),
    marginStart: n(i.m0 as string), marginTarget: n(i.m1 as string), taxRate: n(i.tax as string), daPctRevenue: n(i.da as string),
    capexPctRevenue: n(i.capex as string), nwcPctIncrementalRevenue: n(i.nwc as string), wacc: n(i.wacc as string),
    terminalGrowth: n(i.tg as string), netDebt: n(i.net_debt as string), dilutedShares: n(i.shares as string),
  };
}

test("CAPM, WACC, terminal value and discounting match the oracle", () => {
  near(costOfEquity(0.04, 1.2, 0.05), cases.capm.out);
  const w = cases.wacc.in;
  near(wacc({ equityValue: n(w.equity), debtValue: n(w.debt), costOfEquity: n(w.ke), preTaxCostOfDebt: n(w.kd), taxRate: n(w.tax) }), cases.wacc.out);
  near(gordonTerminalValue(100, 0.08, 0.02), cases.gordon.out);
  near(presentValue(100, 0.1, 2), cases.present_value.out);
});

for (const name of ["dcf_two_year", "dcf_three_year_fade"]) {
  test(`${name} matches the oracle`, () => {
    const r = runDcf(assumptions(cases[name].in));
    const out = cases[name].out;
    r.rows.forEach((row, i) => near(row.fcff, out.fcff[i]));
    near(r.terminalValue, out.terminal_value);
    near(r.pvTerminalValue, out.pv_terminal_value);
    near(r.enterpriseValue, out.enterprise_value);
    near(r.equityValue, out.equity_value);
    near(r.perShare, out.per_share);
  });
}

test("ratios match the oracle", () => {
  const c = cases.ratios;
  near(m.roe(...(c.roe.in.map(n) as [number, number, number])), c.roe.out);
  near(m.roic(...(c.roic.in.map(n) as [number, number, number, number])), c.roic.out);
  near(m.currentRatio(...(c.current_ratio.in.map(n) as [number, number])), c.current_ratio.out);
  const [cash, sti, rec, cl] = c.quick_ratio.in.map(n);
  near(m.quickRatio(cash + sti, rec, cl), c.quick_ratio.out);
  near(m.debtToEquity(...(c.debt_to_equity.in.map(n) as [number, number])), c.debt_to_equity.out);
  near(m.debtToEbitda(...(c.debt_to_ebitda.in.map(n) as [number, number])), c.debt_to_ebitda.out);
  near(m.interestCoverage(...(c.interest_coverage.in.map(n) as [number, number])), c.interest_coverage.out);
  near(m.cagr(n(c.cagr.in[0]), n(c.cagr.in[1]), c.cagr.in[2]), c.cagr.out);
  near(m.enterpriseValue(...(c.enterprise_value.in.map(n) as [number, number, number])), c.enterprise_value.out);
  near(m.median(cases.comps.peer_ev_to_ebitda.map(n)), cases.comps.median);
});
