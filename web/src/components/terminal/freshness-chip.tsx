import { cn } from "@/lib/utils";
import type { Schemas } from "@/lib/api/client";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type F = Schemas["FreshnessOut"];

const STATUS: Record<string, { label: string; tone: string }> = {
  current: { label: "Filings current", tone: "border-pos/40 bg-pos/10 text-pos" },
  filing_expected: { label: "Newer filing expected", tone: "border-warn/50 bg-warn/10 text-warn" },
  no_data: { label: "No periods stored", tone: "border-line-strong bg-panel-2 text-fg-2" },
};

/** Filing freshness from the API: whether a newer 10-Q/10-K should exist, and when SEC was last checked. */
export function FreshnessChip({ f }: { f: F }) {
  const s = STATUS[f.status] ?? { label: f.status, tone: "border-line-strong bg-panel-2 text-fg-2" };
  const syncNote = f.sync_status === "stale" ? "SEC sync stale" : f.sync_status === "never_checked" ? "Never checked against SEC" : null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <span data-testid="freshness" className={cn("num inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", s.tone)}>
            <span className="size-1.5 rounded-full bg-current" />
            {s.label}
            {f.latest_period_end && <span className="font-normal opacity-80">· through {f.latest_period_end}</span>}
          </span>
        </TooltipTrigger>
        <TooltipContent>{f.explanation}</TooltipContent>
      </Tooltip>
      {syncNote && <span className="num rounded-full border border-warn/50 bg-warn/10 px-2 py-0.5 text-[11px] text-warn">{syncNote}</span>}
    </span>
  );
}
