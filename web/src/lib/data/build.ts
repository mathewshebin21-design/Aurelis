/**
 * Derives internally consistent (but ILLUSTRATIVE) financial statements and
 * analytics from the compact specs in companies.ts.
 */

import { COMPANIES, type CompanySpec } from "./companies.ts";
import * as m from "../finance/metrics.ts";
import { costOfEquity, wacc, type DcfAssumptions, type Scenario } from "../finance/dcf.ts";
import { healthScore } from "../finance/score.ts";

export const AS_OF = "2026-10-16";
export const FISCAL_YEARS = [2021, 2022, 2023, 2024, 2025] as const;
export const MARKET = { riskFree: 0.0425, equityRiskPremium: 0.05, terminalGrowth: 0.025 };

export interface Statement {
  fy: number;
  // Income statement
  revenue: number;
  costOfRevenue: number;
  grossProfit: number;
  rnd: number;
  sga: number;
  ebit: number;
  da: number;
  ebitda: number;
  interestExpense: number;
  pretaxIncome: number;
  incomeTax: number;
  netIncome: number;
  dilutedShares: number;
  eps: number;
  // Balance sheet
  cash: number;
  receivables: number;
  inventory: number;
  otherCurrentAssets: number;
  currentAssets: number;
  ppe: number;
  intangibles: number;
  totalAssets: number;
  payables: number;
  accruedLiabilities: number;
  currentLiabilities: number;
  totalDebt: number;
  otherLiabilities: number;
  totalLiabilities: number;
  equity: number;
  // Cash flow
  operatingCashFlow: number;
  capex: number;
  freeCashFlow: number;
  dividends: number;
  buybacks: number;
  netDebtIssued: number;
  netChangeInCash: number;
}

function buildStatements(s: CompanySpec): Statement[] {
  const out: Statement[] = [];
  let revenue = s.revenue2021;
  let prev: Statement | null = null;
  const intangibles = s.revenue2021 * s.intangiblesPct;

  FISCAL_YEARS.forEach((fy, i) => {
    if (i > 0) revenue *= 1 + s.growth[i - 1];
    const gm = s.grossMargin[i];
    const costOfRevenue = revenue * (1 - gm);
    const grossProfit = revenue - costOfRevenue;
    const rnd = revenue * s.rndPct;
    const sga = revenue * s.sgaPct;
    const ebit = grossProfit - rnd - sga;
    const da = revenue * s.daPct;
    const totalDebt = s.debt2021 * Math.pow(1 + s.debtGrowth, i);
    const interestExpense = (prev ? (prev.totalDebt + totalDebt) / 2 : totalDebt) * s.interestRate;
    const pretaxIncome = ebit - interestExpense;
    const incomeTax = Math.max(0, pretaxIncome * s.taxRate);
    const netIncome = pretaxIncome - incomeTax;
    const dilutedShares = s.dilutedShares2025 * Math.pow(1 + s.shareDrift, 4 - i);

    const receivables = (revenue * s.dso) / 365;
    const inventory = (costOfRevenue * s.dio) / 365;
    const otherCurrentAssets = revenue * 0.03;
    const payables = (costOfRevenue * s.dpo) / 365;
    const accruedLiabilities = revenue * 0.06;
    const otherLiabilities = revenue * 0.05;
    const capex = revenue * s.capexPct;
    const ppe = prev ? prev.ppe + capex - da : s.revenue2021 * s.ppeIntensity;

    let cash: number, equity: number, operatingCashFlow: number, dividends: number, buybacks: number;
    if (!prev) {
      cash = s.cash2021;
      operatingCashFlow = netIncome + da;
      dividends = Math.max(0, netIncome * s.payout);
      buybacks = Math.max(0, (operatingCashFlow - capex - dividends) * s.buybackPct);
      const assets = cash + receivables + inventory + otherCurrentAssets + ppe + intangibles;
      equity = assets - (payables + accruedLiabilities + otherLiabilities + totalDebt);
    } else {
      const nwcAssets = receivables + inventory + otherCurrentAssets;
      const nwcLiabs = payables + accruedLiabilities;
      const prevNwc = prev.receivables + prev.inventory + prev.otherCurrentAssets - prev.payables - prev.accruedLiabilities;
      const deltaNwc = nwcAssets - nwcLiabs - prevNwc;
      operatingCashFlow = netIncome + da - deltaNwc + (otherLiabilities - prev.otherLiabilities);
      dividends = Math.max(0, netIncome * s.payout);
      buybacks = Math.max(0, (operatingCashFlow - capex - dividends) * s.buybackPct);
      equity = prev.equity + netIncome - dividends - buybacks;
      cash = prev.cash + operatingCashFlow - capex - dividends - buybacks + (totalDebt - prev.totalDebt);
    }

    const currentAssets = cash + receivables + inventory + otherCurrentAssets;
    const currentLiabilities = payables + accruedLiabilities;
    const totalLiabilities = currentLiabilities + totalDebt + otherLiabilities;
    const row: Statement = {
      fy, revenue, costOfRevenue, grossProfit, rnd, sga, ebit, da, ebitda: m.ebitda(ebit, da),
      interestExpense, pretaxIncome, incomeTax, netIncome, dilutedShares, eps: netIncome / dilutedShares,
      cash, receivables, inventory, otherCurrentAssets, currentAssets, ppe, intangibles,
      totalAssets: currentAssets + ppe + intangibles,
      payables, accruedLiabilities, currentLiabilities, totalDebt, otherLiabilities, totalLiabilities, equity,
      operatingCashFlow, capex, freeCashFlow: m.freeCashFlow(operatingCashFlow, capex), dividends, buybacks,
      netDebtIssued: prev ? totalDebt - prev.totalDebt : 0,
      netChangeInCash: prev ? cash - prev.cash : 0,
    };
    out.push(row);
    prev = row;
  });
  return out;
}

export interface MetricRow {
  fy: number;
  revenueGrowth: m.Ratio;
  grossMargin: m.Ratio;
  operatingMargin: m.Ratio;
  ebitdaMargin: m.Ratio;
  netMargin: m.Ratio;
  fcfMargin: m.Ratio;
  roe: m.Ratio;
  roic: m.Ratio;
  currentRatio: m.Ratio;
  quickRatio: m.Ratio;
  debtToEquity: m.Ratio;
  debtToEbitda: m.Ratio;
  netDebtToEbitda: m.Ratio;
  interestCoverage: m.Ratio;
}

function buildMetrics(st: Statement[], taxRate: number): MetricRow[] {
  return st.map((r, i) => {
    const p = st[i - 1];
    const icEnd = m.investedCapital(r.totalDebt, r.equity, r.cash);
    const icBegin = p ? m.investedCapital(p.totalDebt, p.equity, p.cash) : icEnd;
    return {
      fy: r.fy,
      revenueGrowth: p ? m.growth(r.revenue, p.revenue) : null,
      grossMargin: m.margin(r.grossProfit, r.revenue),
      operatingMargin: m.margin(r.ebit, r.revenue),
      ebitdaMargin: m.margin(r.ebitda, r.revenue),
      netMargin: m.margin(r.netIncome, r.revenue),
      fcfMargin: m.margin(r.freeCashFlow, r.revenue),
      roe: m.roe(r.netIncome, p ? p.equity : r.equity, r.equity),
      roic: m.roic(r.ebit, taxRate, icBegin, icEnd),
      currentRatio: m.currentRatio(r.currentAssets, r.currentLiabilities),
      quickRatio: m.quickRatio(r.cash, r.receivables, r.currentLiabilities),
      debtToEquity: m.debtToEquity(r.totalDebt, r.equity),
      debtToEbitda: m.debtToEbitda(r.totalDebt, r.ebitda),
      netDebtToEbitda: m.netDebtToEbitda(r.totalDebt, r.cash, r.ebitda),
      interestCoverage: m.interestCoverage(r.ebit, r.interestExpense),
    };
  });
}

/** Deterministic PRNG so the illustrative price series is stable between renders. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (str: string) => [...str].reduce((h, c) => (Math.imul(31, h) + c.charCodeAt(0)) | 0, 7);

function buildPrices(s: CompanySpec, n = 252): { t: number; close: number }[] {
  const rnd = mulberry32(hash(s.ticker));
  const vol = 0.009 + s.beta * 0.007;
  const closes = [s.price];
  for (let i = 1; i < n; i++) {
    const z = (rnd() + rnd() + rnd() - 1.5) * 2; // ≈ N(0,1)
    closes.push(closes[i - 1] / Math.exp(0.0004 + vol * z));
  }
  return closes.reverse().map((close, t) => ({ t, close }));
}

export function dcfDefaults(s: CompanySpec, last: Statement, marketCap: number): { assumptions: DcfAssumptions; ke: number } {
  const ke = costOfEquity(MARKET.riskFree, s.beta, MARKET.equityRiskPremium);
  const w = wacc({ equityValue: marketCap, debtValue: last.totalDebt, costOfEquity: ke, preTaxCostOfDebt: s.interestRate, taxRate: s.taxRate });
  return {
    ke,
    assumptions: {
      baseRevenue: last.revenue,
      years: 5,
      growthStart: s.dcf.growthStart,
      growthFinal: s.dcf.growthFinal,
      marginStart: last.ebit / last.revenue,
      marginTarget: s.dcf.marginTarget,
      taxRate: s.taxRate,
      daPctRevenue: s.daPct,
      capexPctRevenue: s.dcf.capexPct ?? s.capexPct,
      nwcPctIncrementalRevenue: 0.1,
      wacc: +w.toFixed(4),
      terminalGrowth: MARKET.terminalGrowth,
      netDebt: last.totalDebt - last.cash,
      dilutedShares: last.dilutedShares,
    },
  };
}

export function scenariosFor(base: DcfAssumptions): Scenario[] {
  return [
    {
      id: "bear", label: "Bear", probability: 0.25,
      assumptions: { ...base, growthStart: base.growthStart * 0.5, growthFinal: base.growthFinal * 0.6, marginTarget: base.marginTarget - 0.04, wacc: base.wacc + 0.01, terminalGrowth: base.terminalGrowth - 0.005 },
    },
    { id: "base", label: "Base", probability: 0.5, assumptions: base },
    {
      id: "bull", label: "Bull", probability: 0.25,
      assumptions: { ...base, growthStart: base.growthStart * 1.3, growthFinal: base.growthFinal * 1.2, marginTarget: base.marginTarget + 0.03, wacc: base.wacc - 0.005 },
    },
  ];
}

function buildCompany(s: CompanySpec) {
  const statements = buildStatements(s);
  const metrics = buildMetrics(statements, s.taxRate);
  const last = statements[statements.length - 1];
  const lastM = metrics[metrics.length - 1];
  const marketCap = s.price * last.dilutedShares;
  const ev = m.enterpriseValue(marketCap, last.totalDebt, last.cash);
  const prices = buildPrices(s);
  const { assumptions, ke } = dcfDefaults(s, last, marketCap);
  const revenueCagr3y = m.cagr(statements[1].revenue, last.revenue, 3);
  const health = healthScore({
    operatingMargin: lastM.operatingMargin,
    revenueCagr3y,
    roic: lastM.roic,
    netDebtToEbitda: lastM.netDebtToEbitda,
    interestCoverage: lastM.interestCoverage,
  });
  const yearAgo = prices[0].close;
  return {
    ...s,
    statements,
    metrics,
    prices,
    marketCap,
    enterpriseValue: ev,
    costOfEquity: ke,
    dcf: assumptions,
    revenueCagr3y,
    health,
    change1d: prices[prices.length - 1].close / prices[prices.length - 2].close - 1,
    change1y: s.price / yearAgo - 1,
    multiples: {
      evToSales: m.multiple(ev, last.revenue),
      evToEbitda: m.multiple(ev, last.ebitda),
      pe: m.multiple(marketCap, last.netIncome),
      fcfYield: m.margin(last.freeCashFlow, marketCap),
      dividendYield: m.margin(last.dividends, marketCap),
    },
  };
}

export type Company = ReturnType<typeof buildCompany>;

export const COMPANY_DATA: Company[] = COMPANIES.map(buildCompany);

export function getCompany(ticker: string): Company | undefined {
  return COMPANY_DATA.find((c) => c.ticker === ticker.toUpperCase());
}

export function peersOf(c: Company): Company[] {
  return COMPANY_DATA.filter((x) => x.ticker !== c.ticker);
}

export function peerMedians(list: Company[]) {
  return {
    evToSales: m.median(list.map((x) => x.multiples.evToSales)),
    evToEbitda: m.median(list.map((x) => x.multiples.evToEbitda)),
    pe: m.median(list.map((x) => x.multiples.pe)),
    fcfYield: m.median(list.map((x) => x.multiples.fcfYield)),
  };
}

/** XBRL concept each derived line maps to once Phase 2 ingests EDGAR data. */
export const XBRL_TAGS: Partial<Record<keyof Statement, string>> = {
  revenue: "us-gaap:Revenues",
  costOfRevenue: "us-gaap:CostOfRevenue",
  grossProfit: "us-gaap:GrossProfit",
  rnd: "us-gaap:ResearchAndDevelopmentExpense",
  sga: "us-gaap:SellingGeneralAndAdministrativeExpense",
  ebit: "us-gaap:OperatingIncomeLoss",
  da: "us-gaap:DepreciationDepletionAndAmortization",
  interestExpense: "us-gaap:InterestExpense",
  pretaxIncome: "us-gaap:IncomeLossFromContinuingOperationsBeforeIncomeTaxes…",
  incomeTax: "us-gaap:IncomeTaxExpenseBenefit",
  netIncome: "us-gaap:NetIncomeLoss",
  eps: "us-gaap:EarningsPerShareDiluted",
  dilutedShares: "us-gaap:WeightedAverageNumberOfDilutedSharesOutstanding",
  cash: "us-gaap:CashAndCashEquivalentsAtCarryingValue",
  receivables: "us-gaap:AccountsReceivableNetCurrent",
  inventory: "us-gaap:InventoryNet",
  currentAssets: "us-gaap:AssetsCurrent",
  ppe: "us-gaap:PropertyPlantAndEquipmentNet",
  totalAssets: "us-gaap:Assets",
  payables: "us-gaap:AccountsPayableCurrent",
  currentLiabilities: "us-gaap:LiabilitiesCurrent",
  totalDebt: "us-gaap:LongTermDebt + DebtCurrent",
  totalLiabilities: "us-gaap:Liabilities",
  equity: "us-gaap:StockholdersEquity",
  operatingCashFlow: "us-gaap:NetCashProvidedByUsedInOperatingActivities",
  capex: "us-gaap:PaymentsToAcquirePropertyPlantAndEquipment",
  dividends: "us-gaap:PaymentsOfDividends",
  buybacks: "us-gaap:PaymentsForRepurchaseOfCommonStock",
};
