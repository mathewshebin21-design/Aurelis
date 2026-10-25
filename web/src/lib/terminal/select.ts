/**
 * Pure lookups over API responses: pick a value, never compute one. Anything that needs
 * arithmetic belongs to the Python engine.
 */
import type { Schemas } from "../api/client.ts";

export type Metric = Schemas["MetricOut"];
export type Line = Schemas["LineOut"];

export function metricFor(metrics: Metric[], key: string, period: string): Metric | undefined {
  return metrics.find((m) => m.key === key && m.period === period);
}

export function lineFor(lines: Line[], key: string, period: string): Line | undefined {
  return lines.find((l) => l.line_key === key && periodLabel(l) === period);
}

export function periodLabel(l: Pick<Line, "fiscal_period" | "fiscal_year">): string {
  return l.fiscal_period === "FY" ? `FY${l.fiscal_year}` : `${l.fiscal_period} ${l.fiscal_year}`; // matches the API's period labels ("FY2025", "Q3 2026")
}

/**
 * A chart series over `periods`, or the periods where the value is missing.
 * Missing values are never drawn as zero: a series with gaps is not plotted, and the
 * gaps are reported to the reader instead.
 */
export function seriesOrGaps(periods: string[], valueAt: (p: string) => string | null | undefined):
  | { ok: true; values: number[] }
  | { ok: false; missing: string[] } {
  const raw = periods.map((p) => valueAt(p));
  const missing = periods.filter((_, i) => raw[i] === null || raw[i] === undefined || !Number.isFinite(Number(raw[i])));
  return missing.length ? { ok: false, missing } : { ok: true, values: raw.map(Number) };
}

/** Distinct data-quality caveats attached by the engine to metrics for one period. */
export function caveats(metrics: Metric[], period: string): string[] {
  return [...new Set(metrics.filter((m) => m.period === period).flatMap((m) => m.assumptions))];
}

/** Metrics the engine could not compute for a period, with its reasons. */
export function unavailable(metrics: Metric[], period: string): { label: string; reason: string }[] {
  return metrics
    .filter((m) => m.period === period && (m.value === null || m.value === undefined))
    .map((m) => ({ label: m.label, reason: m.reason ?? "Not computable from the filed statements" }));
}
