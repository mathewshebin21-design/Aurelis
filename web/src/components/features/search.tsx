"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CornerDownLeft, Search, Star, Trash2 } from "lucide-react";
import { motion } from "motion/react";
import { cn, fmtMoneyM, fmtPct, fmtPrice, fmtX } from "@/lib/utils";
import { COMPANY_DATA, type Company } from "@/lib/data/build";
import { routes, type DesignId } from "@/lib/designs";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Sparkline } from "@/components/charts/charts";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useWatchlist } from "@/hooks/use-watchlist";
import { Delta } from "./common";

export function searchCompanies(q: string): Company[] {
  const s = q.trim().toLowerCase();
  if (!s) return COMPANY_DATA;
  return COMPANY_DATA.map((c) => {
    const t = c.ticker.toLowerCase();
    const n = c.name.toLowerCase();
    const score = t === s ? 100 : t.startsWith(s) ? 80 : n.startsWith(s) ? 60 : n.includes(s) ? 40 : `${c.sector} ${c.industry}`.toLowerCase().includes(s) ? 20 : 0;
    return { c, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.c);
}

/** ⌘K / Ctrl-K command palette shared by all three designs. */
export function CommandSearch({ d, open, onOpenChange }: { d: DesignId; open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [i, setI] = React.useState(0);
  const results = searchCompanies(q).slice(0, 8);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const go = (c: Company) => {
    onOpenChange(false);
    setQ("");
    router.push(routes(d, c.ticker).company);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle className="sr-only">Search companies</DialogTitle>
        <DialogDescription className="sr-only">Type a ticker, company name or sector</DialogDescription>
        <div className="flex items-center gap-2 border-b border-line px-3">
          <Search className="size-4 text-muted" />
          <input
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setI(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setI((x) => Math.min(results.length - 1, x + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setI((x) => Math.max(0, x - 1));
              } else if (e.key === "Enter" && results[i]) go(results[i]);
            }}
            placeholder="Ticker, company or sector…"
            className="h-12 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-muted"
            aria-label="Search companies"
          />
          <kbd className="rounded border border-line px-1.5 text-[10px] text-muted">ESC</kbd>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-1.5" role="listbox">
          {results.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">No illustrative company matches “{q}”.</li>}
          {results.map((c, k) => (
            <li key={c.ticker} role="option" aria-selected={k === i}>
              <button
                type="button"
                onMouseEnter={() => setI(k)}
                onClick={() => go(c)}
                className={cn("flex w-full items-center gap-3 rounded-[var(--radius)] px-3 py-2 text-left", k === i && "bg-panel-2")}
              >
                <span className="num w-12 text-[13px] font-semibold text-fg">{c.ticker}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-fg">{c.name}</span>
                  <span className="block truncate text-[11px] text-muted">{c.industry}</span>
                </span>
                <span className="num text-[12px] text-fg">{fmtPrice(c.price)}</span>
                {k === i && <CornerDownLeft className="size-3.5 text-muted" />}
              </button>
            </li>
          ))}
        </ul>
        <div className="border-t border-line px-3 py-2 text-[11px] text-muted">Illustrative universe · 8 fictional issuers. Phase 2 searches the full SEC company index.</div>
      </DialogContent>
    </Dialog>
  );
}

export function SearchView({ d, variant }: { d: DesignId; variant: "a" | "b" | "c" }) {
  const [q, setQ] = React.useState("");
  const [sector, setSector] = React.useState<string | null>(null);
  const sectors = [...new Set(COMPANY_DATA.map((c) => c.sector))];
  const results = searchCompanies(q).filter((c) => !sector || c.sector === sector);
  const w = useWatchlist();

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by ticker, company name, sector or industry"
          className={cn("pl-9", variant === "b" ? "h-14 font-display text-xl" : "h-11 text-[15px]")}
          aria-label="Search companies"
        />
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by sector">
        {[null, ...sectors].map((s) => (
          <button
            key={s ?? "all"}
            type="button"
            onClick={() => setSector(s)}
            aria-pressed={sector === s}
            className={cn("rounded-full border border-line px-2.5 py-1 text-[12px] text-fg-2 transition-colors hover:border-line-strong", sector === s && "border-accent bg-accent-soft text-accent")}
          >
            {s ?? "All sectors"}
          </button>
        ))}
      </div>
      <div className="rounded-[var(--radius)] border border-line bg-panel">
        <Table>
          <THead>
            <TR className="hover:bg-transparent">
              <TH className="w-8" />
              <TH>Company</TH>
              <TH className="hidden md:table-cell">Industry</TH>
              <TH className="text-right">Price</TH>
              <TH className="text-right">1Y</TH>
              <TH className="hidden w-28 sm:table-cell">1Y trend</TH>
              <TH className="text-right">Mkt cap</TH>
              <TH className="hidden text-right lg:table-cell">EV/EBITDA</TH>
              <TH className="text-right">Health</TH>
            </TR>
          </THead>
          <TBody>
            {results.map((c, k) => (
              <motion.tr
                key={c.ticker}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: k * 0.02 }}
                className="border-b border-line/70 hover:bg-panel-2/60"
              >
                <TD>
                  <button type="button" onClick={() => w.toggle(c.ticker)} aria-label={`Toggle ${c.ticker} in watchlist`} aria-pressed={w.has(c.ticker)}>
                    <Star className={cn("size-3.5 text-muted", w.has(c.ticker) && "fill-accent text-accent")} />
                  </button>
                </TD>
                <TD>
                  <Link href={routes(d, c.ticker).company} className="group">
                    <span className="num font-semibold text-fg group-hover:text-accent">{c.ticker}</span>
                    <span className="ml-2 text-fg-2">{c.name}</span>
                  </Link>
                </TD>
                <TD className="hidden text-muted md:table-cell">{c.industry}</TD>
                <TD className="num text-right">{fmtPrice(c.price)}</TD>
                <TD className="text-right"><Delta value={c.change1y} digits={1} /></TD>
                <TD className="hidden sm:table-cell"><Sparkline values={c.prices.map((p) => p.close)} height={22} /></TD>
                <TD className="num text-right">{fmtMoneyM(c.marketCap)}</TD>
                <TD className="num hidden text-right lg:table-cell">{fmtX(c.multiples.evToEbitda)}</TD>
                <TD className="num text-right">{c.health.total}</TD>
              </motion.tr>
            ))}
          </TBody>
        </Table>
        {results.length === 0 && <p className="p-8 text-center text-sm text-muted">No matches in the illustrative universe.</p>}
      </div>
    </div>
  );
}

export function WatchlistView({ d, variant }: { d: DesignId; variant: "a" | "b" | "c" }) {
  const w = useWatchlist();
  const rows = w.list.map((t) => COMPANY_DATA.find((c) => c.ticker === t)).filter((c): c is Company => !!c);
  const available = COMPANY_DATA.filter((c) => !w.has(c.ticker));

  return (
    <div className="space-y-4">
      {variant !== "a" && rows.length > 0 && (
        <div className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3", variant === "b" && "gap-5")}>
          {rows.slice(0, 3).map((c) => (
            <Link key={c.ticker} href={routes(d, c.ticker).company} className="group rounded-[var(--radius)] border border-line bg-panel p-4 transition-colors hover:border-line-strong">
              <div className="flex items-baseline justify-between">
                <span className={cn("num font-semibold text-fg", variant === "b" && "font-display text-xl font-medium")}>{c.ticker}</span>
                <Delta value={c.change1y} digits={1} />
              </div>
              <div className="truncate text-[12px] text-muted">{c.name}</div>
              <Sparkline values={c.prices.map((p) => p.close)} className="mt-3" height={36} />
              <div className="mt-2 flex justify-between text-[12px]">
                <span className="num text-fg">{fmtPrice(c.price)}</span>
                <span className="text-muted">Health {c.health.total}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
      <div className="rounded-[var(--radius)] border border-line bg-panel">
        <Table>
          <THead>
            <TR className="hover:bg-transparent">
              <TH>Ticker</TH>
              <TH className="text-right">Price</TH>
              <TH className="text-right">1D</TH>
              <TH className="text-right">1Y</TH>
              <TH className="hidden text-right md:table-cell">P/E</TH>
              <TH className="hidden text-right md:table-cell">FCF yld</TH>
              <TH className="hidden text-right sm:table-cell">Op. margin</TH>
              <TH className="text-right">Health</TH>
              <TH className="w-8" />
            </TR>
          </THead>
          <TBody>
            {rows.map((c) => (
              <TR key={c.ticker}>
                <TD>
                  <Link href={routes(d, c.ticker).company} className="num font-semibold text-fg hover:text-accent">{c.ticker}</Link>
                  <span className="ml-2 hidden text-muted sm:inline">{c.name}</span>
                </TD>
                <TD className="num text-right">{fmtPrice(c.price)}</TD>
                <TD className="text-right"><Delta value={c.change1d} /></TD>
                <TD className="text-right"><Delta value={c.change1y} digits={1} /></TD>
                <TD className="num hidden text-right md:table-cell">{fmtX(c.multiples.pe)}</TD>
                <TD className="num hidden text-right md:table-cell">{fmtPct(c.multiples.fcfYield)}</TD>
                <TD className="num hidden text-right sm:table-cell">{fmtPct(c.metrics.at(-1)!.operatingMargin)}</TD>
                <TD className="num text-right">{c.health.total}</TD>
                <TD>
                  <button type="button" onClick={() => w.remove(c.ticker)} aria-label={`Remove ${c.ticker}`} className="text-muted hover:text-neg">
                    <Trash2 className="size-3.5" />
                  </button>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
        {rows.length === 0 && <p className="p-8 text-center text-sm text-muted">Your watchlist is empty.</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] text-muted">Add:</span>
        {available.map((c) => (
          <Button key={c.ticker} variant="outline" size="sm" onClick={() => w.toggle(c.ticker)}>
            + {c.ticker}
          </Button>
        ))}
        <Button variant="ghost" size="sm" onClick={w.reset} className="ml-auto">Reset</Button>
      </div>
      <p className="text-[11px] text-muted">Preview watchlist is stored in this browser only. Phase 5 persists watchlists per authenticated workspace.</p>
    </div>
  );
}
