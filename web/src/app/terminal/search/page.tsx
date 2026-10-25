import type { Metadata } from "next";
import Link from "next/link";
import { api } from "@/lib/api/server";
import { companyRoutes } from "@/lib/terminal/routes";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PageTitle, Panel, Unavailable } from "@/components/terminal/panel";
import { SearchBox } from "@/components/terminal/search-box";
import { WatchButton } from "@/components/terminal/watch-button";

export const metadata: Metadata = { title: "Company search" };

const fmtDate = (iso: string | null | undefined) => (iso ? new Date(iso).toISOString().slice(0, 10) : "—");

export default async function SearchPage({ searchParams }: PageProps<"/terminal/search">) {
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim().slice(0, 64) ?? "";
  const [coverage, results] = await Promise.all([
    api.get("/v1/coverage"),
    q ? api.get("/v1/companies", { query: { q, limit: 25 } }) : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-4">
      <PageTitle
        eyebrow="Workspace · S-01"
        title="Company search"
        desc="Search every SEC registrant. Companies whose filings have been ingested open with statements, metrics and valuation; others are listed so you know they exist, without invented figures."
      />
      <SearchBox initial={q} />

      {results && (
        <Panel title={`Results for “${q}”`} code="S-02" contentClassName="p-0">
          {!results.ok ? (
            <div className="p-4"><Unavailable tone="neg" title="Search failed">{results.detail}</Unavailable></div>
          ) : results.data.length === 0 ? (
            <div className="p-6"><Unavailable title={`No SEC registrant matches “${q}”`}>Try a ticker (AAPL), a name (Apple) or a CIK (320193).</Unavailable></div>
          ) : (
            <Table aria-label="Search results">
              <THead>
                <TR className="hover:bg-transparent">
                  <TH className="w-8" />
                  <TH>Company</TH>
                  <TH className="hidden sm:table-cell">CIK</TH>
                  <TH>Data</TH>
                  <TH className="hidden text-right md:table-cell">Last ingested</TH>
                </TR>
              </THead>
              <TBody>
                {results.data.map((h) => {
                  const t = h.tickers[0] ?? String(h.cik);
                  return (
                    <TR key={h.cik}>
                      <TD><WatchButton ticker={t} compact /></TD>
                      <TD className="max-w-[16rem] truncate sm:max-w-none">
                        <Link href={companyRoutes(t).overview} className="group">
                          <span className="num font-semibold text-fg group-hover:text-accent">{h.tickers.join(" · ") || "—"}</span>
                          <span className="ml-2 text-fg-2">{h.name}</span>
                        </Link>
                      </TD>
                      <TD className="num hidden text-muted sm:table-cell">{h.cik}</TD>
                      <TD>{h.has_data ? <Badge variant="fact">Statements</Badge> : <Badge>Not ingested</Badge>}</TD>
                      <TD className="num hidden text-right text-muted md:table-cell">{fmtDate(h.last_ingested_at)}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </Panel>
      )}

      <Panel title="Coverage · companies with ingested filings" code="S-03" contentClassName="p-0">
        {!coverage.ok ? (
          <div className="p-4"><Unavailable tone="neg" title="Coverage could not be loaded">{coverage.detail}</Unavailable></div>
        ) : coverage.data.length === 0 ? (
          <div className="p-6"><Unavailable title="No companies have been ingested yet">An administrator loads SEC filings with <code className="num">aurelis-api ingest TICKER</code>.</Unavailable></div>
        ) : (
          <Table aria-label="Covered companies">
            <THead>
              <TR className="hover:bg-transparent">
                <TH className="w-8" />
                <TH>Company</TH>
                <TH className="hidden md:table-cell">Industry (SIC)</TH>
                <TH className="hidden sm:table-cell">Currency</TH>
                <TH className="text-right">Last ingested</TH>
              </TR>
            </THead>
            <TBody>
              {coverage.data.map((c) => {
                const t = c.tickers[0] ?? String(c.cik);
                return (
                  <TR key={c.cik}>
                    <TD><WatchButton ticker={t} compact /></TD>
                    <TD className="max-w-[14rem] truncate sm:max-w-none">
                      <Link href={companyRoutes(t).overview} className="group">
                        <span className="num font-semibold text-fg group-hover:text-accent">{t}</span>
                        <span className="ml-2 text-fg-2">{c.name}</span>
                      </Link>
                    </TD>
                    <TD className="hidden text-muted md:table-cell">{c.sic_description ?? "Not reported"}</TD>
                    <TD className="num hidden text-muted sm:table-cell">{c.reporting_currency ?? "—"}</TD>
                    <TD className="num text-right text-muted">{fmtDate(c.last_ingested_at)}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Panel>
    </div>
  );
}
