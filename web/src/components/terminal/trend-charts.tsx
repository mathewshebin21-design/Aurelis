"use client";

import { BarChart, LegendRow, LineChart, type Series } from "@/components/charts/charts";
import { fmtCompact, fmtPct } from "@/lib/api/format";

/** Charts receive engine/statement values only. Gaps are never drawn as zero (see `seriesOrGaps`). */
export function ValueBars({ series, categories, currency }: { series: Series[]; categories: string[]; currency: string }) {
  return (
    <div>
      <LegendRow series={series} className="mb-2" />
      <BarChart series={series} categories={categories} height={200} formatY={(v) => `${currency === "USD" ? "$" : ""}${fmtCompact(v, 0)}`} />
    </div>
  );
}

export function RatioLines({ series, xLabels }: { series: Series[]; xLabels: string[] }) {
  return (
    <div>
      <LegendRow series={series} className="mb-2" />
      <LineChart series={series} xLabels={xLabels} height={200} formatY={(v) => fmtPct(v, 0)} />
    </div>
  );
}
