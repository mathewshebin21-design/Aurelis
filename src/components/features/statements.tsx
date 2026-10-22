"use client";

import * as React from "react";
import { Database } from "lucide-react";
import { cn, fmtNum, fmtPct, fmtX } from "@/lib/utils";
import { XBRL_TAGS, type Company, type MetricRow, type Statement } from "@/lib/data/build";
import { BarChart, LegendRow } from "@/components/charts/charts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

type Line = { key: keyof Statement; label: string; indent?: boolean; strong?: boolean; perShare?: boolean; negate?: boolean };

const INCOME: Line[] = [
  { key: "revenue", label: "Revenue", strong: true },
  { key: "costOfRevenue", label: "Cost of revenue", indent: true, negate: true },
  { key: "grossProfit", label: "Gross profit", strong: true },
  { key: "rnd", label: "Research & development", indent: true, negate: true },
  { key: "sga", label: "Selling, general & admin.", indent: true, negate: true },
  { key: "ebit", label: "Operating income (EBIT)", strong: true },
  { key: "da", label: "Depreciation & amortisation", indent: true },
  { key: "ebitda", label: "EBITDA (derived)", strong: true },
  { key: "interestExpense", label: "Interest expense", indent: true, negate: true },
  { key: "pretaxIncome", label: "Pre-tax income" },
  { key: "incomeTax", label: "Income tax", indent: true, negate: true },
  { key: "netIncome", label: "Net income", strong: true },
  { key: "dilutedShares", label: "Diluted shares (m)" },
  { key: "eps", label: "Diluted EPS ($)", perShare: true },
];

const BALANCE: Line[] = [
  { key: "cash", label: "Cash & equivalents", indent: true },
  { key: "receivables", label: "Receivables", indent: true },
  { key: "inventory", label: "Inventory", indent: true },
  { key: "otherCurrentAssets", label: "Other current assets", indent: true },
  { key: "currentAssets", label: "Total current assets", strong: true },
  { key: "ppe", label: "PP&E, net", indent: true },
  { key: "intangibles", label: "Goodwill & intangibles", indent: true },
  { key: "totalAssets", label: "Total assets", strong: true },
  { key: "payables", label: "Accounts payable", indent: true },
  { key: "accruedLiabilities", label: "Accrued liabilities", indent: true },
  { key: "currentLiabilities", label: "Total current liabilities", strong: true },
  { key: "totalDebt", label: "Total debt", indent: true },
  { key: "otherLiabilities", label: "Other non-current liabilities", indent: true },
  { key: "totalLiabilities", label: "Total liabilities", strong: true },
  { key: "equity", label: "Shareholders' equity", strong: true },
];

const CASHFLOW: Line[] = [
  { key: "netIncome", label: "Net income", indent: true },
  { key: "operatingCashFlow", label: "Cash from operations", strong: true },
  { key: "capex", label: "Capital expenditure", indent: true, negate: true },
  { key: "freeCashFlow", label: "Free cash flow (derived)", strong: true },
  { key: "dividends", label: "Dividends paid", indent: true, negate: true },
  { key: "buybacks", label: "Share repurchases", indent: true, negate: true },
  { key: "netDebtIssued", label: "Net debt issued / (repaid)", indent: true },
  { key: "netChangeInCash", label: "Net change in cash", strong: true },
];

type MLine = { key: keyof MetricRow; label: string; kind: "pct" | "x" };
const RATIOS: { group: string; rows: MLine[] }[] = [
  {
    group: "Growth & margins",
    rows: [
      { key: "revenueGrowth", label: "Revenue growth", kind: "pct" },
      { key: "grossMargin", label: "Gross margin", kind: "pct" },
      { key: "operatingMargin", label: "Operating margin", kind: "pct" },
      { key: "ebitdaMargin", label: "EBITDA margin", kind: "pct" },
      { key: "netMargin", label: "Net margin", kind: "pct" },
      { key: "fcfMargin", label: "FCF margin", kind: "pct" },
    ],
  },
  { group: "Returns", rows: [{ key: "roe", label: "Return on equity", kind: "pct" }, { key: "roic", label: "Return on invested capital", kind: "pct" }] },
  { group: "Liquidity", rows: [{ key: "currentRatio", label: "Current ratio", kind: "x" }, { key: "quickRatio", label: "Quick ratio", kind: "x" }] },
  {
    group: "Leverage & coverage",
    rows: [
      { key: "debtToEquity", label: "Debt / equity", kind: "x" },
      { key: "debtToEbitda", label: "Debt / EBITDA", kind: "x" },
      { key: "netDebtToEbitda", label: "Net debt / EBITDA", kind: "x" },
      { key: "interestCoverage", label: "Interest coverage", kind: "x" },
    ],
  },
];

function StatementTable({ c, lines, common, sources }: { c: Company; lines: Line[]; common: boolean; sources: boolean }) {
  const st = c.statements;
  return (
    <Table>
      <THead>
        <TR className="hover:bg-transparent">
          <TH className="sticky left-0 z-[1] min-w-[200px] bg-panel">USD millions · FY ends Dec</TH>
          {st.map((s) => (
            <TH key={s.fy} className="text-right">FY{s.fy}</TH>
          ))}
          {sources && <TH>Source concept (Phase 2 mapping)</TH>}
        </TR>
      </THead>
      <TBody>
        {lines.map((l) => (
          <TR key={l.key} className={cn(l.strong && "font-semibold")}>
            <TD className={cn("sticky left-0 z-[1] bg-panel", l.indent && "pl-7 text-fg-2")}>{l.label}</TD>
            {st.map((s) => {
              const raw = s[l.key] as number;
              const v = l.negate ? -raw : raw;
              const shown = common && !l.perShare && l.key !== "dilutedShares" ? fmtPct(raw / s.revenue, 1) : fmtNum(v, l.perShare ? 2 : 0, true);
              return (
                <TD key={s.fy} className={cn("num text-right", v < 0 && "text-fg-2")}>
                  {shown}
                </TD>
              );
            })}
            {sources && (
              <TD className="text-[11px] text-muted">
                <code>{XBRL_TAGS[l.key] ?? "derived"}</code>
              </TD>
            )}
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

export function StatementsView({ c, className }: { c: Company; className?: string }) {
  const [common, setCommon] = React.useState(false);
  const [sources, setSources] = React.useState(false);
  const years = c.statements.map((s) => `FY${String(s.fy).slice(2)}`);
  const chartSeries = [
    { id: "rev", label: "Revenue", color: "var(--s1)", values: c.statements.map((s) => s.revenue) },
    { id: "ebit", label: "EBIT", color: "var(--s2)", values: c.statements.map((s) => s.ebit) },
    { id: "fcf", label: "Free cash flow", color: "var(--s3)", values: c.statements.map((s) => s.freeCashFlow) },
  ];
  return (
    <div className={className}>
      <div className="mb-4">
        <LegendRow series={chartSeries} className="mb-2" />
        <BarChart series={chartSeries} categories={years} height={200} formatY={(v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}B` : `${v.toFixed(0)}M`)} />
      </div>
      <Tabs defaultValue="is">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <TabsList>
            <TabsTrigger value="is">Income</TabsTrigger>
            <TabsTrigger value="bs">Balance sheet</TabsTrigger>
            <TabsTrigger value="cf">Cash flow</TabsTrigger>
            <TabsTrigger value="ratios">Ratios</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-3 pb-1.5 text-[12px] text-fg-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5">
              <input type="checkbox" checked={common} onChange={(e) => setCommon(e.target.checked)} className="accent-[var(--accent)]" />
              % of revenue
            </label>
            <label className="inline-flex cursor-pointer items-center gap-1.5">
              <input type="checkbox" checked={sources} onChange={(e) => setSources(e.target.checked)} className="accent-[var(--accent)]" />
              Source tags
            </label>
          </div>
        </div>
        <TabsContent value="is"><StatementTable c={c} lines={INCOME} common={common} sources={sources} /></TabsContent>
        <TabsContent value="bs"><StatementTable c={c} lines={BALANCE} common={common} sources={sources} /></TabsContent>
        <TabsContent value="cf"><StatementTable c={c} lines={CASHFLOW} common={common} sources={sources} /></TabsContent>
        <TabsContent value="ratios">
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH className="min-w-[200px]">Ratio (computed)</TH>
                {c.metrics.map((m) => (
                  <TH key={m.fy} className="text-right">FY{m.fy}</TH>
                ))}
              </TR>
            </THead>
            <TBody>
              {RATIOS.map((g) => (
                <React.Fragment key={g.group}>
                  <TR className="hover:bg-transparent">
                    <TD colSpan={6} className="pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted">{g.group}</TD>
                  </TR>
                  {g.rows.map((r) => (
                    <TR key={r.key}>
                      <TD className="pl-5 text-fg-2">{r.label}</TD>
                      {c.metrics.map((m) => {
                        const v = m[r.key] as number | null;
                        return <TD key={m.fy} className="num text-right">{r.kind === "pct" ? fmtPct(v) : fmtX(v, 2)}</TD>;
                      })}
                    </TR>
                  ))}
                </React.Fragment>
              ))}
            </TBody>
          </Table>
        </TabsContent>
      </Tabs>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-[11.5px] text-muted">
        <Database className="size-3.5" aria-hidden />
        <Badge variant="demo">Demo provenance</Badge>
        Generated illustrative statements · balance sheet balances and cash flow reconciles (verified by tests). In Phase 2 every cell links to its EDGAR filing, XBRL fact and accession number. “n/m” = not meaningful.
      </div>
    </div>
  );
}
