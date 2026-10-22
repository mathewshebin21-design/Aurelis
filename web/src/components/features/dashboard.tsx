"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, CalendarClock } from "lucide-react";
import { motion } from "motion/react";
import { cn, fmtMoneyM, fmtPct, fmtPrice, fmtX } from "@/lib/utils";
import { routes, type DesignId } from "@/lib/designs";
import { AS_OF, COMPANY_DATA } from "@/lib/data/build";
import { runDcf } from "@/lib/finance/dcf";
import { median } from "@/lib/finance/metrics";
import { HEALTH_RULES, valuationSignal } from "@/lib/finance/score";
import { Scatter, Sparkline } from "@/components/charts/charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Delta, IllustrativeNotice } from "./common";

function useUniverse() {
  return React.useMemo(() => {
    const rows = COMPANY_DATA.map((c) => {
      const value = runDcf(c.dcf).perShare;
      return { c, value, gap: value / c.price - 1, signal: valuationSignal(value, c.price).label };
    });
    const catalysts = COMPANY_DATA.flatMap((c) => c.catalysts.map((k) => ({ ...k, ticker: c.ticker }))).sort((a, b) => a.date.localeCompare(b.date));
    return {
      rows,
      catalysts,
      kpis: {
        count: rows.length,
        medianHealth: median(rows.map((r) => r.c.health.total)),
        belowModel: rows.filter((r) => r.gap >= 0.1).length,
        medianEvEbitda: median(rows.map((r) => r.c.multiples.evToEbitda)),
        medianGap: median(rows.map((r) => r.gap)),
        totalCap: rows.reduce((s, r) => s + r.c.marketCap, 0),
      },
    };
  }, []);
}

type Universe = ReturnType<typeof useUniverse>;

function HealthHeatmap({ u, d }: { u: Universe; d: DesignId }) {
  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className="w-full border-separate border-spacing-[2px] text-[11.5px]">
        <thead>
          <tr>
            <th className="px-1.5 py-1 text-left font-medium text-muted">Issuer</th>
            {HEALTH_RULES.map((r) => (
              <th key={r.id} className="px-1.5 py-1 text-center font-medium text-muted">{r.label.split(" ")[0]}</th>
            ))}
            <th className="px-1.5 py-1 text-right font-medium text-muted">Total</th>
          </tr>
        </thead>
        <tbody>
          {[...u.rows].sort((a, b) => b.c.health.total - a.c.health.total).map(({ c }) => (
            <tr key={c.ticker}>
              <td className="px-1.5 py-1">
                <Link href={routes(d, c.ticker).company} className="num font-semibold text-fg hover:text-accent">{c.ticker}</Link>
              </td>
              {c.health.pillars.map((p) => (
                <td
                  key={p.id}
                  title={`${c.ticker} · ${p.label}: ${p.points}/${p.max}`}
                  className="num rounded-[2px] px-1.5 py-1 text-center text-fg"
                  // Sequential, single hue: more points → stronger --s1.
                  style={{ background: `color-mix(in oklab, var(--s1) ${Math.round((p.points / p.max) * 55)}%, var(--panel-2))` }}
                >
                  {p.points}
                </td>
              ))}
              <td className="num px-1.5 py-1 text-right font-semibold">{c.health.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UniverseScatter({ u, height }: { u: Universe; height?: number }) {
  return (
    <Scatter
      points={u.rows.map((r) => ({ id: r.c.ticker, label: r.c.ticker, x: r.c.health.total, y: r.gap }))}
      xLabel="Health score"
      yLabel="Model value vs price"
      formatX={(v) => v.toFixed(0)}
      formatY={(v) => fmtPct(v, 0, true)}
      height={height}
    />
  );
}

function CatalystList({ u, d, limit = 6 }: { u: Universe; d: DesignId; limit?: number }) {
  return (
    <ul className="divide-y divide-line/70">
      {u.catalysts.slice(0, limit).map((k) => (
        <li key={k.ticker + k.event} className="flex items-start gap-3 py-2 text-[12.5px]">
          <span className="num w-20 shrink-0 text-muted">{k.date}</span>
          <Link href={routes(d, k.ticker).company} className="num w-12 shrink-0 font-semibold text-fg hover:text-accent">{k.ticker}</Link>
          <span className="min-w-0 flex-1 text-fg-2">{k.event}</span>
          {k.kind !== "fact" && <Badge variant={k.kind}>{k.kind}</Badge>}
        </li>
      ))}
    </ul>
  );
}

function CoverageTable({ u, d, dense }: { u: Universe; d: DesignId; dense?: boolean }) {
  return (
    <Table>
      <THead>
        <TR className="hover:bg-transparent">
          <TH>Issuer</TH>
          <TH className="text-right">Price</TH>
          <TH className="text-right">1Y</TH>
          <TH className="hidden text-right sm:table-cell">Model value</TH>
          <TH className="text-right">Gap</TH>
          <TH className="hidden text-right md:table-cell">EV/EBITDA</TH>
          <TH className="text-right">Health</TH>
          {!dense && <TH className="hidden lg:table-cell">Model signal</TH>}
        </TR>
      </THead>
      <TBody>
        {u.rows.map((r) => (
          <TR key={r.c.ticker}>
            <TD>
              <Link href={routes(d, r.c.ticker).company} className="num font-semibold text-fg hover:text-accent">{r.c.ticker}</Link>
              <span className="ml-2 hidden text-muted xl:inline">{r.c.name}</span>
            </TD>
            <TD className="num text-right">{fmtPrice(r.c.price)}</TD>
            <TD className="text-right"><Delta value={r.c.change1y} digits={1} /></TD>
            <TD className="num hidden text-right sm:table-cell">{fmtPrice(r.value)}</TD>
            <TD className={cn("num text-right", r.gap >= 0 ? "text-pos" : "text-neg")}>{fmtPct(r.gap, 0, true)}</TD>
            <TD className="num hidden text-right md:table-cell">{fmtX(r.c.multiples.evToEbitda)}</TD>
            <TD className="num text-right">{r.c.health.total}</TD>
            {!dense && <TD className="hidden text-fg-2 lg:table-cell">{r.signal}</TD>}
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

function Kpis({ u, className, tile }: { u: Universe; className?: string; tile?: string }) {
  const items = [
    { label: "Coverage", value: `${u.kpis.count} issuers`, sub: `${fmtMoneyM(u.kpis.totalCap)} combined cap` },
    { label: "Median health", value: `${u.kpis.medianHealth}/100`, sub: "Rule-based score" },
    { label: "≥10% below model", value: `${u.kpis.belowModel} of ${u.kpis.count}`, sub: "Base-case DCF vs price" },
    { label: "Median EV/EBITDA", value: fmtX(u.kpis.medianEvEbitda), sub: "FY2025" },
    { label: "Median model gap", value: fmtPct(u.kpis.medianGap, 0, true), sub: "Value ÷ price − 1" },
  ];
  return (
    <div className={className}>
      {items.map((k, i) => (
        <motion.div key={k.label} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className={tile}>
          <div className="text-[10.5px] font-medium uppercase tracking-wider text-muted">{k.label}</div>
          <div className="num mt-1 text-xl font-semibold text-fg">{k.value}</div>
          <div className="text-[11px] text-muted">{k.sub}</div>
        </motion.div>
      ))}
    </div>
  );
}

export function Dashboard({ d }: { d: DesignId }) {
  const u = useUniverse();

  if (d === "a") {
    return (
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-12">
        <Kpis u={u} className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:col-span-12 lg:grid-cols-5" tile="rounded-[var(--radius)] border border-line bg-panel px-3 py-2" />
        <Card className="lg:col-span-7">
          <CardHeader><CardTitle>Coverage monitor</CardTitle><span className="num text-[11px] text-muted">MON &lt;GO&gt;</span></CardHeader>
          <CardContent className="p-1"><CoverageTable u={u} d={d} dense /></CardContent>
        </Card>
        <Card className="lg:col-span-5">
          <CardHeader><CardTitle>Quality vs. valuation</CardTitle><span className="text-[11px] text-muted">hover points</span></CardHeader>
          <CardContent className="p-3"><UniverseScatter u={u} height={280} /></CardContent>
        </Card>
        <Card className="lg:col-span-5">
          <CardHeader><CardTitle>Health pillars</CardTitle><span className="text-[11px] text-muted">points / 20</span></CardHeader>
          <CardContent className="p-2"><HealthHeatmap u={u} d={d} /></CardContent>
        </Card>
        <Card className="lg:col-span-4">
          <CardHeader><CardTitle>Event calendar</CardTitle><CalendarClock className="size-3.5 text-muted" /></CardHeader>
          <CardContent className="px-3 py-1"><CatalystList u={u} d={d} limit={8} /></CardContent>
        </Card>
        <Card className="lg:col-span-3">
          <CardHeader><CardTitle>1Y trend</CardTitle></CardHeader>
          <CardContent className="space-y-2 p-3">
            {u.rows.map((r) => (
              <Link key={r.c.ticker} href={routes(d, r.c.ticker).company} className="grid grid-cols-[44px_1fr_58px] items-center gap-2 text-[11.5px] hover:text-accent">
                <span className="num font-semibold">{r.c.ticker}</span>
                <Sparkline values={r.c.prices.map((p) => p.close)} height={18} />
                <Delta value={r.c.change1y} digits={0} className="justify-end" />
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (d === "b") {
    const top = [...u.rows].sort((a, b) => b.gap - a.gap)[0];
    const strongest = [...u.rows].sort((a, b) => b.c.health.total - a.c.health.total)[0];
    const weakest = [...u.rows].sort((a, b) => a.c.health.total - b.c.health.total)[0];
    return (
      <div className="space-y-14">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.5fr_1fr]">
          <div>
            <p className="font-display text-xl leading-relaxed text-fg-2 first-letter:float-left first-letter:mr-2 first-letter:font-display first-letter:text-6xl first-letter:leading-[0.85] first-letter:text-accent">
              Across the {u.kpis.count} issuers under review, the median financial-health score is {u.kpis.medianHealth} out of 100 and the median base-case model value sits{" "}
              {fmtPct(Math.abs(u.kpis.medianGap ?? 0), 0)} {(u.kpis.medianGap ?? 0) >= 0 ? "above" : "below"} the illustrative share price. {u.kpis.belowModel} companies screen at least
              ten per cent below model value. Every figure in this paragraph is computed by the engine and inserted into a fixed template.
            </p>
          </div>
          <Kpis u={u} className="grid grid-cols-2 gap-x-6 gap-y-6 border-l border-line pl-8" />
        </div>
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-[var(--radius)] border border-line bg-line md:grid-cols-3">
          {[
            { t: "Widest gap to model value", c: top.c, line: `Base-case value ${fmtPrice(top.value)} vs. ${fmtPrice(top.c.price)} (${fmtPct(top.gap, 0, true)}).` },
            { t: "Strongest balance of quality", c: strongest.c, line: `Health score ${strongest.c.health.total}/100 · ${strongest.c.health.grade}.` },
            { t: "Requires closest monitoring", c: weakest.c, line: `Health score ${weakest.c.health.total}/100 — see leverage and coverage pillars.` },
          ].map((x) => (
            <Link key={x.t} href={routes(d, x.c.ticker).company} className="group bg-panel p-7 transition-colors hover:bg-panel-2">
              <div className="text-[11px] uppercase tracking-[0.22em] text-accent">{x.t}</div>
              <div className="mt-4 font-display text-3xl text-fg">{x.c.name}</div>
              <p className="mt-3 text-[14px] leading-relaxed text-fg-2">{x.line}</p>
              <span className="mt-5 inline-flex items-center gap-1 text-[13px] text-accent">Read the research <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" /></span>
            </Link>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.3fr_1fr]">
          <div>
            <h2 className="mb-4 font-display text-2xl text-fg">Quality and valuation, side by side</h2>
            <UniverseScatter u={u} height={320} />
          </div>
          <div>
            <h2 className="mb-4 font-display text-2xl text-fg">In the diary</h2>
            <CatalystList u={u} d={d} limit={7} />
          </div>
        </div>
        <div>
          <h2 className="mb-4 font-display text-2xl text-fg">Coverage summary</h2>
          <div className="rounded-[var(--radius)] border border-line bg-panel p-2"><CoverageTable u={u} d={d} /></div>
        </div>
        <IllustrativeNotice />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
      <Kpis u={u} className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:col-span-12 xl:grid-cols-5" tile="rounded-[var(--radius)] border border-line bg-panel p-4" />
      <Card className="xl:col-span-7">
        <CardHeader><CardTitle>Quality × valuation map</CardTitle><span className="num text-[11px] text-muted">D-01</span></CardHeader>
        <CardContent><UniverseScatter u={u} height={300} /></CardContent>
      </Card>
      <Card className="xl:col-span-5">
        <CardHeader><CardTitle>Health pillar matrix</CardTitle><span className="num text-[11px] text-muted">D-02</span></CardHeader>
        <CardContent className="p-3"><HealthHeatmap u={u} d={d} /></CardContent>
      </Card>
      <Card className="xl:col-span-8">
        <CardHeader><CardTitle>Coverage</CardTitle><span className="num text-[11px] text-muted">D-03</span></CardHeader>
        <CardContent className="p-2"><CoverageTable u={u} d={d} dense /></CardContent>
      </Card>
      <Card className="xl:col-span-4">
        <CardHeader><CardTitle>Upcoming events</CardTitle><span className="num text-[11px] text-muted">D-04</span></CardHeader>
        <CardContent className="py-1"><CatalystList u={u} d={d} /></CardContent>
      </Card>
      <p className="text-[11px] text-muted xl:col-span-12">Snapshot as of {AS_OF}. Model values use each issuer’s default base-case assumptions.</p>
    </div>
  );
}

