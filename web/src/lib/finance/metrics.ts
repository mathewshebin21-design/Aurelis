/**
 * Deterministic financial ratio calculations.
 *
 * Every function is pure and returns `null` when the ratio is undefined
 * (zero / negative denominators, missing inputs) instead of returning a
 * misleading number. The UI renders `null` as "n/m" (not meaningful).
 *
 * Phase 3 ports these to the Python quant engine, which becomes the system
 * of record; this TypeScript copy powers the client-side preview only.
 */

export type Ratio = number | null;

const finite = (x: number) => Number.isFinite(x);

/** Simple period-over-period growth: curr / prev − 1. Undefined if prev ≤ 0. */
export function growth(curr: number, prev: number): Ratio {
  if (!finite(curr) || !finite(prev) || prev <= 0) return null;
  return curr / prev - 1;
}

/** Compound annual growth rate over `years` periods. */
export function cagr(start: number, end: number, years: number): Ratio {
  if (start <= 0 || end <= 0 || years <= 0) return null;
  return Math.pow(end / start, 1 / years) - 1;
}

/** Any line item as a share of revenue (gross, operating, net, FCF margin…). */
export function margin(value: number, revenue: number): Ratio {
  if (!finite(value) || !finite(revenue) || revenue <= 0) return null;
  return value / revenue;
}

export const ebitda = (ebit: number, depreciationAndAmortization: number) =>
  ebit + depreciationAndAmortization;

export const freeCashFlow = (operatingCashFlow: number, capex: number) =>
  operatingCashFlow - Math.abs(capex);

/** Return on equity using average shareholders' equity. */
export function roe(netIncome: number, equityBegin: number, equityEnd: number): Ratio {
  const avg = (equityBegin + equityEnd) / 2;
  if (avg <= 0) return null;
  return netIncome / avg;
}

/**
 * Return on invested capital = NOPAT / average invested capital,
 * where invested capital = total debt + equity − cash.
 */
export function roic(
  ebit: number,
  taxRate: number,
  investedCapitalBegin: number,
  investedCapitalEnd: number,
): Ratio {
  const avg = (investedCapitalBegin + investedCapitalEnd) / 2;
  if (avg <= 0) return null;
  return (ebit * (1 - taxRate)) / avg;
}

export const investedCapital = (totalDebt: number, equity: number, cash: number) =>
  totalDebt + equity - cash;

export function currentRatio(currentAssets: number, currentLiabilities: number): Ratio {
  if (currentLiabilities <= 0) return null;
  return currentAssets / currentLiabilities;
}

/** Quick ratio = (cash + receivables) / current liabilities (excludes inventory). */
export function quickRatio(cash: number, receivables: number, currentLiabilities: number): Ratio {
  if (currentLiabilities <= 0) return null;
  return (cash + receivables) / currentLiabilities;
}

export function debtToEquity(totalDebt: number, equity: number): Ratio {
  if (equity <= 0) return null;
  return totalDebt / equity;
}

export function debtToEbitda(totalDebt: number, ebitdaValue: number): Ratio {
  if (ebitdaValue <= 0) return null;
  return totalDebt / ebitdaValue;
}

export function netDebtToEbitda(totalDebt: number, cash: number, ebitdaValue: number): Ratio {
  if (ebitdaValue <= 0) return null;
  return (totalDebt - cash) / ebitdaValue;
}

/** EBIT / interest expense. Undefined (not infinite) when there is no interest. */
export function interestCoverage(ebit: number, interestExpense: number): Ratio {
  if (interestExpense <= 0) return null;
  return ebit / interestExpense;
}

/** Enterprise value = market cap + total debt − cash. */
export const enterpriseValue = (marketCap: number, totalDebt: number, cash: number) =>
  marketCap + totalDebt - cash;

export function multiple(numerator: number, denominator: number): Ratio {
  if (denominator <= 0 || !finite(numerator)) return null;
  return numerator / denominator;
}

export function median(values: Ratio[]): Ratio {
  const xs = values.filter((v): v is number => v !== null && finite(v)).sort((a, b) => a - b);
  if (xs.length === 0) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}
