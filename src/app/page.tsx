import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { DESIGNS, routes, type DesignId } from "@/lib/designs";

const PAGES: { key: keyof ReturnType<typeof routes>; label: string }[] = [
  { key: "home", label: "Landing" },
  { key: "search", label: "Company search" },
  { key: "dashboard", label: "Executive dashboard" },
  { key: "company", label: "Company research" },
  { key: "financials", label: "Financial statements" },
  { key: "valuation", label: "Valuation workspace" },
  { key: "scenarios", label: "Scenario analysis" },
  { key: "thesis", label: "Investment thesis" },
  { key: "watchlist", label: "Watchlist" },
];

const PREVIEW_BG: Record<DesignId, string> = {
  a: "bg-[#0b0d10] text-[#e6e9ee]",
  b: "bg-[#f7f3ea] text-[#121a33]",
  c: "bg-white text-[#0f1720]",
};

export default function Hub() {
  return (
    <main className="min-h-dvh bg-[#f4f4f1] px-4 py-10 text-[#16181d] sm:px-8 sm:py-14">
      <div className="mx-auto max-w-6xl">
        <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#6b7079]">AURELIS · Phase 1</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Three design directions — compare and choose</h1>
        <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-[#3a3f47]">
          Each preview is a complete, interactive concept built on the same tested financial engine and the same <strong>illustrative dataset of fictional companies</strong>. Open
          the same page across all three to compare like for like. Press <kbd className="rounded border border-[#cfcfc8] bg-white px-1 text-[12px]">⌘K</kbd> inside any preview to search.
        </p>
        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {(Object.keys(DESIGNS) as DesignId[]).map((id) => {
            const d = DESIGNS[id];
            const r = routes(id);
            return (
              <section key={id} className="flex flex-col overflow-hidden rounded-lg border border-[#e4e4df] bg-white">
                <Link href={r.home} className={`group block p-6 ${PREVIEW_BG[id]}`}>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.2em] opacity-70">{d.code}</div>
                  <div className={`mt-2 text-2xl ${id === "b" ? "font-display" : "font-semibold tracking-tight"}`}>{d.name}</div>
                  <div className="mt-4 flex gap-1.5">
                    {d.palette.map((c) => (
                      <span key={c} className="size-6 rounded-full border border-black/10" style={{ background: c }} title={c} />
                    ))}
                  </div>
                  <span className="mt-5 inline-flex items-center gap-1 text-[13px] font-medium opacity-80 group-hover:opacity-100">
                    Open {r.home} <ArrowRight className="size-3.5" />
                  </span>
                </Link>
                <div className="flex-1 p-5">
                  <p className="text-[13.5px] leading-relaxed text-[#3a3f47]">{d.tagline}</p>
                  <ul className="mt-4 divide-y divide-[#eeeeea] text-[13px]">
                    {PAGES.map((p) => (
                      <li key={p.key}>
                        <Link href={r[p.key]} className="flex items-center justify-between py-1.5 hover:text-[#2563eb]">
                          <span>{p.label}</span>
                          <code className="text-[11.5px] text-[#6b7079]">{r[p.key]}</code>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            );
          })}
        </div>
        <p className="mt-10 text-[12px] text-[#6b7079]">
          All companies, tickers, prices, filings and figures are fictional, generated for design evaluation only. Nothing here describes a real issuer or constitutes investment advice.
        </p>
      </div>
    </main>
  );
}
