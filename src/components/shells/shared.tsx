"use client";

import { usePathname } from "next/navigation";
import { DEFAULT_TICKER, routes, type DesignId } from "@/lib/designs";
import { getCompany } from "@/lib/data/build";
import {
  BarChart3,
  BookOpenCheck,
  Calculator,
  GitBranch,
  LayoutDashboard,
  Search,
  Star,
  Table2,
  type LucideIcon,
} from "lucide-react";

export function useCurrentTicker() {
  const pathname = usePathname();
  const m = pathname.match(/\/company\/([A-Za-z]+)/);
  const t = m?.[1]?.toUpperCase();
  return t && getCompany(t) ? t : DEFAULT_TICKER;
}

export type NavItem = { key: string; label: string; href: string; icon: LucideIcon; group: "workspace" | "research" };

export function useNav(d: DesignId): { items: NavItem[]; ticker: string; isActive: (href: string) => boolean } {
  const pathname = usePathname();
  const ticker = useCurrentTicker();
  const r = routes(d, ticker);
  const items: NavItem[] = [
    { key: "dashboard", label: "Dashboard", href: r.dashboard, icon: LayoutDashboard, group: "workspace" },
    { key: "search", label: "Company search", href: r.search, icon: Search, group: "workspace" },
    { key: "watchlist", label: "Watchlist", href: r.watchlist, icon: Star, group: "workspace" },
    { key: "company", label: "Research", href: r.company, icon: BarChart3, group: "research" },
    { key: "financials", label: "Financials", href: r.financials, icon: Table2, group: "research" },
    { key: "valuation", label: "Valuation", href: r.valuation, icon: Calculator, group: "research" },
    { key: "scenarios", label: "Scenarios", href: r.scenarios, icon: GitBranch, group: "research" },
    { key: "thesis", label: "Thesis", href: r.thesis, icon: BookOpenCheck, group: "research" },
  ];
  return { items, ticker, isActive: (href) => pathname === href };
}
