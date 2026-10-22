export type DesignId = "a" | "b" | "c";

export const DESIGNS: Record<DesignId, { id: DesignId; code: string; name: string; tagline: string; palette: string[] }> = {
  a: {
    id: "a",
    code: "Design A",
    name: "Institutional Terminal",
    tagline: "Dense, multi-panel research terminal. Charcoal, graphite, midnight and restrained electric blue.",
    palette: ["#0b0d10", "#161a21", "#2f3744", "#3d8bff", "#e6e9ee"],
  },
  b: {
    id: "b",
    code: "Design B",
    name: "Private Wealth",
    tagline: "Editorial investment briefings for principals and committees. Midnight navy, warm ivory, champagne gold.",
    palette: ["#0f1a33", "#17244a", "#f7f3ea", "#c9a96e", "#8a6a2f"],
  },
  c: {
    id: "c",
    code: "Design C",
    name: "Quant Research Lab",
    tagline: "Modular, high-precision analytics workbench. Clean white, graphite and instrument colour.",
    palette: ["#ffffff", "#f2f4f7", "#344050", "#2563eb", "#ea580c"],
  },
};

export const isDesign = (x: string): x is DesignId => x === "a" || x === "b" || x === "c";

export const DEFAULT_TICKER = "NWSC";

export function routes(d: DesignId, ticker = DEFAULT_TICKER) {
  const base = `/${d}`;
  const co = `${base}/company/${ticker}`;
  return {
    home: base,
    search: `${base}/search`,
    dashboard: `${base}/dashboard`,
    watchlist: `${base}/watchlist`,
    company: co,
    financials: `${co}/financials`,
    valuation: `${co}/valuation`,
    scenarios: `${co}/scenarios`,
    thesis: `${co}/thesis`,
  };
}

export const COMPANY_TABS = [
  { key: "company", label: "Overview" },
  { key: "financials", label: "Financials" },
  { key: "valuation", label: "Valuation" },
  { key: "scenarios", label: "Scenarios" },
  { key: "thesis", label: "Thesis" },
] as const;
