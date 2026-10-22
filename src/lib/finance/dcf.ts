/**
 * Unlevered free-cash-flow (FCFF) discounted cash flow model.
 *
 * Conventions (documented in docs/ARCHITECTURE.md §Quant engine):
 *  - End-of-year discounting by default; optional mid-year convention.
 *  - FCFF = EBIT·(1 − t) + D&A − CapEx − ΔNWC
 *  - ΔNWC = NWC% × (Revenue_t − Revenue_{t−1})
 *  - Terminal value via Gordon growth on the final-year FCFF.
 *  - Equity value = EV − net debt; per-share value uses diluted shares.
 *
 * All monetary inputs share one unit (the dataset uses USD millions).
 */

export interface DcfAssumptions {
  baseRevenue: number;
  years: number;
  /** Growth in year 1; fades linearly to `growthFinal` in the last explicit year. */
  growthStart: number;
  growthFinal: number;
  /** EBIT margin in year 1; moves linearly to `marginTarget` by the last year. */
  marginStart: number;
  marginTarget: number;
  taxRate: number;
  daPctRevenue: number;
  capexPctRevenue: number;
  nwcPctIncrementalRevenue: number;
  wacc: number;
  terminalGrowth: number;
  netDebt: number;
  dilutedShares: number;
  midYear?: boolean;
}

export interface DcfYear {
  year: number;
  revenue: number;
  growth: number;
  ebit: number;
  margin: number;
  nopat: number;
  da: number;
  capex: number;
  deltaNwc: number;
  fcff: number;
  discountFactor: number;
  pv: number;
}

export interface DcfResult {
  rows: DcfYear[];
  sumPvFcff: number;
  terminalValue: number;
  pvTerminalValue: number;
  enterpriseValue: number;
  equityValue: number;
  perShare: number;
  /** Share of EV coming from the terminal value — a model-risk indicator. */
  terminalShare: number;
}

export class DcfInputError extends Error {}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Cost of equity via CAPM: rf + β × ERP. */
export const costOfEquity = (riskFree: number, beta: number, equityRiskPremium: number) =>
  riskFree + beta * equityRiskPremium;

/** Weighted average cost of capital using market-value weights. */
export function wacc(params: {
  equityValue: number;
  debtValue: number;
  costOfEquity: number;
  preTaxCostOfDebt: number;
  taxRate: number;
}): number {
  const { equityValue: e, debtValue: d } = params;
  if (e < 0 || d < 0 || e + d <= 0) throw new DcfInputError("Capital weights must be non-negative and non-zero");
  const v = e + d;
  return (e / v) * params.costOfEquity + (d / v) * params.preTaxCostOfDebt * (1 - params.taxRate);
}

/** Gordon growth terminal value at the end of the final explicit year. */
export function gordonTerminalValue(finalFcff: number, discountRate: number, g: number): number {
  if (discountRate <= g) throw new DcfInputError("Discount rate must exceed terminal growth");
  return (finalFcff * (1 + g)) / (discountRate - g);
}

export function presentValue(value: number, rate: number, periods: number): number {
  return value / Math.pow(1 + rate, periods);
}

export function runDcf(a: DcfAssumptions): DcfResult {
  if (a.years < 1) throw new DcfInputError("At least one explicit forecast year is required");
  if (a.dilutedShares <= 0) throw new DcfInputError("Diluted shares must be positive");
  if (a.wacc <= a.terminalGrowth) throw new DcfInputError("WACC must exceed terminal growth");

  const rows: DcfYear[] = [];
  let prevRevenue = a.baseRevenue;
  for (let i = 1; i <= a.years; i++) {
    const t = a.years === 1 ? 1 : (i - 1) / (a.years - 1);
    const g = lerp(a.growthStart, a.growthFinal, t);
    const m = lerp(a.marginStart, a.marginTarget, t);
    const revenue = prevRevenue * (1 + g);
    const ebit = revenue * m;
    const nopat = ebit * (1 - a.taxRate);
    const da = revenue * a.daPctRevenue;
    const capex = revenue * a.capexPctRevenue;
    const deltaNwc = (revenue - prevRevenue) * a.nwcPctIncrementalRevenue;
    const fcff = nopat + da - capex - deltaNwc;
    const period = a.midYear ? i - 0.5 : i;
    const discountFactor = 1 / Math.pow(1 + a.wacc, period);
    rows.push({ year: i, revenue, growth: g, ebit, margin: m, nopat, da, capex, deltaNwc, fcff, discountFactor, pv: fcff * discountFactor });
    prevRevenue = revenue;
  }

  const sumPvFcff = rows.reduce((s, r) => s + r.pv, 0);
  const terminalValue = gordonTerminalValue(rows[rows.length - 1].fcff, a.wacc, a.terminalGrowth);
  // Terminal value is discounted from the end of the final year even under mid-year convention.
  const pvTerminalValue = presentValue(terminalValue, a.wacc, a.years);
  const enterpriseValue = sumPvFcff + pvTerminalValue;
  const equityValue = enterpriseValue - a.netDebt;
  return {
    rows,
    sumPvFcff,
    terminalValue,
    pvTerminalValue,
    enterpriseValue,
    equityValue,
    perShare: equityValue / a.dilutedShares,
    terminalShare: enterpriseValue > 0 ? pvTerminalValue / enterpriseValue : NaN,
  };
}

/**
 * Two-way sensitivity of intrinsic value per share to WACC (rows) and
 * terminal growth (columns). Invalid cells (WACC ≤ g) are returned as null.
 */
export function sensitivityMatrix(
  base: DcfAssumptions,
  waccs: number[],
  growths: number[],
): (number | null)[][] {
  return waccs.map((w) =>
    growths.map((g) => (w <= g ? null : runDcf({ ...base, wacc: w, terminalGrowth: g }).perShare)),
  );
}

/** Symmetric grid around a centre value, e.g. steps(0.09, 0.005, 2) → [0.08 … 0.10]. */
export function steps(centre: number, step: number, each: number): number[] {
  return Array.from({ length: each * 2 + 1 }, (_, i) => +(centre + (i - each) * step).toFixed(6));
}

export interface Scenario {
  id: "bear" | "base" | "bull";
  label: string;
  probability: number;
  assumptions: DcfAssumptions;
}

/** Probability-weighted value. Probabilities must sum to 1 (±1e-6). */
export function probabilityWeighted(scenarios: Scenario[]) {
  const total = scenarios.reduce((s, x) => s + x.probability, 0);
  if (Math.abs(total - 1) > 1e-6) throw new DcfInputError("Scenario probabilities must sum to 100%");
  const results = scenarios.map((s) => ({ ...s, result: runDcf(s.assumptions) }));
  const weighted = results.reduce((s, x) => s + x.probability * x.result.perShare, 0);
  return { results, weighted };
}
