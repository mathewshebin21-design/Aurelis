/** Routes of the live terminal (`/terminal`). The `/a`, `/b`, `/c` previews keep their own routes. */
export const T = "/terminal";

export function companyRoutes(ticker: string) {
  const co = `${T}/company/${encodeURIComponent(ticker.toUpperCase())}`;
  return {
    overview: co,
    financials: `${co}/financials`,
    valuation: `${co}/valuation`,
    scenarios: `${co}/scenarios`,
    research: `${co}/research`,
  };
}

export type CompanySection = keyof ReturnType<typeof companyRoutes>;

/** `ready: false` sections are shown disabled ("in development") rather than linking to a broken page. */
export const COMPANY_SECTIONS: { key: CompanySection; label: string; code: string; ready: boolean }[] = [
  { key: "overview", label: "Overview", code: "OV", ready: true },
  { key: "financials", label: "Financials", code: "FS", ready: false },
  { key: "valuation", label: "Valuation", code: "DCF", ready: false },
  { key: "scenarios", label: "Scenarios", code: "SC", ready: false },
  { key: "research", label: "Research", code: "AI", ready: false },
];

export const WORKSPACE = {
  search: `${T}/search`,
  watchlist: `${T}/watchlist`,
  dashboard: `${T}/dashboard`,
};

/** Ticker in a terminal pathname, if any. */
export function tickerFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/terminal\/company\/([^/]+)/);
  return m ? decodeURIComponent(m[1]).toUpperCase() : null;
}
