import { notFound } from "next/navigation";
import { isDesign } from "@/lib/designs";
import { COMPANY_DATA, getCompany } from "@/lib/data/build";
import { CompanyTabs, Delta, PriceTag, WatchStar } from "@/components/features/common";
import { Badge } from "@/components/ui/badge";
import { fmtMoneyM } from "@/lib/utils";

export function generateStaticParams() {
  return COMPANY_DATA.map((c) => ({ ticker: c.ticker }));
}

export const dynamicParams = false;

export default async function CompanyLayout({ children, params }: LayoutProps<"/[design]/company/[ticker]">) {
  const { design: d, ticker } = await params;
  const c = getCompany(ticker);
  if (!isDesign(d) || !c) notFound();

  if (d === "a") {
    return (
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 border border-line bg-panel px-3 py-2">
          <span className="num rounded-[2px] bg-accent px-1.5 py-0.5 text-[12px] font-bold text-accent-fg">{c.ticker}</span>
          <h1 className="text-[14px] font-semibold text-fg">{c.name}</h1>
          <span className="text-[11.5px] text-muted">{c.exchange} · {c.industry}</span>
          <span className="num text-[15px] font-semibold text-fg">${c.price.toFixed(2)}</span>
          <Delta value={c.change1d} />
          <span className="num text-[11.5px] text-muted">MCAP {fmtMoneyM(c.marketCap)}</span>
          <Badge variant="demo">Illustrative</Badge>
          <WatchStar ticker={c.ticker} className="ml-auto py-0.5" />
        </div>
        <CompanyTabs d={d} ticker={c.ticker} className="mb-2" />
        {children}
      </div>
    );
  }

  if (d === "b") {
    return (
      <div>
        <div className="mb-8 border-b border-line-strong pb-8">
          <div className="mb-3 flex flex-wrap items-center gap-3 text-[11px] uppercase tracking-[0.24em] text-accent">
            {c.sector} <span className="text-line-strong">/</span> {c.industry}
            <Badge variant="demo" className="tracking-wider">Illustrative</Badge>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <h1 className="font-display text-5xl font-normal tracking-tight text-fg sm:text-6xl">{c.name}</h1>
              <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-fg-2">{c.description}</p>
            </div>
            <div className="flex flex-col items-end gap-3">
              <PriceTag c={c} />
              <WatchStar ticker={c.ticker} />
            </div>
          </div>
        </div>
        <CompanyTabs d={d} ticker={c.ticker} className="mb-10" />
        {children}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="num grid size-11 place-items-center rounded-[var(--radius)] border border-line bg-panel text-[13px] font-semibold">{c.ticker.slice(0, 2)}</div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight text-fg">{c.name}</h1>
              <span className="num text-[13px] text-muted">{c.ticker}</span>
              <Badge variant="demo">Illustrative</Badge>
            </div>
            <div className="text-[12.5px] text-muted">{c.exchange} · {c.sector} · {c.industry} · {c.hq}</div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <PriceTag c={c} />
          <WatchStar ticker={c.ticker} />
        </div>
      </div>
      <CompanyTabs d={d} ticker={c.ticker} className="mb-4" />
      {children}
    </div>
  );
}
