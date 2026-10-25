import type { Metadata } from "next";
import { PageTitle, Panel } from "@/components/terminal/panel";
import { WatchlistView } from "@/components/terminal/watchlist-view";

export const metadata: Metadata = { title: "Watchlist" };

export default function WatchlistPage() {
  return (
    <div className="space-y-4">
      <PageTitle eyebrow="Workspace · W-01" title="Watchlist" desc="Saved on this device only. Accounts and synced watchlists arrive with authentication (Phase 6)." />
      <Panel title="Watched companies" code="W-02" contentClassName="p-0">
        <WatchlistView />
      </Panel>
    </div>
  );
}
