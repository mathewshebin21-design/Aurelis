"use client";

import * as React from "react";
import Link from "next/link";
import { Menu, Search, X } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { AS_OF, getCompany } from "@/lib/data/build";
import { Dialog, DialogClose, DialogTitle, SheetContent } from "@/components/ui/dialog";
import { CommandSearch } from "@/components/features/search";
import { useNav } from "./shared";

export function ShellB({ children }: { children: React.ReactNode }) {
  const { items, ticker, isActive } = useNav("b");
  const [cmd, setCmd] = React.useState(false);
  const [menu, setMenu] = React.useState(false);
  const company = getCompany(ticker)!;
  const primary = items.filter((i) => ["dashboard", "company", "valuation", "scenarios", "thesis", "watchlist"].includes(i.key));
  const label = (k: string, l: string) => (k === "dashboard" ? "Briefing" : k === "company" ? "Research" : l);

  return (
    <div className="flex min-h-dvh flex-col bg-bg text-[15px]">
      <div className="bg-[var(--navy)] px-4 py-1.5 text-center text-[11px] tracking-wide text-[var(--gold)]">
        Illustrative preview — fictional companies and figures · As of {AS_OF}
      </div>
      <header className="sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <button type="button" className="text-fg-2 lg:hidden" onClick={() => setMenu(true)} aria-label="Open navigation">
            <Menu className="size-5" />
          </button>
          <Link href="/b" className="flex items-baseline gap-2">
            <span className="font-display text-[26px] font-medium tracking-tight text-fg">Aurelis</span>
            <span className="hidden text-[10px] uppercase tracking-[0.28em] text-accent sm:inline">Private</span>
          </Link>
          <nav aria-label="Primary" className="ml-auto hidden items-center gap-6 lg:flex">
            {primary.map((it) => (
              <Link
                key={it.key}
                href={it.href}
                aria-current={isActive(it.href) ? "page" : undefined}
                className={cn("relative py-1 text-[12.5px] uppercase tracking-[0.14em] text-fg-2 transition-colors hover:text-fg", isActive(it.href) && "text-fg")}
              >
                {label(it.key, it.label)}
                {isActive(it.href) && <motion.span layoutId="nav-b" className="absolute inset-x-0 -bottom-[21px] h-px bg-accent" />}
              </Link>
            ))}
          </nav>
          <button
            type="button"
            onClick={() => setCmd(true)}
            className="ml-auto inline-flex items-center gap-2 rounded-full border border-line-strong px-3 py-1.5 text-[12.5px] text-fg-2 hover:border-accent lg:ml-0"
            aria-label="Search companies"
          >
            <Search className="size-3.5" /> <span className="hidden sm:inline">Search</span>
          </button>
        </div>
        <div className="border-t border-line/70">
          <div className="mx-auto flex max-w-6xl items-center gap-2 overflow-x-auto px-4 py-1.5 text-[11.5px] text-muted sm:px-6">
            <span className="hidden sm:inline">Coverage in focus:</span>
            <span className="truncate font-display text-[14px] text-fg">{company.name}</span>
            <span className="num">· {company.ticker}</span>
            <Link href={items.find((i) => i.key === "financials")!.href} className="ml-auto whitespace-nowrap text-accent hover:underline">Financial statements →</Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-12">{children}</main>

      <footer className="bg-[var(--navy)] text-[#d9d3c4]">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 text-[12.5px] sm:px-6 md:grid-cols-[1fr_2fr]">
          <div className="font-display text-2xl text-[#f7f3ea]">Aurelis</div>
          <p className="leading-relaxed text-[#b8b1a1]">
            Design preview B — Private Wealth. All issuers, prices, filings and analyses are fictional and exist only to evaluate the interface. Model outputs are
            illustrations under stated assumptions and do not imply any return. <Link href="/" className="text-[var(--gold)] underline-offset-4 hover:underline">Compare all three designs</Link>.
          </p>
        </div>
      </footer>

      <CommandSearch d="b" open={cmd} onOpenChange={setCmd} />
      <Dialog open={menu} onOpenChange={setMenu}>
        <SheetContent className="bg-bg">
          <div className="flex h-16 items-center justify-between border-b border-line px-5">
            <DialogTitle className="font-display text-2xl font-medium">Aurelis</DialogTitle>
            <DialogClose aria-label="Close"><X className="size-5" /></DialogClose>
          </div>
          <nav className="flex flex-col p-3" aria-label="Primary mobile">
            {items.map((it) => (
              <Link key={it.key} href={it.href} onClick={() => setMenu(false)} className={cn("border-b border-line/70 px-2 py-3 font-display text-lg text-fg-2", isActive(it.href) && "text-accent")}>
                {label(it.key, it.label)}
              </Link>
            ))}
          </nav>
        </SheetContent>
      </Dialog>
    </div>
  );
}
