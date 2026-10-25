import type { Metadata } from "next";
import { Info } from "lucide-react";
import { fmtByUnit, fmtCurrency } from "@/lib/api/format";
import { getCompany, getFreshness, getLatestResearch, getMetrics, getScorecard, getStatement } from "@/lib/terminal/data";
import { caveats, lineFor, metricFor, seriesOrGaps, unavailable, type Metric } from "@/lib/terminal/select";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { HealthCard } from "@/components/terminal/health-card";
import { Panel, Unavailable } from "@/components/terminal/panel";
import { RatioLines, ValueBars } from "@/components/terminal/trend-charts";

export async function generateMetadata({ params }: PageProps<"/terminal/company/[ticker]">): Promise<Metadata> {
  return { title: `${decodeURIComponent((await params).ticker).toUpperCase()} · Overview` };
}

const STRIP: { key: string; label: string }[] = [
  { key: "revenue_growth", label: "Revenue growth" },
  { key: "gross_margin", label: "Gross margin" },
  { key: "operating_margin", label: "Operating margin" },
  { key: "net_margin", label: "Net margin" },
  { key: "fcf_margin", label: "FCF margin" },
  { key: "roic", label: "ROIC" },
  { key: "net_debt_to_ebitda", label: "Net debt / EBITDA" },
  { key: "interest_coverage", label: "Interest coverage" },
];

function MetricStat({ m, label, currency }: { m: Metric | undefined; label: string; currency: string }) {
  const missing = !m || m.value === null || m.value === undefined;
  return (
    <div className="min-w-0" data-testid={`metric-${m?.key ?? label}`}>
      <div className="flex items-center gap-1 text-[10.5px] font-medium uppercase tracking-wider text-muted">
        {label}
        {m && (
          <Tooltip>
            <TooltipTrigger aria-label={`How ${label} is computed`}>
              <Info className="size-3" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <span className="num">{m.formula}</span>
              {m.inputs.map((i) => (
                <span key={i.period + i.line_key} className="num block text-muted">
                  {i.line_key} {i.period}: {i.status}
                </span>
              ))}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      {missing ? (
        <>
          <div className="mt-0.5 text-[13px] font-medium text-muted">Not available</div>
          <div className="mt-0.5 line-clamp-2 text-[11px] text-muted">{m?.reason ?? "Not computed for this period"}</div>
        </>
      ) : (
        <>
          <div className="num mt-0.5 truncate text-[15px] font-semibold text-fg">{fmtByUnit(m.value, m.unit, currency)}</div>
          {m.assumptions.length > 0 && <div className="mt-0.5 text-[11px] text-warn">Caveat: see data quality</div>}
        </>
      )}
    </div>
  );
}

export default async function OverviewPage({ params }: PageProps<"/terminal/company/[ticker]">) {
  const ref = decodeURIComponent((await params).ticker);
  const co = await getCompany(ref);
  if (!co.ok || !co.data.last_ingested_at) return null; // the layout shows the not-ingested / error state
  const currency = co.data.reporting_currency ?? "USD";
  const [metrics, card, income, research, fresh] = await Promise.all([
    getMetrics(ref, 5),
    getScorecard(ref),
    getStatement(ref, "income", "FY", 5),
    getLatestResearch(ref),
    getFreshness(ref),
  ]);

  const periods = metrics.ok ? metrics.data.periods : [];
  const latest = periods.at(-1);
  const ms = metrics.ok ? metrics.data.metrics : [];

  const bars = income.ok
    ? [
        { id: "revenue", label: "Revenue", color: "var(--s1)" },
        { id: "net_income", label: "Net income", color: "var(--s3)" },
      ].map((s) => ({ ...s, r: seriesOrGaps(income.data.periods, (p) => lineFor(income.data.lines, s.id, p)?.value) }))
    : [];
  const lines = [
    { id: "gross_margin", label: "Gross margin", color: "var(--s1)" },
    { id: "operating_margin", label: "Operating margin", color: "var(--s2)" },
    { id: "net_margin", label: "Net margin", color: "var(--s3)" },
  ].map((s) => ({ ...s, r: seriesOrGaps(periods, (p) => metricFor(ms, s.id, p)?.value) }));

  const plottedBars = bars.flatMap((b) => (b.r.ok ? [{ id: b.id, label: b.label, color: b.color, values: b.r.values }] : []));
  const plottedLines = lines.flatMap((l) => (l.r.ok ? [{ id: l.id, label: l.label, color: l.color, values: l.r.values }] : []));
  const gaps = [...bars, ...lines].flatMap((s) => (s.r.ok ? [] : [`${s.label}: not available for ${s.r.missing.join(", ")}`]));

  const notes = latest ? caveats(ms, latest) : [];
  const missing = latest ? unavailable(ms, latest) : [];
  const revenue = latest && income.ok ? lineFor(income.data.lines, "revenue", latest) : undefined;
  const netIncome = latest && income.ok ? lineFor(income.data.lines, "net_income", latest) : undefined;

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <Panel title={`Key metrics · ${latest ?? "no annual period"}`} code="M-01" className="xl:col-span-3">
        {!metrics.ok ? (
          <Unavailable tone="neg" title="Metrics could not be loaded">{metrics.detail}</Unavailable>
        ) : !latest ? (
          <Unavailable title="No annual statements stored for this company" />
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4 xl:grid-cols-10">
            {[["Revenue", revenue], ["Net income", netIncome]].map(([label, l]) => (
              <div key={label as string} className="min-w-0" data-testid={`line-${label}`}>
                <div className="text-[10.5px] font-medium uppercase tracking-wider text-muted">{label as string}</div>
                {l && typeof l === "object" && l.value !== null ? (
                  <div className="num mt-0.5 truncate text-[15px] font-semibold text-fg" title={`${l.provenance.source_form ?? "derived"} ${l.provenance.source_accession ?? ""}`}>
                    {fmtCurrency(l.value, currency)}
                  </div>
                ) : (
                  <div className="mt-0.5 text-[13px] font-medium text-muted">Not reported</div>
                )}
              </div>
            ))}
            {STRIP.map((s) => (
              <MetricStat key={s.key} m={metricFor(ms, s.key, latest)} label={s.label} currency={currency} />
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Revenue and net income" code="F-01" className="xl:col-span-2">
        {!income.ok ? (
          <Unavailable tone="neg" title="Income statement could not be loaded">{income.detail}</Unavailable>
        ) : plottedBars.length ? (
          <ValueBars series={plottedBars} categories={income.data.periods} currency={currency} />
        ) : (
          <Unavailable title="Not enough reported values to chart" />
        )}
      </Panel>

      <Panel title="Health score" code="H-01" className="xl:row-span-2">
        {card.ok ? (
          <HealthCard card={card.data} />
        ) : (
          <Unavailable tone={card.status === 409 ? "muted" : "neg"} title="Health score unavailable">{card.detail}</Unavailable>
        )}
      </Panel>

      <Panel title="Margin trend" code="F-02" className="xl:col-span-2">
        {plottedLines.length ? <RatioLines series={plottedLines} xLabels={periods} /> : <Unavailable title="Margins are not computable for this company" />}
      </Panel>

      <Panel title="Data quality and limitations" code="D-01" className="xl:col-span-2">
        <ul className="space-y-2 text-[12.5px] text-fg-2" data-testid="data-quality">
          {fresh.ok && (
            <li>
              <span className="font-medium text-fg">Freshness.</span> {fresh.data.explanation}
              {fresh.data.sync_status !== "fresh" && <span className="text-warn"> · SEC sync status: {fresh.data.sync_status.replace("_", " ")}</span>}
            </li>
          )}
          {gaps.map((g) => (
            <li key={g}><span className="font-medium text-fg">Chart gap.</span> {g}; it is not plotted as zero.</li>
          ))}
          {notes.map((n) => (
            <li key={n} className="text-warn"><span className="font-medium">Caveat.</span> {n}</li>
          ))}
          {missing.length > 0 && (
            <li>
              <details>
                <summary className="cursor-pointer">
                  <span className="font-medium text-fg">{missing.length} metric{missing.length > 1 ? "s" : ""} not available</span> for {latest} ({missing.map((m) => m.label).slice(0, 3).join(", ")}
                  {missing.length > 3 ? ", …" : ""})
                </summary>
                <ul className="mt-1.5 space-y-1 pl-4">
                  {missing.map((m) => (
                    <li key={m.label}><span className="font-medium text-fg">{m.label}:</span> {m.reason}.</li>
                  ))}
                </ul>
              </details>
            </li>
          )}
          <li><span className="font-medium text-fg">Market data.</span> No licensed price feed: market capitalisation, price and beta are not shown; valuation tools take them as your labelled assumptions.</li>
          {!gaps.length && !notes.length && !missing.length && <li>No data-quality caveats on the latest annual period.</li>}
        </ul>
      </Panel>

      <Panel title="AI research" code="R-01" className="xl:col-span-3">
        {research.ok ? (
          <div className="flex flex-wrap items-center gap-3 text-[12.5px] text-fg-2">
            <Badge variant="interpretation">Verified research</Badge>
            <span>{research.data.claims.length} published claims · {research.data.rejected_hidden} rejected by the verifier · {research.data.model}</span>
          </div>
        ) : research.status === 404 ? (
          <Unavailable title="No AI research has been generated for this company">
            Research runs use a paid model and are only generated with approval. Nothing here is AI-written.
          </Unavailable>
        ) : (
          <Unavailable tone="neg" title="Research could not be loaded">{research.detail}</Unavailable>
        )}
      </Panel>
    </div>
  );
}
