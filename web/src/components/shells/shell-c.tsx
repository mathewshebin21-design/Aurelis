"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Command, FlaskConical, Menu, Save, Search, X } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { getCompany } from "@/lib/data/build";
import { Dialog, DialogClose, DialogTitle, SheetContent } from "@/components/ui/dialog";
import { CommandSearch } from "@/components/features/search";
import { useNav, type NavItem } from "./shared";

function SideNav({ items, ticker, isActive, onNavigate }: { items: NavItem[]; ticker: string; isActive: (h: string) => boolean; onNavigate?: () => void }) {
  const company = getCompany(ticker)!;
  const group = (g: NavItem["group"]) => items.filter((i) => i.group === g);
  const link = (it: NavItem) => (
    <Link
      key={it.key}
      href={it.href}
      onClick={onNavigate}
      aria-current={isActive(it.href) ? "page" : undefined}
      className={cn("relative flex items-center gap-2.5 rounded-[var(--radius)] px-2.5 py-1.5 text-[13px] text-fg-2 transition-colors hover:bg-panel-2 hover:text-fg", isActive(it.href) && "text-fg")}
    >
      {isActive(it.href) && <motion.span layoutId="side-c" className="absolute inset-0 rounded-[var(--radius)] bg-accent-soft" transition={{ type: "spring", bounce: 0.15, duration: 0.35 }} />}
      <it.icon className={cn("relative size-4 text-muted", isActive(it.href) && "text-accent")} />
      <span className="relative">{it.label}</span>
    </Link>
  );
  return (
    <div className="flex h-full flex-col">
      <div className="px-3 pb-2 pt-1 text-[10.5px] font-semibold uppercase tracking-wider text-muted">Workspace</div>
      <div className="space-y-0.5 px-2">{group("workspace").map(link)}</div>
      <div className="mt-5 flex items-center justify-between px-3 pb-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted">
        <span>Research module</span>
        <span className="num rounded bg-panel-2 px-1.5 py-0.5 text-fg">{ticker}</span>
      </div>
      <div className="px-3 pb-2 text-[12px] text-fg-2">{company.name}</div>
      <div className="space-y-0.5 px-2">{group("research").map(link)}</div>
      <div className="mt-auto space-y-2 border-t border-line p-3 text-[11.5px] text-muted">
        <div className="flex items-center gap-1.5">
          <FlaskConical className="size-3.5 text-warn" /> Illustrative dataset
        </div>
        <div className="num">Session RS-0142 · unsaved</div>
        <Link href="/" className="block text-accent hover:underline">⇄ Compare designs</Link>
      </div>
    </div>
  );
}

export function ShellC({ children }: { children: React.ReactNode }) {
  const { items, ticker, isActive } = useNav("c");
  const pathname = usePathname();
  const [cmd, setCmd] = React.useState(false);
  const [menu, setMenu] = React.useState(false);
  const crumbs = pathname.split("/").filter(Boolean).slice(1);

  return (
    <div className="min-h-dvh bg-bg text-[14px]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-line bg-panel lg:block">
        <Link href="/c" className="flex h-14 items-center gap-2 border-b border-line px-4">
          <span className="grid size-6 place-items-center rounded-[5px] bg-fg text-[11px] font-bold text-panel">Au</span>
          <span className="text-[14px] font-semibold tracking-tight">Aurelis <span className="font-normal text-muted">Lab</span></span>
        </Link>
        <div className="h-[calc(100%-56px)] pt-3">
          <SideNav items={items} ticker={ticker} isActive={isActive} />
        </div>
      </aside>
      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-panel/90 px-3 backdrop-blur sm:px-5">
          <button type="button" className="text-fg-2 lg:hidden" onClick={() => setMenu(true)} aria-label="Open navigation">
            <Menu className="size-5" />
          </button>
          <nav aria-label="Breadcrumb" className="num hidden min-w-0 items-center gap-1 text-[12px] text-muted sm:flex">
            <Link href="/c" className="hover:text-fg">lab</Link>
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
          <span className="num hidden items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[11px] text-fg-2 md:inline-flex">
            <span className="size-1.5 rounded-full bg-pos" /> engine det-v0
          </span>
          <button type="button" className="hidden items-center gap-1.5 rounded-[var(--radius)] bg-fg px-3 py-1.5 text-[12px] font-medium text-panel md:inline-flex" title="Saved sessions arrive in Phase 5">
            <Save className="size-3.5" /> Save session
          </button>
        </header>
        <main className="p-3 sm:p-5">{children}</main>
      </div>
      <CommandSearch d="c" open={cmd} onOpenChange={setCmd} />
      <Dialog open={menu} onOpenChange={setMenu}>
        <SheetContent>
          <div className="flex h-14 items-center justify-between border-b border-line px-4">
            <DialogTitle className="text-[14px] font-semibold">Aurelis Lab</DialogTitle>
            <DialogClose aria-label="Close"><X className="size-5" /></DialogClose>
          </div>
          <div className="h-[calc(100%-56px)] pt-3">
            <SideNav items={items} ticker={ticker} isActive={isActive} onNavigate={() => setMenu(false)} />
          </div>
        </SheetContent>
      </Dialog>
    </div>
  );
}
