"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowDownRight, ArrowUpRight, FlaskConical, Info, Star } from "lucide-react";
import { motion } from "motion/react";
import { cn, fmtMoneyM, fmtPct, fmtPrice, fmtX } from "@/lib/utils";
import { COMPANY_TABS, routes, type DesignId } from "@/lib/designs";
import { AS_OF, peerMedians, peersOf, type Company } from "@/lib/data/build";
import { HEALTH_RULES } from "@/lib/finance/score";
import { LineChart } from "@/components/charts/charts";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useWatchlist } from "@/hooks/use-watchlist";

export function IllustrativeNotice({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn("flex items-start gap-2 text-[11.5px] leading-snug text-warn", className)} role="note">
      <FlaskConical className="mt-px size-3.5 shrink-0" aria-hidden />
      <span>
        <strong className="font-semibold">Illustrative data.</strong>{" "}
        {compact
          ? "Fictional companies & figures for design preview."
          : `All companies, tickers, prices, filings and figures are fictional and generated for this design preview (as-of ${AS_OF}). Nothing here describes a real issuer or is investment advice.`}
      </span>
    </div>
  );
}

export function Delta({ value, className, digits = 2 }: { value: number | null; className?: string; digits?: number }) {
  if (value === null || !Number.isFinite(value)) return <span className={cn("text-muted", className)}>n/m</span>;
  const up = value >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("num inline-flex items-center gap-0.5", up ? "text-pos" : "text-neg", className)}>
      <Icon className="size-3" aria-hidden />
      {fmtPct(value, digits, true)}
    </span>
  );
}

export function Stat({ label, value, sub, className, hint }: { label: string; value: React.ReactNode; sub?: React.ReactNode; className?: string; hint?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex items-center gap-1 text-[10.5px] font-medium uppercase tracking-wider text-muted">
        {label}
        {hint && (
          <Tooltip>
            <TooltipTrigger aria-label={`About ${label}`}>
              <Info className="size-3" />
            </TooltipTrigger>
            <TooltipContent>{hint}</TooltipContent>
          </Tooltip>
        )}
      </div>
      <div className="num mt-0.5 truncate text-[15px] font-semibold text-fg">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted">{sub}</div>}
    </div>
  );
}

export function WatchStar({ ticker, className }: { ticker: string; className?: string }) {
  const w = useWatchlist();
  const on = w.has(ticker);
  return (
    <button
      type="button"
      onClick={() => w.toggle(ticker)}
      aria-pressed={on}
      aria-label={on ? `Remove ${ticker} from watchlist` : `Add ${ticker} to watchlist`}
      className={cn("inline-flex items-center gap-1.5 rounded-[var(--radius)] border border-line-strong px-2.5 py-1 text-xs font-medium text-fg-2 transition-colors hover:bg-panel-2", className)}
    >
      <Star className={cn("size-3.5", on && "fill-accent text-accent")} />
      {on ? "Watching" : "Watch"}
    </button>
  );
}

export function CompanyTabs({ d, ticker, className }: { d: DesignId; ticker: string; className?: string }) {
  const pathname = usePathname();
  const r = routes(d, ticker);
  return (
    <nav aria-label="Company sections" className={cn("flex gap-1 overflow-x-auto border-b border-line scrollbar-thin", className)}>
      {COMPANY_TABS.map((t) => {
        const href = r[t.key];
        const active = pathname === href;
        return (
          <Link
            key={t.key}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn("relative -mb-px whitespace-nowrap px-3 py-2 text-[13px] font-medium text-muted transition-colors hover:text-fg", active && "text-fg")}
          >
            {t.label}
            {active && <motion.span layoutId={`tab-${d}`} className="absolute inset-x-2 -bottom-px h-0.5 bg-accent" />}
          </Link>
        );
      })}
    </nav>
  );
}

const RANGES = [
  { id: "1M", n: 21 },
  { id: "3M", n: 63 },
  { id: "6M", n: 126 },
  { id: "1Y", n: 252 },
];

export function PriceChart({ c, height = 220, className }: { c: Company; height?: number; className?: string }) {
  const [range, setRange] = React.useState("1Y");
  const n = RANGES.find((r) => r.id === range)!.n;
  const pts = c.prices.slice(-n);
  const labels = pts.map((p) => `T−${c.prices.length - 1 - p.t}d`);
  return (
    <div className={className}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-[11px] text-muted">Illustrative daily close · USD</div>
        <div role="group" aria-label="Chart range" className="flex rounded-[var(--radius)] border border-line p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRange(r.id)}
              aria-pressed={range === r.id}
              className={cn("rounded-[calc(var(--radius)-1px)] px-2 py-0.5 text-[11px] font-medium text-muted", range === r.id && "bg-panel-2 text-fg")}
            >
              {r.id}
            </button>
          ))}
        </div>
      </div>
      <LineChart series={[{ id: "px", label: c.ticker, color: "var(--s1)", values: pts.map((p) => p.close) }]} xLabels={labels} height={height} area formatY={(v) => `$${v.toFixed(0)}`} />
    </div>
  );
}

export function KeyStats({ c, className, cols = "grid-cols-2 sm:grid-cols-4" }: { c: Company; className?: string; cols?: string }) {
  const last = c.statements.at(-1)!;
  const lm = c.metrics.at(-1)!;
  return (
    <div className={cn("grid grid-cols-1 gap-x-6 gap-y-4", cols, className)}>
      <Stat label="Market cap" value={fmtMoneyM(c.marketCap)} />
      <Stat label="Enterprise value" value={fmtMoneyM(c.enterpriseValue)} hint="Market cap + total debt − cash" />
      <Stat label="Revenue FY25" value={fmtMoneyM(last.revenue)} sub={<Delta value={lm.revenueGrowth} digits={1} />} />
      <Stat label="Op. margin" value={fmtPct(lm.operatingMargin)} />
      <Stat label="EV / EBITDA" value={fmtX(c.multiples.evToEbitda)} />
      <Stat label="P / E" value={fmtX(c.multiples.pe)} />
      <Stat label="FCF yield" value={fmtPct(c.multiples.fcfYield)} />
      <Stat label="ROIC" value={fmtPct(lm.roic)} hint="NOPAT ÷ average (debt + equity − cash)" />
    </div>
  );
}

export function HealthBreakdown({ c, className, showMethod = true }: { c: Company; className?: string; showMethod?: boolean }) {
  const fmt = (id: string, v: number | null) =>
    v === null ? "n/m" : id === "leverage" || id === "coverage" ? fmtX(v) : fmtPct(v);
  return (
    <div className={className}>
      <div className="flex items-end justify-between">
        <div>
          <div className="num text-3xl font-semibold leading-none text-fg">
            {c.health.total}
            <span className="text-base text-muted">/100</span>
          </div>
          <div className="mt-1 text-xs text-fg-2">Financial health · {c.health.grade}</div>
        </div>
        <Badge>Rule-based</Badge>
      </div>
      <ul className="mt-4 space-y-2.5">
        {c.health.pillars.map((p) => (
          <li key={p.id}>
            <div className="flex justify-between text-[12px]">
              <span className="text-fg-2">
                {p.label} <span className="text-muted">· {p.metric}</span>
              </span>
              <span className="num text-fg">
                {fmt(p.id, p.value)} <span className="text-muted">→ {p.points}/{p.max}</span>
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-panel-2">
              <motion.div className="h-full rounded-full bg-s1" initial={{ width: 0 }} animate={{ width: `${(p.points / p.max) * 100}%` }} transition={{ duration: 0.6, ease: "easeOut" }} />
            </div>
          </li>
        ))}
      </ul>
      {showMethod && (
        <details className="mt-4 text-[11.5px] text-fg-2">
          <summary className="cursor-pointer font-medium text-fg">Methodology</summary>
          <p className="mt-2 text-muted">Five pillars × 20 points, same thresholds for every company. Describes historical condition only — not a rating or recommendation.</p>
          <table className="mt-2 w-full">
            <tbody>
              {HEALTH_RULES.map((r) => (
                <tr key={r.id} className="border-t border-line align-top">
                  <td className="py-1 pr-2 font-medium text-fg">{r.label}</td>
                  <td className="num py-1 text-muted">
                    {r.bands.map((b) => `${r.lowerIsBetter ? "≤" : "≥"}${r.id === "leverage" || r.id === "coverage" ? b.threshold + "×" : b.threshold * 100 + "%"}: ${b.points}`).join(" · ")}
                    {` · else ${0}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}

export function PeerTable({ c, d, className }: { c: Company; d: DesignId; className?: string }) {
  const peers = peersOf(c);
  const med = peerMedians(peers);
  const rows = [c, ...peers];
  return (
    <div className={className}>
      <Table>
        <THead>
          <TR>
            <TH>Company</TH>
            <TH className="text-right">Mkt cap</TH>
            <TH className="text-right">EV/Sales</TH>
            <TH className="text-right">EV/EBITDA</TH>
            <TH className="text-right">P/E</TH>
            <TH className="text-right">FCF yld</TH>
            <TH className="text-right">Health</TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((p) => (
            <TR key={p.ticker} className={cn(p.ticker === c.ticker && "bg-accent-soft/60 hover:bg-accent-soft/60")}>
              <TD>
                <Link href={routes(d, p.ticker).company} className="font-semibold text-fg hover:text-accent">
                  {p.ticker}
                </Link>
                <span className="ml-2 hidden text-muted md:inline">{p.name}</span>
              </TD>
              <TD className="num text-right">{fmtMoneyM(p.marketCap)}</TD>
              <TD className="num text-right">{fmtX(p.multiples.evToSales)}</TD>
              <TD className="num text-right">{fmtX(p.multiples.evToEbitda)}</TD>
              <TD className="num text-right">{fmtX(p.multiples.pe)}</TD>
              <TD className="num text-right">{fmtPct(p.multiples.fcfYield)}</TD>
              <TD className="num text-right">{p.health.total}</TD>
            </TR>
          ))}
          <TR className="border-t-2 border-line-strong font-semibold">
            <TD className="text-muted">Peer median (ex. {c.ticker})</TD>
            <TD />
            <TD className="num text-right">{fmtX(med.evToSales)}</TD>
            <TD className="num text-right">{fmtX(med.evToEbitda)}</TD>
            <TD className="num text-right">{fmtX(med.pe)}</TD>
            <TD className="num text-right">{fmtPct(med.fcfYield)}</TD>
            <TD />
          </TR>
        </TBody>
      </Table>
      <p className="mt-2 text-[11px] text-muted">Preview peer set = all other illustrative issuers. Phase 5 selects peers by industry classification and size.</p>
    </div>
  );
}

export function PriceTag({ c, className }: { c: Company; className?: string }) {
  return (
    <div className={cn("flex items-baseline gap-2", className)}>
      <span className="num text-2xl font-semibold text-fg">{fmtPrice(c.price)}</span>
      <Delta value={c.change1d} />
      <span className="text-[11px] text-muted">1D · illustrative</span>
    </div>
  );
}
