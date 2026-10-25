"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, BookOpenCheck, Calculator, ChevronRight, Command, Database, GitBranch, LayoutDashboard, Menu, Search, Star, Table2, X, type LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { COMPANY_SECTIONS, companyRoutes, T, tickerFromPath, WORKSPACE, type CompanySection } from "@/lib/terminal/routes";
import { Dialog, DialogClose, DialogTitle, SheetContent } from "@/components/ui/dialog";
import { TerminalCommandSearch } from "./command-search";

type Item = { key: string; label: string; href: string; icon: LucideIcon; ready: boolean };

const SECTION_ICON: Record<CompanySection, LucideIcon> = {
  overview: BarChart3,
  financials: Table2,
  valuation: Calculator,
  scenarios: GitBranch,
  research: BookOpenCheck,
};

function SideNav({ ticker, pathname, onNavigate }: { ticker: string | null; pathname: string; onNavigate?: () => void }) {
  const workspace: Item[] = [
    { key: "search", label: "Company search", href: WORKSPACE.search, icon: Search, ready: true },
    { key: "watchlist", label: "Watchlist", href: WORKSPACE.watchlist, icon: Star, ready: true },
    { key: "dashboard", label: "Dashboard", href: WORKSPACE.dashboard, icon: LayoutDashboard, ready: false },
  ];
  const research: Item[] = ticker
    ? COMPANY_SECTIONS.map((s) => ({ key: s.key, label: s.label, href: companyRoutes(ticker)[s.key], icon: SECTION_ICON[s.key], ready: s.ready }))
    : [];
  const link = (it: Item) => {
    const active = pathname === it.href;
    if (!it.ready) {
      return (
        <span key={it.key} aria-disabled className="flex cursor-not-allowed items-center gap-2.5 px-2.5 py-1.5 text-[13px] text-muted/70" title="In development">
          <it.icon className="size-4" />
          {it.label}
          <span className="num ml-auto text-[9.5px] uppercase tracking-wider">soon</span>
        </span>
      );
    }
    return (
      <Link
        key={it.key}
        href={it.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn("relative flex items-center gap-2.5 rounded-[var(--radius)] px-2.5 py-1.5 text-[13px] text-fg-2 transition-colors hover:bg-panel-2 hover:text-fg", active && "text-fg")}
      >
        {active && <motion.span layoutId="side-terminal" className="absolute inset-0 rounded-[var(--radius)] bg-accent-soft" transition={{ type: "spring", bounce: 0.15, duration: 0.35 }} />}
        <it.icon className={cn("relative size-4 text-muted", active && "text-accent")} />
        <span className="relative">{it.label}</span>
      </Link>
    );
  };
  return (
    <div className="flex h-full flex-col">
      <div className="px-3 pb-2 pt-1 text-[10.5px] font-semibold uppercase tracking-wider text-muted">Workspace</div>
      <div className="space-y-0.5 px-2">{workspace.map(link)}</div>
      <div className="mt-5 flex items-center justify-between px-3 pb-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted">
        <span>Research module</span>
        {ticker && <span className="num rounded bg-panel-2 px-1.5 py-0.5 text-fg">{ticker}</span>}
      </div>
      {ticker ? <div className="space-y-0.5 px-2">{research.map(link)}</div> : <p className="px-3 text-[12px] text-muted">Open a company to start a research session.</p>}
      <div className="mt-auto space-y-1.5 border-t border-line p-3 text-[11.5px] text-muted">
        <div className="flex items-center gap-1.5">
          <Database className="size-3.5 text-pos" /> SEC EDGAR filings
        </div>
        <div>Market inputs: entered by you, labelled as assumptions</div>
        <div>Watchlist: saved on this device only</div>
        <Link href="/" className="block text-accent hover:underline">⇄ Design previews</Link>
      </div>
    </div>
  );
}

export function TerminalShell({ children, apiOnline }: { children: React.ReactNode; apiOnline: boolean }) {
  const pathname = usePathname();
  const ticker = tickerFromPath(pathname);
  const [cmd, setCmd] = React.useState(false);
  const [menu, setMenu] = React.useState(false);
  const crumbs = pathname.split("/").filter(Boolean).slice(1).map(decodeURIComponent);

  return (
    <div className="min-h-dvh bg-bg text-[14px]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-line bg-panel lg:block">
        <Link href={T} className="flex h-14 items-center gap-2 border-b border-line px-4">
          <span className="grid size-6 place-items-center rounded-[5px] bg-fg text-[11px] font-bold text-panel">Au</span>
          <span className="text-[14px] font-semibold tracking-tight">
            Aurelis <span className="font-normal text-muted">Terminal</span>
          </span>
        </Link>
        <div className="h-[calc(100%-56px)] pt-3">
          <SideNav ticker={ticker} pathname={pathname} />
        </div>
      </aside>
      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-panel/90 px-3 backdrop-blur sm:px-5">
          <button type="button" className="text-fg-2 lg:hidden" onClick={() => setMenu(true)} aria-label="Open navigation">
            <Menu className="size-5" />
          </button>
          <nav aria-label="Breadcrumb" className="num hidden min-w-0 items-center gap-1 text-[12px] text-muted sm:flex">
            <Link href={T} className="hover:text-fg">terminal</Link>
            {crumbs.map((c, i) => (
              <React.Fragment key={i}>
                <ChevronRight className="size-3" />
                <span className={cn("truncate", i === crumbs.length - 1 && "text-fg")}>{c.toLowerCase()}</span>
              </React.Fragment>
            ))}
          </nav>
          <button
            type="button"
            onClick={() => setCmd(true)}
            className="ml-auto flex h-8 w-full max-w-[280px] items-center gap-2 rounded-[var(--radius)] border border-line bg-panel-2 px-2.5 text-[12.5px] text-muted hover:border-line-strong"
          >
            <Search className="size-3.5" /> Search issuers…
            <kbd className="ml-auto inline-flex items-center gap-0.5 rounded border border-line bg-panel px-1 text-[10px]">
              <Command className="size-2.5" />K
            </kbd>
          </button>
          <span
            className="num hidden items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[11px] text-fg-2 md:inline-flex"
            title={apiOnline ? "Research API reachable" : "Research API unreachable: data cannot be loaded"}
          >
            <span className={cn("size-1.5 rounded-full", apiOnline ? "bg-pos" : "bg-neg")} /> {apiOnline ? "api online" : "api offline"}
          </span>
        </header>
        {!apiOnline && (
          <div role="alert" className="border-b border-neg/30 bg-neg/5 px-5 py-2 text-[12.5px] text-neg">
            The research service is unreachable. No figures are shown until it is back; nothing is substituted.
          </div>
        )}
        <main className="p-3 sm:p-5">{children}</main>
      </div>
      <TerminalCommandSearch open={cmd} onOpenChange={setCmd} />
      <Dialog open={menu} onOpenChange={setMenu}>
        <SheetContent>
          <div className="flex h-14 items-center justify-between border-b border-line px-4">
            <DialogTitle className="text-[14px] font-semibold">Aurelis Terminal</DialogTitle>
            <DialogClose aria-label="Close"><X className="size-5" /></DialogClose>
          </div>
          <div className="h-[calc(100%-56px)] pt-3">
            <SideNav ticker={ticker} pathname={pathname} onNavigate={() => setMenu(false)} />
          </div>
        </SheetContent>
      </Dialog>
    </div>
  );
}
