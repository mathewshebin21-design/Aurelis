/**
 * Financial health score — transparent, rule-based, 0–100.
 *
 * Five pillars, each scored from published threshold bands. No weights are
 * learned or tuned per company; the same table applies to every issuer, and
 * the UI renders this table verbatim as the methodology.
 *
 * The score describes historical financial condition. It is not a forecast,
 * a rating, or a recommendation.
 */

import type { Ratio } from "./metrics.ts";

export interface Band {
  /** Inclusive lower bound (or upper bound when `lowerIsBetter`). */
  threshold: number;
  points: number;
}

export interface PillarRule {
  id: string;
  label: string;
  metric: string;
  max: number;
  lowerIsBetter?: boolean;
  bands: Band[];
  /** Points awarded when the metric is undefined (e.g. no interest expense). */
  whenUndefined: number;
  rationale: string;
}

export const HEALTH_RULES: PillarRule[] = [
  {
    id: "profitability",
    label: "Profitability",
    metric: "Operating margin (latest FY)",
    max: 20,
    bands: [
      { threshold: 0.25, points: 20 },
      { threshold: 0.15, points: 15 },
      { threshold: 0.08, points: 10 },
      { threshold: 0, points: 5 },
    ],
    whenUndefined: 0,
    rationale: "Operating margin captures pricing power and cost discipline before financing choices.",
  },
  {
    id: "growth",
    label: "Growth",
    metric: "3-year revenue CAGR",
    max: 20,
    bands: [
      { threshold: 0.2, points: 20 },
      { threshold: 0.1, points: 15 },
      { threshold: 0.05, points: 10 },
      { threshold: 0, points: 5 },
    ],
    whenUndefined: 0,
    rationale: "Multi-year CAGR smooths single-year noise from acquisitions or cyclical peaks.",
  },
  {
    id: "returns",
    label: "Capital returns",
    metric: "ROIC (latest FY)",
    max: 20,
    bands: [
      { threshold: 0.2, points: 20 },
      { threshold: 0.12, points: 15 },
      { threshold: 0.08, points: 10 },
      { threshold: 0, points: 5 },
    ],
    whenUndefined: 0,
    rationale: "ROIC above the cost of capital indicates value creation from reinvestment.",
  },
  {
    id: "leverage",
    label: "Balance sheet",
    metric: "Net debt / EBITDA",
    max: 20,
    lowerIsBetter: true,
    bands: [
      { threshold: 0, points: 20 },
      { threshold: 1, points: 16 },
      { threshold: 2, points: 12 },
      { threshold: 3.5, points: 6 },
    ],
    whenUndefined: 0,
    rationale: "Leverage relative to cash earnings; negative EBITDA scores zero.",
  },
  {
    id: "coverage",
    label: "Interest coverage",
    metric: "EBIT / interest expense",
    max: 20,
    bands: [
      { threshold: 8, points: 20 },
      { threshold: 4, points: 14 },
      { threshold: 2, points: 7 },
    ],
    whenUndefined: 20,
    rationale: "Ability to service debt from operating profit; no interest expense earns full marks.",
  },
];

export function scoreBand(value: Ratio, rule: PillarRule): number {
  if (value === null || !Number.isFinite(value)) return rule.whenUndefined;
  for (const b of rule.bands) {
    if (rule.lowerIsBetter ? value <= b.threshold : value >= b.threshold) return b.points;
  }
  return 0;
}

export interface HealthInputs {
  operatingMargin: Ratio;
  revenueCagr3y: Ratio;
  roic: Ratio;
  netDebtToEbitda: Ratio;
  interestCoverage: Ratio;
}

const INPUT_FOR: Record<string, keyof HealthInputs> = {
  profitability: "operatingMargin",
  growth: "revenueCagr3y",
  returns: "roic",
  leverage: "netDebtToEbitda",
  coverage: "interestCoverage",
};

export function healthScore(inputs: HealthInputs) {
  const pillars = HEALTH_RULES.map((rule) => {
    const value = inputs[INPUT_FOR[rule.id]];
    return { ...rule, value, points: scoreBand(value, rule) };
  });
  const total = pillars.reduce((s, p) => s + p.points, 0);
  return { total, pillars, grade: gradeFor(total) };
}

export function gradeFor(total: number): "Strong" | "Sound" | "Mixed" | "Weak" {
  if (total >= 80) return "Strong";
  if (total >= 60) return "Sound";
  if (total >= 40) return "Mixed";
  return "Weak";
}

/**
 * Valuation attractiveness from the gap between modelled intrinsic value and
 * the reference price. A description of the model output, never a call to act.
 */
export function valuationSignal(intrinsic: number, price: number) {
  const gap = intrinsic / price - 1;
  const label =
    gap >= 0.3 ? "Screens attractive" : gap >= 0.1 ? "Price modestly below model" : gap > -0.1 ? "Price near model value" : "Price above model value";
  return { gap, label };
}
