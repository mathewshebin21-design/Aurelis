"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { motion } from "motion/react";
import { fmtPct, fmtPrice } from "@/lib/utils";
import { COMPANY_DATA, getCompany } from "@/lib/data/build";
import { runDcf } from "@/lib/finance/dcf";
import { routes } from "@/lib/designs";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { IllustrativeNotice } from "@/components/features/common";

const MODULES = [
  { id: "M-01", t: "DCF model", d: "FCFF, WACC build, terminal value, 5×5 sensitivity.", k: "valuation" },
  { id: "M-02", t: "Scenario engine", d: "Probability-weighted bear / base / bull.", k: "scenarios" },
  { id: "M-03", t: "Health score", d: "Five pillars, published bands, unit-tested.", k: "company" },
  { id: "M-04", t: "Evidence graph", d: "Claim → citation traceability with gap detection.", k: "thesis" },
  { id: "M-05", t: "Statements", d: "Normalised IS / BS / CF with XBRL concept mapping.", k: "financials" },
  { id: "M-06", t: "Screener", d: "Search, filter and compare the coverage universe.", k: "search" },
] as const;

function LiveModel() {
  const c = getCompany("ALTP")!;
  const [w, setW] = React.useState(c.dcf.wacc);
  const [g, setG] = React.useState(c.dcf.terminalGrowth);
  const v = runDcf({ ...c.dcf, wacc: w, terminalGrowth: g });
  return (
    <div className="rounded-[var(--radius)] border border-line bg-panel shadow-[0_24px_60px_-30px_rgba(15,23,32,0.35)]">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5 text-[12px]">
        <span className="font-semibold">M-01 · live · {c.ticker}</span>
        <span className="num text-muted">det-v0</span>
      </div>
      <div className="space-y-4 p-4">
        <div>
          <div className="mb-1.5 flex justify-between text-[12px] text-fg-2"><span>WACC</span><span className="num font-semibold text-fg">{fmtPct(w, 2)}</span></div>
          <Slider aria-label="WACC" min={0.06} max={0.14} step={0.0025} value={[w]} onValueChange={([x]) => setW(x)} />
        </div>
        <div>
          <div className="mb-1.5 flex justify-between text-[12px] text-fg-2"><span>Terminal growth</span><span className="num font-semibold text-fg">{fmtPct(g, 2)}</span></div>
          <Slider aria-label="Terminal growth" min={0} max={0.04} step={0.0025} value={[g]} onValueChange={([x]) => setG(x)} />
        </div>
        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-[var(--radius)] border border-line bg-line text-[11px]">
          {[
            ["Value / share", fmtPrice(v.perShare)],
            ["vs price", fmtPct(v.perShare / c.price - 1, 1, true)],
            ["TV % EV", fmtPct(v.terminalShare, 0)],
          ].map(([k, x]) => (
            <div key={k} className="bg-panel p-2.5">
              <div className="text-muted">{k}</div>
              <div className="num mt-0.5 text-[15px] font-semibold text-fg">{x}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function LandingC() {
  const r = routes("c");
  const years = COMPANY_DATA[0].statements.length;
  return (
    <div className="min-h-dvh bg-panel text-[14px]">
      <header className="flex h-14 items-center gap-3 border-b border-line px-4 sm:px-6">
        <span className="grid size-6 place-items-center rounded-[5px] bg-fg text-[11px] font-bold text-panel">Au</span>
        <span className="font-semibold tracking-tight">Aurelis <span className="font-normal text-muted">Lab</span></span>
        <nav className="ml-auto flex items-center gap-2">
          <Link href="/" className="px-2 text-[13px] text-muted hover:text-fg">Compare designs</Link>
          <Button asChild size="sm" className="bg-fg text-panel hover:bg-fg/90"><Link href={r.dashboard}>Open workspace</Link></Button>
        </nav>
      </header>

      <section className="grid-paper border-b border-line">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:py-24">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <div className="num mb-5 inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1 text-[11.5px] text-fg-2">
              <span className="size-1.5 rounded-full bg-s1" /> Design C · Quant research lab
            </div>
            <h1 className="text-4xl font-semibold leading-[1.05] tracking-tight text-fg sm:text-6xl">A precision workbench for fundamental research.</h1>
            <p className="mt-6 max-w-lg text-[16px] leading-relaxed text-fg-2">
              Modular analytics, reproducible models and evidence-linked AI — built so that every output can be traced, re-run and defended.
            </p>
            <div className="num mt-8 overflow-x-auto rounded-[var(--radius)] border border-line bg-panel px-4 py-3 text-[13px] text-fg">
              V<sub>0</sub> = Σ<sub>t=1..N</sub> FCFF<sub>t</sub> / (1+WACC)<sup>t</sup> + TV / (1+WACC)<sup>N</sup> − net debt
            </div>
            <div className="mt-8 flex flex-wrap gap-2">
              <Button asChild size="lg" className="bg-fg text-panel hover:bg-fg/90"><Link href={r.dashboard}>Open workspace</Link></Button>
              <Button asChild size="lg" variant="outline"><Link href={r.valuation}>Inspect a model</Link></Button>
            </div>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }} className="lg:pt-6">
            <LiveModel />
            <p className="mt-3 text-[11.5px] text-muted">Drag the sliders — the value is recomputed by the same tested engine used across the workspace.</p>
          </motion.div>
        </div>
      </section>

      <section className="border-b border-line">
        <div className="num mx-auto grid max-w-7xl grid-cols-2 divide-x divide-line px-0 text-center sm:grid-cols-4">
          {[
            [String(COMPANY_DATA.length), "illustrative issuers"],
            [String(years), "fiscal years each"],
            ["14", "ratios computed"],
            ["0", "numbers produced by AI"],
          ].map(([a, b]) => (
            <div key={b} className="px-4 py-8">
              <div className="text-3xl font-semibold text-fg">{a}</div>
              <div className="mt-1 text-[12px] text-muted">{b}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <h2 className="mb-8 text-xl font-semibold tracking-tight">Modules</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((m, i) => (
            <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }}>
              <Link href={r[m.k]} className="group block h-full rounded-[var(--radius)] border border-line bg-panel p-5 transition-all hover:-translate-y-0.5 hover:border-line-strong hover:shadow-md">
                <div className="flex items-center justify-between">
                  <span className="num text-[12px] text-muted">{m.id}</span>
                  <ArrowUpRight className="size-4 text-muted transition-colors group-hover:text-accent" />
                </div>
                <div className="mt-6 text-[16px] font-semibold text-fg">{m.t}</div>
                <div className="mt-1 text-[13px] text-fg-2">{m.d}</div>
              </Link>
            </motion.div>
          ))}
        </div>
        <IllustrativeNotice className="mt-10" />
      </section>
    </div>
  );
}
