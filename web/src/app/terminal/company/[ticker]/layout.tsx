import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { getCompany, getFreshness, isValidRef } from "@/lib/terminal/data";
import { CompanyTabs } from "@/components/terminal/company-tabs";
import { FreshnessChip } from "@/components/terminal/freshness-chip";
import { Unavailable } from "@/components/terminal/panel";
import { WatchButton } from "@/components/terminal/watch-button";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fye = (mmdd: string | null | undefined) =>
  mmdd && /^\d{4}$/.test(mmdd) ? `FY ends ${MONTHS[Number(mmdd.slice(0, 2)) - 1] ?? mmdd.slice(0, 2)} ${Number(mmdd.slice(2))}` : "Fiscal year end not reported";

export default async function CompanyLayout({ children, params }: LayoutProps<"/terminal/company/[ticker]">) {
  const { ticker: raw } = await params;
  const ref = decodeURIComponent(raw);
  if (!isValidRef(ref)) notFound();
  const [co, fr] = await Promise.all([getCompany(ref), getFreshness(ref)]);
  if (!co.ok && co.status === 404) notFound();
  if (!co.ok) {
    return <Unavailable tone="neg" title={`Could not load ${ref.toUpperCase()}`}>{co.detail}</Unavailable>;
  }
  const c = co.data;
  const current = c.tickers.filter((t) => t.is_current);
  const ticker = current[0]?.ticker ?? ref.toUpperCase();
  const exchange = current[0]?.exchange;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="num grid size-11 shrink-0 place-items-center rounded-[var(--radius)] border border-line bg-panel text-[13px] font-semibold">{ticker.slice(0, 2)}</div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight text-fg">{c.name}</h1>
              <span className="num text-[13px] text-muted" title={current.map((t) => t.ticker).join(", ")}>
                {ticker}
                {current.length > 1 && <span className="ml-1 text-[11px]">+{current.length - 1} listed securities</span>}
              </span>
              {c.last_ingested_at ? <Badge variant="fact">SEC filings</Badge> : <Badge>Not ingested</Badge>}
            </div>
            <div className="mt-0.5 text-[12.5px] text-muted">
              {[exchange, c.sic_description ?? "Industry not reported", fye(c.fiscal_year_end), c.reporting_currency ? `Reports in ${c.reporting_currency}` : null, `CIK ${c.cik}`]
                .filter(Boolean)
                .join(" · ")}
            </div>
            <div className="mt-2">{fr.ok ? <FreshnessChip f={fr.data} /> : <span className="text-[11.5px] text-warn">Freshness unavailable: {fr.detail}</span>}</div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="rounded-[var(--radius)] border border-dashed border-line-strong px-3 py-1.5 text-right" data-testid="market-data-note">
            <div className="text-[10.5px] font-medium uppercase tracking-wider text-muted">Market data</div>
            <div className="text-[12px] text-fg-2">No licensed price feed · valuation uses your inputs</div>
          </div>
          <WatchButton ticker={ticker} />
        </div>
      </div>
      <CompanyTabs ticker={ticker} className="mb-4" />
      {c.last_ingested_at ? (
        children
      ) : (
        <Unavailable tone="warn" title={`Filings for ${c.name} have not been ingested`}>
          This company is listed in the SEC index, but its financial statements have not been loaded, so no figures are shown. Loading filings is an administrator action
          (<code className="num">aurelis-api ingest {ticker}</code>).
        </Unavailable>
      )}
    </div>
  );
}
