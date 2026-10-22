"use client";

import * as React from "react";
import Link from "next/link";
import { Command, Menu, X } from "lucide-react";
import { motion } from "motion/react";
import { cn, fmtPrice } from "@/lib/utils";
import { AS_OF, COMPANY_DATA } from "@/lib/data/build";
import { Dialog, DialogClose, DialogTitle, SheetContent } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CommandSearch } from "@/components/features/search";
import { Delta } from "@/components/features/common";
import { useNav } from "./shared";

function TickerTape() {
  const items = [...COMPANY_DATA, ...COMPANY_DATA];
  return (
    <div className="relative hidden min-w-0 flex-1 overflow-hidden md:block" aria-label="Illustrative quotes">
      <motion.div className="flex w-max gap-6" animate={{ x: ["0%", "-50%"] }} transition={{ duration: 40, ease: "linear", repeat: Infinity }}>
        {items.map((c, i) => (
          <span key={i} className="num inline-flex items-center gap-1.5 text-[11px]">
            <span className="font-semibold text-fg">{c.ticker}</span>
            <span className="text-fg-2">{fmtPrice(c.price)}</span>
            <Delta value={c.change1d} />
          </span>
        ))}
      </motion.div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-panel to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-panel to-transparent" />
    </div>
  );
}

export function ShellA({ children }: { children: React.ReactNode }) {
  const { items, ticker, isActive } = useNav("a");
  const [cmd, setCmd] = React.useState(false);
  const [menu, setMenu] = React.useState(false);

  return (
    <div className="flex min-h-dvh flex-col bg-bg text-[13px]">
      <header className="sticky top-0 z-40 flex h-10 items-center gap-3 border-b border-line bg-panel px-2 sm:px-3">
        <button type="button" className="p-1 text-fg-2 lg:hidden" onClick={() => setMenu(true)} aria-label="Open navigation">
          <Menu className="size-4" />
        </button>
        <Link href="/a" className="num flex items-center gap-2 text-[12px] font-bold tracking-[0.2em] text-fg">
          <span className="size-2 rounded-full bg-accent shadow-[0_0_10px_var(--accent)]" />
          AURELIS
        </Link>
        <span className="hidden text-[10.5px] tracking-widest text-muted sm:inline">TERMINAL</span>
        <button
          type="button"
          onClick={() => setCmd(true)}
          className="num ml-1 flex h-7 min-w-0 flex-1 items-center gap-2 rounded-[var(--radius)] border border-line-strong bg-bg px-2 text-left text-[11.5px] text-muted hover:border-accent/60 md:max-w-xs"
        >
          <span className="text-accent">&gt;</span>
          <span className="truncate">{ticker} &lt;EQUITY&gt; — search or command</span>
          <kbd className="ml-auto hidden items-center gap-0.5 rounded border border-line px-1 text-[10px] sm:inline-flex">
            <Command className="size-2.5" />K
          </kbd>
        </button>
        <TickerTape />
        <span className="num hidden text-[10.5px] text-warn xl:inline">ILLUSTRATIVE · {AS_OF}</span>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav aria-label="Primary" className="sticky top-10 hidden h-[calc(100dvh-40px-24px)] w-14 shrink-0 flex-col items-center gap-1 border-r border-line bg-panel py-2 lg:flex">
          {items.map((it, i) => (
            <React.Fragment key={it.key}>
              {i === 3 && <div className="my-1 h-px w-6 bg-line" />}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    href={it.href}
                    aria-label={it.label}
                    aria-current={isActive(it.href) ? "page" : undefined}
                    className={cn("relative flex size-9 items-center justify-center rounded-[var(--radius)] text-muted transition-colors hover:bg-panel-2 hover:text-fg", isActive(it.href) && "bg-accent-soft text-accent")}
                  >
                    {isActive(it.href) && <motion.span layoutId="rail-a" className="absolute -left-[9px] h-5 w-0.5 rounded-full bg-accent" />}
                    <it.icon className="size-4" />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">{it.label}</TooltipContent>
              </Tooltip>
            </React.Fragment>
          ))}
        </nav>
        <main className="min-w-0 flex-1 p-2 sm:p-3">{children}</main>
      </div>

      <footer className="num sticky bottom-0 z-30 flex h-6 items-center gap-4 border-t border-line bg-panel px-3 text-[10.5px] text-muted">
        <span className="text-warn">● DEMO DATA</span>
        <span className="hidden sm:inline">ENGINE det-v0 · unit-tested</span>
        <span className="hidden md:inline">FICTIONAL ISSUERS · NOT INVESTMENT ADVICE</span>
        <Link href="/" className="ml-auto hover:text-fg">⇄ Compare designs</Link>
      </footer>

      <CommandSearch d="a" open={cmd} onOpenChange={setCmd} />
      <Dialog open={menu} onOpenChange={setMenu}>
        <SheetContent>
          <div className="flex h-10 items-center justify-between border-b border-line px-3">
            <DialogTitle className="num text-[12px] font-bold tracking-[0.2em]">AURELIS</DialogTitle>
            <DialogClose aria-label="Close"><X className="size-4" /></DialogClose>
          </div>
          <nav className="p-2" aria-label="Primary mobile">
            {items.map((it) => (
              <Link key={it.key} href={it.href} onClick={() => setMenu(false)} className={cn("flex items-center gap-3 rounded-[var(--radius)] px-3 py-2 text-fg-2 hover:bg-panel-2", isActive(it.href) && "bg-accent-soft text-accent")}>
                <it.icon className="size-4" /> {it.label}
                {it.group === "research" && <span className="num ml-auto text-[10px] text-muted">{ticker}</span>}
              </Link>
            ))}
          </nav>
        </SheetContent>
      </Dialog>
    </div>
  );
}
