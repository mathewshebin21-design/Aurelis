"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { motion } from "motion/react";
import { fmtPct, fmtPrice } from "@/lib/utils";
import { AS_OF, getCompany } from "@/lib/data/build";
import { runDcf } from "@/lib/finance/dcf";
import { routes } from "@/lib/designs";
import { LineChart } from "@/components/charts/charts";
import { Button } from "@/components/ui/button";
import { Delta, IllustrativeNotice } from "@/components/features/common";

const FUNCTIONS = [
  { code: "FA", name: "Financial analysis", desc: "Five-year statements, normalised ratios and provenance tags on every line.", href: "financials" },
  { code: "DCF", name: "Valuation studio", desc: "FCFF model with live WACC × g sensitivity and EV-to-equity bridge.", href: "valuation" },
  { code: "SCN", name: "Scenario simulator", desc: "Bear / base / bull with explicit probabilities and weighted value.", href: "scenarios" },
  { code: "THS", name: "Thesis & evidence", desc: "Every claim typed as fact, assumption or AI interpretation — with citations.", href: "thesis" },
  { code: "HS", name: "Health score", desc: "Five transparent pillars, published thresholds, no black box.", href: "company" },
  { code: "WL", name: "Watchlists", desc: "Monitor coverage with computed multiples and quality signals.", href: "watchlist" },
] as const;


export function LandingA() {
  const c = getCompany("NWSC")!;
  const v = runDcf(c.dcf);
  const r = routes("a");
  const pts = c.prices.slice(-126);
  const debt = c.statements.at(-1)!.totalDebt;
  const wE = c.marketCap / (c.marketCap + debt);
  // Every figure in this transcript is computed from the dataset, not typed in.
  const LINES = [
    `> ${c.ticker} <EQUITY> DCF <GO>`,
    `  statements FY${c.statements[0].fy}–FY${c.statements.at(-1)!.fy} loaded ........ ok`,
    `  wacc = ${wE.toFixed(2)}·${fmtPct(c.costOfEquity)} + ${(1 - wE).toFixed(2)}·${fmtPct(c.interestRate)}·(1−${fmtPct(c.taxRate, 0)}) = ${fmtPct(c.dcf.wacc, 2)}`,
    `  fcff projection ${c.dcf.years}y, linear fade ......... ok`,
    `  intrinsic value / share = ${fmtPrice(v.perShare)}`,
    `  claims with citations: ${[...c.bull, ...c.bear].filter((x) => x.evidence.length).length}/${c.bull.length + c.bear.length}`,
  ];
  return (
    <div className="min-h-dvh bg-bg text-[13px]">
      <header className="flex h-12 items-center gap-4 border-b border-line px-4 sm:px-6">
        <span className="num flex items-center gap-2 text-[12px] font-bold tracking-[0.22em] text-fg">
          <span className="size-2 rounded-full bg-accent shadow-[0_0_12px_var(--accent)]" /> AURELIS
        </span>
        <span className="num hidden text-[10.5px] tracking-widest text-muted sm:inline">INVESTMENT INTELLIGENCE TERMINAL</span>
        <nav className="ml-auto flex items-center gap-1">
          <Link href="/" className="px-2 text-[12px] text-muted hover:text-fg">Compare designs</Link>
          <Button asChild size="sm"><Link href={r.dashboard}>Launch terminal</Link></Button>
        </nav>
      </header>

      <section className="relative overflow-hidden border-b border-line">
        <div className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:radial-gradient(ellipse_at_70%_0%,color-mix(in_oklab,var(--accent)_22%,transparent),transparent_60%)]" />
        <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_1.05fr] lg:py-20">
          <div>
            <div className="num mb-5 inline-flex items-center gap-2 rounded-[var(--radius)] border border-line-strong bg-panel px-2 py-1 text-[10.5px] tracking-widest text-accent">
              DESIGN A · INSTITUTIONAL TERMINAL
            </div>
            <h1 className="text-4xl font-semibold leading-[1.08] tracking-tight text-fg sm:text-5xl">
              Equity research at terminal speed.
              <span className="block text-fg-2">Every number traceable to its source.</span>
            </h1>
            <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-fg-2">
              AURELIS combines filing-grade financial data, a deterministic valuation engine and evidence-bound AI research in one dense, keyboard-first workspace.
            </p>
            <div className="mt-8 flex flex-wrap gap-2">
              <Button asChild size="lg"><Link href={r.dashboard}>Open dashboard <ArrowRight /></Link></Button>
              <Button asChild size="lg" variant="outline"><Link href={r.valuation}>Try the DCF studio</Link></Button>
            </div>
            <div className="num mt-10 grid max-w-lg grid-cols-3 gap-px overflow-hidden rounded-[var(--radius)] border border-line bg-line text-[11px]">
              {[
                ["0", "AI-computed numbers"],
                ["3", "claim types, never blended"],
                ["⌘K", "everything searchable"],
              ].map(([a, b]) => (
                <div key={b} className="bg-panel px-3 py-3">
                  <div className="text-lg font-semibold text-fg">{a}</div>
                  <div className="text-muted">{b}</div>
                </div>
              ))}
            </div>
          </div>

          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="self-start rounded-[var(--radius)] border border-line-strong bg-panel shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)]">
            <div className="flex items-center gap-2 border-b border-line px-3 py-2">
              <span className="num rounded-[2px] bg-accent px-1.5 text-[11px] font-bold text-accent-fg">NWSC</span>
              <span className="text-[12px] font-semibold text-fg">{c.name}</span>
              <span className="num ml-auto text-[13px] font-semibold text-fg">{fmtPrice(c.price)}</span>
              <Delta value={c.change1d} />
            </div>
            <div className="grid grid-cols-1 gap-px bg-line sm:grid-cols-[1.5fr_1fr]">
              <div className="bg-panel p-3">
                <LineChart series={[{ id: "p", label: "NWSC", color: "var(--s1)", values: pts.map((p) => p.close) }]} xLabels={pts.map((p) => `T−${251 - p.t}d`)} height={170} area formatY={(x) => `$${x.toFixed(0)}`} />
              </div>
              <div className="num space-y-2 bg-panel p-3 text-[11.5px]">
                {[
                  ["Model value", fmtPrice(v.perShare)],
                  ["vs price", fmtPct(v.perShare / c.price - 1, 1, true)],
                  ["WACC", fmtPct(c.dcf.wacc, 2)],
                  ["Terminal g", fmtPct(c.dcf.terminalGrowth, 2)],
                  ["TV share of EV", fmtPct(v.terminalShare, 0)],
                  ["Health", `${c.health.total}/100`],
                ].map(([k, val]) => (
                  <div key={k} className="flex justify-between border-b border-line/60 pb-1.5">
                    <span className="text-muted">{k}</span>
                    <span className="text-fg">{val}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="num border-t border-line bg-bg/60 p-3 text-[11px] leading-relaxed">
              {LINES.map((l, i) => (
                <motion.div key={l} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 + i * 0.25 }} className={i === 0 ? "text-accent" : "text-fg-2"}>
                  {l}
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="num mb-6 text-[11px] tracking-widest text-muted">FUNCTIONS</div>
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-[var(--radius)] border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {FUNCTIONS.map((f, i) => (
            <motion.div key={f.code} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }}>
              <Link href={f.href === "watchlist" ? r.watchlist : r[f.href]} className="group flex h-full flex-col bg-panel p-5 transition-colors hover:bg-panel-2">
                <span className="num w-fit rounded-[2px] border border-accent/40 px-1.5 text-[11px] font-bold text-accent">{f.code}</span>
                <span className="mt-3 text-[15px] font-semibold text-fg">{f.name}</span>
                <span className="mt-1 text-[13px] leading-relaxed text-muted">{f.desc}</span>
                <span className="num mt-4 text-[11px] text-fg-2 group-hover:text-accent">{f.code} &lt;GO&gt; →</span>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      <footer className="border-t border-line px-4 py-6 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <IllustrativeNotice />
          <span className="num text-[11px] text-muted">Preview build · {AS_OF}</span>
        </div>
      </footer>
    </div>
  );
}
