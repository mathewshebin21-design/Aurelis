"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { useTerminalWatchlist } from "@/hooks/use-local-list";
import { companyRoutes, WORKSPACE } from "@/lib/terminal/routes";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Unavailable } from "./panel";

export function WatchlistView() {
  const w = useTerminalWatchlist();
  if (w.list.length === 0) {
    return (
      <div className="p-6">
        <Unavailable title="Your watchlist is empty">
          Star companies in <Link href={WORKSPACE.search} className="text-accent hover:underline">company search</Link>. The list is saved in this browser only.
        </Unavailable>
      </div>
    );
  }
  return (
    <Table aria-label="Watchlist">
      <THead>
        <TR className="hover:bg-transparent">
          <TH>Ticker</TH>
          <TH className="text-right">Remove</TH>
        </TR>
      </THead>
      <TBody>
        {w.list.map((t) => (
          <TR key={t}>
            <TD>
              <Link href={companyRoutes(t).overview} className="num font-semibold text-fg hover:text-accent">{t}</Link>
            </TD>
            <TD className="text-right">
              <button type="button" onClick={() => w.remove(t)} aria-label={`Remove ${t} from watchlist`} className="text-muted hover:text-neg">
                <X className="ml-auto size-4" />
              </button>
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
