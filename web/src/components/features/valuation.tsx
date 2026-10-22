"use client";

import * as React from "react";
import { AlertTriangle, Calculator, RotateCcw } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn, fmtMoneyM, fmtNum, fmtPct, fmtPrice } from "@/lib/utils";
import { MARKET, peerMedians, peersOf, scenariosFor, type Company } from "@/lib/data/build";
import { DcfInputError, probabilityWeighted, runDcf, sensitivityMatrix, steps, type DcfAssumptions, type DcfResult, type DcfYear, type Scenario } from "@/lib/finance/dcf";
import { valuationSignal } from "@/lib/finance/score";
import { LegendRow, LineChart, RangeBars } from "@/components/charts/charts";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

/* ── Controls ─────────────────────────────────────────────────────────── */

type Driver = { key: keyof DcfAssumptions; label: string; min: number; max: number; step: number; hint?: string };

const DRIVERS: Driver[] = [
  { key: "growthStart", label: "Revenue growth · Y1", min: -0.1, max: 0.5, step: 0.005 },
  { key: "growthFinal", label: "Revenue growth · Y5", min: -0.05, max: 0.3, step: 0.005, hint: "Growth fades linearly from Y1 to Y5" },
  { key: "marginTarget", label: "EBIT margin · Y5", min: 0, max: 0.6, step: 0.005, hint: "Margin moves linearly from FY25 actual" },
  { key: "wacc", label: "WACC", min: 0.04, max: 0.16, step: 0.0025 },
  { key: "terminalGrowth", label: "Terminal growth", min: 0, max: 0.045, step: 0.0025 },
  { key: "taxRate", label: "Tax rate", min: 0, max: 0.35, step: 0.005 },
  { key: "capexPctRevenue", label: "CapEx % revenue", min: 0, max: 0.35, step: 0.0025 },
  { key: "daPctRevenue", label: "D&A % revenue", min: 0, max: 0.2, step: 0.0025 },
  { key: "nwcPctIncrementalRevenue", label: "NWC % Δ revenue", min: 0, max: 0.4, step: 0.01 },
];

export function DriverSlider({ d, value, onChange, dense }: { d: Driver; value: number; onChange: (v: number) => void; dense?: boolean }) {
  const id = React.useId();
  return (
    <div className={cn(dense ? "py-1.5" : "py-2")}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-[12px] text-fg-2" title={d.hint}>
          {d.label}
        </label>
        <span className="num text-[12.5px] font-semibold text-fg">{fmtPct(value, 2)}</span>
      </div>
      <Slider id={id} aria-label={d.label} min={d.min} max={d.max} step={d.step} value={[value]} onValueChange={([v]) => onChange(+v.toFixed(6))} />
    </div>
  );
}

export function useDcf(c: Company) {
  const [a, setA] = React.useState<DcfAssumptions>(c.dcf);
  const [midYear, setMidYear] = React.useState(false);
  const input = { ...a, midYear };
  let result: DcfResult | null = null;
  let error: string | null = null;
  try {
    result = runDcf(input);
  } catch (e) {
    error = e instanceof DcfInputError ? e.message : "Invalid inputs";
  }
  return {
    a: input,
    set: (k: keyof DcfAssumptions, v: number) => setA((p) => ({ ...p, [k]: v })),
    reset: () => {
      setA(c.dcf);
      setMidYear(false);
    },
    dirty: JSON.stringify(a) !== JSON.stringify(c.dcf) || midYear,
    midYear,
    setMidYear,
    result,
    error,
  };
}

type Dcf = ReturnType<typeof useDcf>;

export function DcfControls({ dcf, dense, className }: { dcf: Dcf; dense?: boolean; className?: string }) {
  return (
    <div className={className}>
      <div className="divide-y divide-line/60">
        {DRIVERS.map((d) => (
          <DriverSlider key={d.key} d={d} dense={dense} value={dcf.a[d.key] as number} onChange={(v) => dcf.set(d.key, v)} />
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-[12px] text-fg-2">
          <input type="checkbox" checked={dcf.midYear} onChange={(e) => dcf.setMidYear(e.target.checked)} className="accent-[var(--accent)]" />
          Mid-year convention
        </label>
        <Button variant="ghost" size="sm" onClick={dcf.reset} disabled={!dcf.dirty}>
          <RotateCcw /> Reset
        </Button>
      </div>
    </div>
  );
}

export function WaccBuild({ c, className }: { c: Company; className?: string }) {
  const last = c.statements.at(-1)!;
  const wE = c.marketCap / (c.marketCap + last.totalDebt);
  const rows: [string, string][] = [
    ["Risk-free rate (illustrative)", fmtPct(MARKET.riskFree, 2)],
    ["Equity beta", c.beta.toFixed(2)],
    ["Equity risk premium", fmtPct(MARKET.equityRiskPremium, 2)],
    ["Cost of equity (CAPM)", fmtPct(c.costOfEquity, 2)],
    ["Pre-tax cost of debt", fmtPct(c.interestRate, 2)],
    ["Equity / debt weight", `${fmtPct(wE, 0)} / ${fmtPct(1 - wE, 0)}`],
    ["WACC (default)", fmtPct(c.dcf.wacc, 2)],
  ];
  return (
    <dl className={cn("grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-[12px]", className)}>
      {rows.map(([k, v], i) => (
        <React.Fragment key={k}>
          <dt className={cn("text-fg-2", i === rows.length - 1 && "border-t border-line pt-1 font-semibold text-fg")}>{k}</dt>
          <dd className={cn("num text-right text-fg", i === rows.length - 1 && "border-t border-line pt-1 font-semibold")}>{v}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

/* ── Outputs ──────────────────────────────────────────────────────────── */

export function DcfHeadline({ c, dcf, className, big }: { c: Company; dcf: Dcf; className?: string; big?: boolean }) {
  if (!dcf.result) {
    return (
      <div className={cn("flex items-center gap-2 text-sm text-neg", className)} role="alert">
        <AlertTriangle className="size-4" /> {dcf.error}
      </div>
    );
  }
  const r = dcf.result;
  const sig = valuationSignal(r.perShare, c.price);
  return (
    <div className={className}>
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted">Intrinsic value per share (model)</div>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={r.perShare.toFixed(2)}
          initial={{ opacity: 0.4, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
          className={cn("num font-semibold text-fg", big ? "text-5xl" : "text-3xl")}
        >
          {fmtPrice(r.perShare)}
        </motion.div>
      </AnimatePresence>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-fg-2">
        <span>
          vs. price {fmtPrice(c.price)} ·{" "}
          <span className={cn("num font-semibold", sig.gap >= 0 ? "text-pos" : "text-neg")}>{fmtPct(sig.gap, 1, true)}</span>
        </span>
        <Badge variant="accent">{sig.label}</Badge>
      </div>
      {r.terminalShare > 0.75 && (
        <p className="mt-2 flex items-start gap-1.5 text-[11.5px] text-warn">
          <AlertTriangle className="mt-px size-3.5 shrink-0" /> Terminal value is {fmtPct(r.terminalShare, 0)} of EV — the result is highly sensitive to long-run assumptions.
        </p>
      )}
    </div>
  );
}

export function EvBridge({ c, dcf, className }: { c: Company; dcf: Dcf; className?: string }) {
  const r = dcf.result;
  if (!r) return null;
  const items = [
    { label: "PV of FCFF (5y)", v: r.sumPvFcff },
    { label: "PV of terminal value", v: r.pvTerminalValue },
    { label: "Enterprise value", v: r.enterpriseValue, total: true },
    { label: dcf.a.netDebt >= 0 ? "Less: net debt" : "Plus: net cash", v: -dcf.a.netDebt },
    { label: "Equity value", v: r.equityValue, total: true },
  ];
  const max = Math.max(...items.map((i) => Math.abs(i.v)));
  return (
    <div className={cn("space-y-1.5", className)}>
      {items.map((i) => (
        <div key={i.label} className="grid grid-cols-[minmax(120px,40%)_1fr_auto] items-center gap-3 text-[12px]">
          <span className={cn("text-fg-2", i.total && "font-semibold text-fg")}>{i.label}</span>
          <div className="h-2.5 rounded-full bg-panel-2">
            <motion.div
              className="h-full rounded-full"
              style={{ background: i.total ? "var(--s1)" : i.v < 0 ? "var(--neg)" : "var(--s3)" }}
              animate={{ width: `${(Math.abs(i.v) / max) * 100}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
          <span className={cn("num w-20 text-right", i.total && "font-semibold")}>{fmtMoneyM(i.v)}</span>
        </div>
      ))}
      <div className="pt-1 text-[11px] text-muted">
        ÷ {fmtNum(c.dcf.dilutedShares, 0)}m diluted shares = <span className="num text-fg">{fmtPrice(r.perShare)}</span>
      </div>
    </div>
  );
}

export function FcffTable({ dcf, className }: { dcf: Dcf; className?: string }) {
  const r = dcf.result;
  if (!r) return null;
  const lines: [string, (y: DcfYear) => string][] = [
    ["Revenue", (y) => fmtNum(y.revenue)],
    ["Growth", (y) => fmtPct(y.growth)],
    ["EBIT margin", (y) => fmtPct(y.margin)],
    ["NOPAT", (y) => fmtNum(y.nopat)],
    ["+ D&A", (y) => fmtNum(y.da)],
    ["− CapEx", (y) => fmtNum(-y.capex, 0, true)],
    ["− ΔNWC", (y) => fmtNum(-y.deltaNwc, 0, true)],
    ["FCFF", (y) => fmtNum(y.fcff, 0, true)],
    ["Discount factor", (y) => y.discountFactor.toFixed(3)],
    ["PV of FCFF", (y) => fmtNum(y.pv, 0, true)],
  ];
  return (
    <Table className={className}>
      <THead>
        <TR className="hover:bg-transparent">
          <TH>USD m</TH>
          {r.rows.map((y) => (
            <TH key={y.year} className="text-right">FY{2025 + y.year}E</TH>
          ))}
        </TR>
      </THead>
      <TBody>
        {lines.map(([label, f]) => (
          <TR key={label} className={cn((label === "FCFF" || label === "PV of FCFF") && "font-semibold")}>
            <TD className="text-fg-2">{label}</TD>
            {r.rows.map((y) => (
              <TD key={y.year} className="num text-right">{f(y)}</TD>
            ))}
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

export function SensitivityGrid({ c, dcf, className }: { c: Company; dcf: Dcf; className?: string }) {
  const [hover, setHover] = React.useState<[number, number] | null>(null);
  if (!dcf.result) return null;
  const waccs = steps(+dcf.a.wacc.toFixed(4), 0.005, 2);
  const gs = steps(+dcf.a.terminalGrowth.toFixed(4), 0.005, 2);
  const grid = sensitivityMatrix(dcf.a, waccs, gs);
  const cell = (v: number | null) => {
    if (v === null) return { background: "var(--panel-2)" };
    const gap = Math.max(-0.5, Math.min(0.5, v / c.price - 1));
    const pct = Math.round((Math.abs(gap) / 0.5) * 42);
    // Diverging: neutral panel midpoint (value ≈ price), --pos above, --neg below.
    return { background: `color-mix(in oklab, ${gap >= 0 ? "var(--pos)" : "var(--neg)"} ${pct}%, var(--panel))` };
  };
  return (
    <div className={className}>
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full border-separate border-spacing-[2px] text-[12px]" onPointerLeave={() => setHover(null)}>
          <thead>
            <tr>
              <th className="px-2 py-1 text-left text-[10.5px] font-medium text-muted">WACC ↓ · g →</th>
              {gs.map((g, j) => (
                <th key={g} className={cn("num px-2 py-1 text-right font-medium text-muted", hover?.[1] === j && "text-fg")}>{fmtPct(g, 1)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.map((row, i) => (
              <tr key={waccs[i]}>
                <th className={cn("num px-2 py-1 text-left font-medium text-muted", hover?.[0] === i && "text-fg")}>{fmtPct(waccs[i], 1)}</th>
                {row.map((v, j) => (
                  <td
                    key={j}
                    onPointerEnter={() => setHover([i, j])}
                    style={cell(v)}
                    title={v === null ? "Undefined: WACC ≤ g" : `WACC ${fmtPct(waccs[i], 1)}, g ${fmtPct(gs[j], 1)} → ${fmtPrice(v)} (${fmtPct(v / c.price - 1, 0, true)} vs price)`}
                    className={cn("num rounded-[2px] px-2 py-1.5 text-right text-fg", i === 2 && j === 2 && "ring-2 ring-fg/70 ring-inset font-semibold")}
                  >
                    {v === null ? "—" : v.toFixed(0)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex items-center gap-2 text-[11px] text-muted">
        <span className="inline-block h-2 w-10 rounded-full" style={{ background: "linear-gradient(90deg, color-mix(in oklab, var(--neg) 42%, var(--panel)), var(--panel), color-mix(in oklab, var(--pos) 42%, var(--panel)))" }} />
        below price · at price · above price ({fmtPrice(c.price)}). Outlined = current case.
      </div>
    </div>
  );
}

export function FootballField({ c, dcf, className }: { c: Company; dcf: Dcf; className?: string }) {
  if (!dcf.result) return null;
  const last = c.statements.at(-1)!;
  const sc = scenariosFor(dcf.a).map((s) => runDcf(s.assumptions).perShare);
  const med = peerMedians(peersOf(c));
  const perShareFromEv = (ev: number) => (ev - dcf.a.netDebt) / dcf.a.dilutedShares;
  const evE = med.evToEbitda ?? 0;
  const pe = med.pe ?? 0;
  const lows = c.prices.map((p) => p.close);
  const rows = [
    { label: "DCF bear → bull", low: Math.min(...sc), high: Math.max(...sc), mid: dcf.result.perShare, color: "var(--s1)" },
    { label: "Peer EV/EBITDA ±20%", low: perShareFromEv(last.ebitda * evE * 0.8), high: perShareFromEv(last.ebitda * evE * 1.2), color: "var(--s2)" },
    { label: "Peer P/E ±20%", low: last.eps * pe * 0.8, high: last.eps * pe * 1.2, color: "var(--s3)" },
    { label: "52-week range", low: Math.min(...lows), high: Math.max(...lows), color: "var(--s4)" },
  ];
  return (
    <div className={className}>
      <RangeBars rows={rows} marker={c.price} markerLabel="Price" format={(v) => `$${v.toFixed(0)}`} />
    </div>
  );
}

function StudioSection({ title, children, className, note, variant }: { title: string; children: React.ReactNode; className?: string; note?: string; variant: "a" | "b" | "c" }) {
  return (
    <section className={cn("min-w-0 rounded-[var(--radius)] border border-line bg-panel", variant === "b" && "border-line/80 shadow-[0_1px_0_var(--line)]", className)}>
      <header className={cn("flex items-baseline justify-between gap-3 border-b border-line px-4 py-2.5", variant === "b" && "py-3.5")}>
        <h3 className={cn("text-[13px] font-semibold text-fg", variant === "b" && "font-display text-lg font-medium")}>{title}</h3>
        {note && <span className="text-[11px] text-muted">{note}</span>}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function ValuationStudio({ c, variant }: { c: Company; variant: "a" | "b" | "c" }) {
  const dcf = useDcf(c);
  const engineNote = (
    <p className="flex items-center gap-1.5 text-[11px] text-muted">
      <Calculator className="size-3.5" /> Deterministic engine (tested). AI never performs this arithmetic.
    </p>
  );

  if (variant === "a") {
    return (
      <div className="grid grid-cols-1 gap-2 xl:grid-cols-[300px_1fr_1fr]">
        <StudioSection variant={variant} title="Drivers" note="FCFF · 5Y explicit" className="xl:row-span-2">
          <DcfControls dcf={dcf} dense />
          <div className="mt-4 border-t border-line pt-3">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">WACC build</div>
            <WaccBuild c={c} />
          </div>
        </StudioSection>
        <StudioSection variant={variant} title="Output">
          <DcfHeadline c={c} dcf={dcf} />
          <div className="mt-4">
            <EvBridge c={c} dcf={dcf} />
          </div>
        </StudioSection>
        <StudioSection variant={variant} title="Sensitivity · value per share">
          <SensitivityGrid c={c} dcf={dcf} />
        </StudioSection>
        <StudioSection variant={variant} title="Projected free cash flow to firm" className="xl:col-span-1">
          <FcffTable dcf={dcf} />
        </StudioSection>
        <StudioSection variant={variant} title="Valuation range">
          <FootballField c={c} dcf={dcf} />
          <div className="mt-2">{engineNote}</div>
        </StudioSection>
      </div>
    );
  }

  if (variant === "b") {
    return (
      <div className="space-y-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.1fr_1fr]">
          <div className="border-y border-line-strong py-8">
            <DcfHeadline c={c} dcf={dcf} big />
            <p className="mt-6 max-w-prose font-display text-lg leading-relaxed text-fg-2">
              On the current assumptions — revenue growth fading from {fmtPct(dcf.a.growthStart, 1)} to {fmtPct(dcf.a.growthFinal, 1)}, an operating margin
              reaching {fmtPct(dcf.a.marginTarget, 1)} and a {fmtPct(dcf.a.wacc, 1)} cost of capital — the model indicates the value shown above. This sentence is
              assembled from the inputs; no figure is written by AI.
            </p>
            <div className="mt-6">{engineNote}</div>
            <h3 className="mb-4 mt-10 font-display text-lg text-fg">From enterprise to equity value</h3>
            <EvBridge c={c} dcf={dcf} />
          </div>
          <StudioSection variant={variant} title="Assumptions">
            <DcfControls dcf={dcf} />
          </StudioSection>
        </div>
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <StudioSection variant={variant} title="Valuation range" note="Per share">
            <FootballField c={c} dcf={dcf} />
          </StudioSection>
          <StudioSection variant={variant} title="Sensitivity">
            <SensitivityGrid c={c} dcf={dcf} />
          </StudioSection>
        </div>
        <StudioSection variant={variant} title="Cash flow projection" note="USD millions">
          <FcffTable dcf={dcf} />
        </StudioSection>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
      <div className="space-y-4">
        <StudioSection variant={variant} title="Model inputs" note="M-01 · FCFF">
          <DcfControls dcf={dcf} />
        </StudioSection>
        <StudioSection variant={variant} title="Discount rate">
          <WaccBuild c={c} />
        </StudioSection>
      </div>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <StudioSection variant={variant} title="Result">
            <DcfHeadline c={c} dcf={dcf} />
            <div className="mt-3">{engineNote}</div>
          </StudioSection>
          <StudioSection variant={variant} title="EV → equity bridge">
            <EvBridge c={c} dcf={dcf} />
          </StudioSection>
        </div>
        <StudioSection variant={variant} title="Projection" note="USD m · end-of-year discounting unless toggled">
          <FcffTable dcf={dcf} />
        </StudioSection>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <StudioSection variant={variant} title="Sensitivity — WACC × g">
            <SensitivityGrid c={c} dcf={dcf} />
          </StudioSection>
          <StudioSection variant={variant} title="Valuation range">
            <FootballField c={c} dcf={dcf} />
          </StudioSection>
        </div>
      </div>
    </div>
  );
}

/* ── Scenario simulator ───────────────────────────────────────────────── */

const SC_COLOR: Record<Scenario["id"], string> = { bear: "var(--s4)", base: "var(--s1)", bull: "var(--s3)" };

export function ScenarioSimulator({ c, variant }: { c: Company; variant: "a" | "b" | "c" }) {
  const [sc, setSc] = React.useState<Scenario[]>(() => scenariosFor(c.dcf));

  const setDriver = (id: Scenario["id"], k: keyof DcfAssumptions, v: number) =>
    setSc((p) => p.map((s) => (s.id === id ? { ...s, assumptions: { ...s.assumptions, [k]: v } } : s)));

  const setProb = (id: "bear" | "bull", v: number) =>
    setSc((p) => {
      const other = p.find((s) => s.id === (id === "bear" ? "bull" : "bear"))!.probability;
      const val = Math.min(v, 1 - other);
      return p.map((s) => (s.id === id ? { ...s, probability: val } : s.id === "base" ? { ...s, probability: +(1 - val - other).toFixed(4) } : s));
    });

  let pw: ReturnType<typeof probabilityWeighted> | null = null;
  let err: string | null = null;
  try {
    pw = probabilityWeighted(sc);
  } catch (e) {
    err = e instanceof Error ? e.message : "Invalid";
  }

  const years = ["FY25A", "FY26E", "FY27E", "FY28E", "FY29E", "FY30E"];
  const series = (pw?.results ?? []).map((r) => ({
    id: r.id,
    label: r.label,
    color: SC_COLOR[r.id],
    values: [c.dcf.baseRevenue, ...r.result.rows.map((y) => y.revenue)],
  }));

  const drivers: Driver[] = [DRIVERS[0], DRIVERS[2], DRIVERS[3]];

  return (
    <div className={cn("space-y-4", variant === "b" && "space-y-8")}>
      <div className={cn("grid grid-cols-1 gap-3 md:grid-cols-3", variant === "a" && "gap-2", variant === "b" && "gap-6")}>
        {sc.map((s) => {
          const res = pw?.results.find((r) => r.id === s.id)?.result;
          return (
            <section key={s.id} className="rounded-[var(--radius)] border border-line bg-panel p-4" style={{ borderTop: `3px solid ${SC_COLOR[s.id]}` }}>
              <div className="flex items-baseline justify-between">
                <h3 className={cn("text-[13px] font-semibold text-fg", variant === "b" && "font-display text-xl font-medium")}>{s.label} case</h3>
                <span className="num text-[12px] text-muted">p = {fmtPct(s.probability, 0)}</span>
              </div>
              <div className="num mt-2 text-2xl font-semibold text-fg">{res ? fmtPrice(res.perShare) : "—"}</div>
              <div className="text-[11.5px] text-muted">
                {res ? <span className={res.perShare >= c.price ? "text-pos" : "text-neg"}>{fmtPct(res.perShare / c.price - 1, 1, true)}</span> : null} vs price
              </div>
              <div className="mt-3 divide-y divide-line/60 border-t border-line">
                {drivers.map((d) => (
                  <DriverSlider key={d.key} d={d} dense value={s.assumptions[d.key] as number} onChange={(v) => setDriver(s.id, d.key, v)} />
                ))}
                {s.id !== "base" && (
                  <div className="py-1.5">
                    <div className="mb-1.5 flex justify-between text-[12px] text-fg-2">
                      <span>Probability</span>
                      <span className="num font-semibold text-fg">{fmtPct(s.probability, 0)}</span>
                    </div>
                    <Slider aria-label={`${s.label} probability`} min={0} max={0.6} step={0.05} value={[s.probability]} onValueChange={([v]) => setProb(s.id as "bear" | "bull", v)} />
                  </div>
                )}
                {s.id === "base" && <p className="pt-2 text-[11px] text-muted">Base probability = 100% − bear − bull.</p>}
              </div>
            </section>
          );
        })}
      </div>
      <div className={cn("grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1.4fr]", variant === "b" && "gap-6")}>
        <section className="rounded-[var(--radius)] border border-line bg-panel p-4">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted">Probability-weighted value</div>
          {pw ? (
            <>
              <div className="num mt-1 text-4xl font-semibold text-fg">{fmtPrice(pw.weighted)}</div>
              <div className="mt-1 text-[12px] text-fg-2">
                {fmtPct(pw.weighted / c.price - 1, 1, true)} vs. illustrative price {fmtPrice(c.price)}
              </div>
              <div className="mt-4 space-y-2">
                {pw.results.map((r) => {
                  const max = Math.max(...pw!.results.map((x) => x.result.perShare), c.price) * 1.1;
                  return (
                    <div key={r.id} className="grid grid-cols-[44px_1fr_64px] items-center gap-2 text-[12px]">
                      <span className="text-fg-2">{r.label}</span>
                      <div className="relative h-3 rounded-full bg-panel-2">
                        <motion.div className="h-full rounded-full" style={{ background: SC_COLOR[r.id] }} animate={{ width: `${Math.max(0, r.result.perShare / max) * 100}%` }} />
                        <div className="absolute -inset-y-1 w-px bg-fg" style={{ left: `${(c.price / max) * 100}%` }} title={`Price ${fmtPrice(c.price)}`} />
                      </div>
                      <span className="num text-right">{fmtPrice(r.result.perShare)}</span>
                    </div>
                  );
                })}
                <div className="text-[11px] text-muted">Vertical rule = illustrative price.</div>
              </div>
            </>
          ) : (
            <p className="mt-2 text-sm text-neg">{err}</p>
          )}
          <p className="mt-4 border-t border-line pt-3 text-[11px] leading-relaxed text-muted">
            Scenario values are model outputs under stated assumptions, not forecasts or expected returns. Probabilities are analyst judgement.
          </p>
        </section>
        <section className="rounded-[var(--radius)] border border-line bg-panel p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[13px] font-semibold text-fg">Revenue path by scenario</h3>
            <LegendRow series={series} />
          </div>
          <LineChart series={series} xLabels={years} height={240} formatY={(v) => `$${(v / 1000).toFixed(0)}B`} />
          <Table className="mt-3">
            <THead>
              <TR className="hover:bg-transparent">
                <TH>Driver</TH>
                {sc.map((s) => (
                  <TH key={s.id} className="text-right">{s.label}</TH>
                ))}
              </TR>
            </THead>
            <TBody>
              {DRIVERS.slice(0, 5).map((d) => (
                <TR key={d.key}>
                  <TD className="text-fg-2">{d.label}</TD>
                  {sc.map((s) => (
                    <TD key={s.id} className="num text-right">{fmtPct(s.assumptions[d.key] as number, 1)}</TD>
                  ))}
                </TR>
              ))}
            </TBody>
          </Table>
        </section>
      </div>
    </div>
  );
}
