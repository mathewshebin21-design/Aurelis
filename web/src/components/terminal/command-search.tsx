"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { browserApi } from "@/lib/api/browser";
import type { Schemas } from "@/lib/api/client";
import { companyRoutes, WORKSPACE } from "@/lib/terminal/routes";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

type Hit = Schemas["IssuerSearchHit"];

/** Debounced, abortable issuer search against the SEC company index held by the API. */
export function useIssuerSearch(q: string, limit = 8) {
  const [state, setState] = React.useState<{ q: string; hits: Hit[]; error: string | null; loading: boolean }>({ q: "", hits: [], error: null, loading: false });
  React.useEffect(() => {
    const term = q.trim();
    if (!term) return;
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setState((s) => ({ ...s, loading: true }));
      try {
        const r = await browserApi.get("/v1/companies", { query: { q: term, limit }, init: { signal: ctl.signal } });
        setState(r.ok ? { q: term, hits: r.data, error: null, loading: false } : { q: term, hits: [], error: r.detail, loading: false });
      } catch {
        /* superseded by a newer keystroke */
      }
    }, 180);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q, limit]);
  return q.trim() ? state : { q: "", hits: [] as Hit[], error: null, loading: false };
}

export function TerminalCommandSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [i, setI] = React.useState(0);
  const { hits, error, loading } = useIssuerSearch(q);

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

  const go = (h: Hit) => {
    onOpenChange(false);
    setQ("");
    router.push(companyRoutes(h.tickers[0] ?? String(h.cik)).overview);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle className="sr-only">Search issuers</DialogTitle>
        <DialogDescription className="sr-only">Type a ticker, company name or CIK</DialogDescription>
        <div className="flex items-center gap-2 border-b border-line px-3">
          {loading ? <Loader2 className="size-4 animate-spin text-muted" /> : <Search className="size-4 text-muted" />}
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
                setI((x) => Math.min(hits.length - 1, x + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setI((x) => Math.max(0, x - 1));
              } else if (e.key === "Enter") {
                if (hits[i]) go(hits[i]);
                else if (q.trim()) {
                  onOpenChange(false);
                  router.push(`${WORKSPACE.search}?q=${encodeURIComponent(q.trim())}`);
                }
              }
            }}
            placeholder="Ticker, company name or CIK…"
            className="h-12 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-muted"
            aria-label="Search issuers"
          />
          <kbd className="rounded border border-line px-1.5 text-[10px] text-muted">ESC</kbd>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-1.5" role="listbox" aria-label="Matching issuers">
          {error && <li className="px-3 py-6 text-center text-sm text-neg">{error}</li>}
          {!error && q.trim() && !loading && hits.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">No SEC registrant matches “{q}”.</li>}
          {hits.map((h, k) => (
            <li key={h.cik} role="option" aria-selected={k === i}>
              <button
                type="button"
                onMouseEnter={() => setI(k)}
                onClick={() => go(h)}
                className={cn("flex w-full items-center gap-3 rounded-[var(--radius)] px-3 py-2 text-left", k === i && "bg-panel-2")}
              >
                <span className="num w-14 text-[13px] font-semibold text-fg">{h.tickers[0] ?? "—"}</span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-fg">{h.name}</span>
                <span className={cn("num text-[10.5px]", h.has_data ? "text-pos" : "text-muted")}>{h.has_data ? "● data" : "○ not ingested"}</span>
                {k === i && <CornerDownLeft className="size-3.5 text-muted" />}
              </button>
            </li>
          ))}
        </ul>
        <div className="border-t border-line px-3 py-2 text-[11px] text-muted">SEC EDGAR company index · ● statements ingested · ○ listed with the SEC, no data loaded yet</div>
      </DialogContent>
    </Dialog>
  );
}
