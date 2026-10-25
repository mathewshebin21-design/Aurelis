"use client";

import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTerminalWatchlist } from "@/hooks/use-local-list";

export function WatchButton({ ticker, className, compact = false }: { ticker: string; className?: string; compact?: boolean }) {
  const w = useTerminalWatchlist();
  const on = w.has(ticker);
  const label = on ? `Remove ${ticker} from watchlist` : `Add ${ticker} to watchlist`;
  if (compact) {
    return (
      <button type="button" onClick={() => w.toggle(ticker)} aria-pressed={on} aria-label={label} title="Saved on this device only">
        <Star className={cn("size-3.5 text-muted", on && "fill-accent text-accent")} />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => w.toggle(ticker)}
      aria-pressed={on}
      aria-label={label}
      title="Saved on this device only"
      className={cn("inline-flex items-center gap-1.5 rounded-[var(--radius)] border border-line-strong px-2.5 py-1 text-xs font-medium text-fg-2 transition-colors hover:bg-panel-2", className)}
    >
      <Star className={cn("size-3.5", on && "fill-accent text-accent")} />
      {on ? "Watching" : "Watch"}
    </button>
  );
}
