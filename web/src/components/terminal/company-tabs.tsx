"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { COMPANY_SECTIONS, companyRoutes } from "@/lib/terminal/routes";

export function CompanyTabs({ ticker, className }: { ticker: string; className?: string }) {
  const pathname = usePathname();
  const r = companyRoutes(ticker);
  return (
    <nav aria-label="Company sections" className={cn("flex gap-1 overflow-x-auto border-b border-line scrollbar-thin", className)}>
      {COMPANY_SECTIONS.map((s) => {
        const href = r[s.key];
        const active = pathname === href;
        if (!s.ready) {
          return (
            <span key={s.key} aria-disabled className="-mb-px cursor-not-allowed whitespace-nowrap px-3 py-2 text-[13px] font-medium text-muted/60" title="In development">
              {s.label}
            </span>
          );
        }
        return (
          <Link
            key={s.key}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn("relative -mb-px whitespace-nowrap px-3 py-2 text-[13px] font-medium text-muted transition-colors hover:text-fg", active && "text-fg")}
          >
            {s.label}
            {active && <motion.span layoutId="tab-terminal" className="absolute inset-x-2 -bottom-px h-0.5 bg-accent" />}
          </Link>
        );
      })}
    </nav>
  );
}
