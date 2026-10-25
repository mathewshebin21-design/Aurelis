import type { Metadata } from "next";
import { api } from "@/lib/api/server";
import { TerminalShell } from "@/components/terminal/shell";

export const metadata: Metadata = {
  title: { default: "AURELIS Terminal", template: "%s · AURELIS Terminal" },
  description: "AI investment research terminal on SEC filings: statements with provenance, engine-computed metrics, valuation and verified research.",
};

export default async function TerminalLayout({ children }: { children: React.ReactNode }) {
  const health = await api.get("/v1/health", { init: { signal: AbortSignal.timeout(3000) } }).catch(() => ({ ok: false as const }));
  return (
    <div data-design="c" className="min-h-dvh bg-bg font-sans text-fg">
      <TerminalShell apiOnline={health.ok}>{children}</TerminalShell>
    </div>
  );
}
