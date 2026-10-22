"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn, fmtPct } from "@/lib/utils";
import { routes, type DesignId } from "@/lib/designs";
import type { Company } from "@/lib/data/build";
import { LegendRow, LineChart } from "@/components/charts/charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HealthBreakdown, IllustrativeNotice, KeyStats, PeerTable, PriceChart } from "./common";
import { Catalysts } from "./thesis";

export function MarginChart({ c, height = 200 }: { c: Company; height?: number }) {
  const series = [
    { id: "gm", label: "Gross margin", color: "var(--s1)", values: c.metrics.map((m) => m.grossMargin ?? 0) },
    { id: "om", label: "Operating margin", color: "var(--s2)", values: c.metrics.map((m) => m.operatingMargin ?? 0) },
    { id: "nm", label: "Net margin", color: "var(--s3)", values: c.metrics.map((m) => m.netMargin ?? 0) },
  ];
  return (
    <div>
      <LegendRow series={series} className="mb-2" />
      <LineChart series={series} xLabels={c.metrics.map((m) => `FY${m.fy}`)} height={height} formatY={(v) => fmtPct(v, 0)} zeroBased />
    </div>
  );
}

function ThesisSnapshot({ c, d }: { c: Company; d: DesignId }) {
  return (
    <div className="space-y-3 text-[13px]">
      {[c.bull[0], c.bear[0]].map((cl, i) => (
        <div key={i}>
          <div className="mb-1 flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">{i === 0 ? "Bull" : "Bear"}</span>
            <Badge variant={cl.kind}>{cl.kind === "interpretation" ? "AI interpretation" : cl.kind}</Badge>
            {cl.evidence.map((e) => (
              <span key={e} className="text-[11px] text-muted">[{e}]</span>
            ))}
          </div>
          <p className="leading-relaxed text-fg">{cl.text}</p>
        </div>
      ))}
      <Link href={routes(d, c.ticker).thesis} className="inline-flex items-center gap-1 text-[12px] font-medium text-accent hover:underline">
        Full thesis & evidence <ArrowRight className="size-3" />
      </Link>
    </div>
  );
}

export function CompanyOverview({ c, d }: { c: Company; d: DesignId }) {
  if (d === "a") {
    return (
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-12">
        <Card className="lg:col-span-8">
          <CardHeader><CardTitle>Price · {c.ticker}</CardTitle><span className="text-[11px] text-muted">GP &lt;GO&gt;</span></CardHeader>
          <CardContent className="p-3"><PriceChart c={c} height={260} /></CardContent>
        </Card>
        <Card className="lg:col-span-4">
          <CardHeader><CardTitle>Health score</CardTitle><span className="text-[11px] text-muted">HS</span></CardHeader>
          <CardContent className="p-3"><HealthBreakdown c={c} /></CardContent>
        </Card>
        <Card className="lg:col-span-12">
          <CardContent className="p-3"><KeyStats c={c} cols="grid-cols-2 sm:grid-cols-4 lg:grid-cols-8" /></CardContent>
        </Card>
        <Card className="lg:col-span-5">
          <CardHeader><CardTitle>Margin structure</CardTitle></CardHeader>
          <CardContent className="p-3"><MarginChart c={c} /></CardContent>
        </Card>
        <Card className="lg:col-span-7">
          <CardHeader><CardTitle>Relative value · comps</CardTitle><span className="text-[11px] text-muted">RV</span></CardHeader>
          <CardContent className="p-0"><PeerTable c={c} d={d} className="p-2" /></CardContent>
        </Card>
        <Card className="lg:col-span-6">
          <CardHeader><CardTitle>Thesis snapshot</CardTitle></CardHeader>
          <CardContent className="p-3"><ThesisSnapshot c={c} d={d} /></CardContent>
        </Card>
        <Card className="lg:col-span-6">
          <CardHeader><CardTitle>Catalysts</CardTitle></CardHeader>
          <CardContent className="p-3"><Catalysts c={c} /></CardContent>
        </Card>
      </div>
    );
  }

  if (d === "b") {
    return (
      <div className="space-y-14">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <h2 className="mb-4 font-display text-2xl text-fg">Share price, past year</h2>
            <PriceChart c={c} height={280} />
          </div>
          <div className="border-l border-line pl-8">
            <h2 className="mb-4 font-display text-2xl text-fg">Financial condition</h2>
            <HealthBreakdown c={c} />
          </div>
        </div>
        <div className="border-y border-line py-8">
          <KeyStats c={c} cols="grid-cols-2 md:grid-cols-4" className="gap-y-8" />
        </div>
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
          <div>
            <h2 className="mb-4 font-display text-2xl text-fg">Profitability over five years</h2>
            <MarginChart c={c} height={240} />
          </div>
          <div>
            <h2 className="mb-4 font-display text-2xl text-fg">The investment debate</h2>
            <ThesisSnapshot c={c} d={d} />
          </div>
        </div>
        <div>
          <h2 className="mb-4 font-display text-2xl text-fg">How it compares</h2>
          <PeerTable c={c} d={d} />
        </div>
        <IllustrativeNotice />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <Card className="xl:col-span-2">
        <CardHeader><CardTitle>Price series</CardTitle><span className="num text-[11px] text-muted">P-01</span></CardHeader>
        <CardContent><PriceChart c={c} height={250} /></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Health score</CardTitle><span className="num text-[11px] text-muted">H-01</span></CardHeader>
        <CardContent><HealthBreakdown c={c} /></CardContent>
      </Card>
      <Card className="xl:col-span-3">
        <CardContent><KeyStats c={c} cols="grid-cols-2 sm:grid-cols-4 xl:grid-cols-8" /></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Margins</CardTitle><span className="num text-[11px] text-muted">F-02</span></CardHeader>
        <CardContent><MarginChart c={c} /></CardContent>
      </Card>
      <Card className="xl:col-span-2">
        <CardHeader><CardTitle>Comparable companies</CardTitle><span className="num text-[11px] text-muted">C-01</span></CardHeader>
        <CardContent className="p-2"><PeerTable c={c} d={d} /></CardContent>
      </Card>
      <Card className={cn("xl:col-span-2")}>
        <CardHeader><CardTitle>Thesis</CardTitle><span className="num text-[11px] text-muted">T-01</span></CardHeader>
        <CardContent><ThesisSnapshot c={c} d={d} /></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Catalysts</CardTitle></CardHeader>
        <CardContent><Catalysts c={c} /></CardContent>
      </Card>
    </div>
  );
}
