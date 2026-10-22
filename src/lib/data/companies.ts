/**
 * ILLUSTRATIVE DATASET — every company, ticker, figure and filing excerpt in
 * this file is fictional and exists only to demonstrate the interface.
 * None of it describes a real issuer. Phase 2 replaces this module with
 * SEC EDGAR–sourced data carrying full provenance.
 *
 * Specs are compact drivers (USD millions); `build.ts` derives internally
 * consistent statements from them (the balance sheet balances and the cash
 * flow statement reconciles to the change in cash with no plug).
 */

export type ClaimKind = "fact" | "assumption" | "interpretation";

export interface Evidence {
  id: string;
  document: string;
  section: string;
  excerpt: string;
}

export interface Claim {
  text: string;
  kind: ClaimKind;
  evidence: string[];
  confidence: "high" | "medium" | "low";
}

export interface CompanySpec {
  ticker: string;
  name: string;
  exchange: string;
  sector: string;
  industry: string;
  hq: string;
  employees: number;
  description: string;
  price: number;
  dilutedShares2025: number;
  shareDrift: number;
  beta: number;
  revenue2021: number;
  growth: [number, number, number, number];
  grossMargin: [number, number, number, number, number];
  rndPct: number;
  sgaPct: number;
  daPct: number;
  capexPct: number;
  taxRate: number;
  debt2021: number;
  debtGrowth: number;
  interestRate: number;
  cash2021: number;
  ppeIntensity: number;
  intangiblesPct: number;
  dso: number;
  dio: number;
  dpo: number;
  payout: number;
  buybackPct: number;
  dcf: { growthStart: number; growthFinal: number; marginTarget: number; capexPct?: number };
  evidence: Evidence[];
  bull: Claim[];
  bear: Claim[];
  catalysts: { date: string; event: string; kind: ClaimKind }[];
  risks: { label: string; severity: 1 | 2 | 3 | 4 | 5; likelihood: 1 | 2 | 3 | 4 | 5; note: string }[];
}

const DOC_10K = "Illustrative FY2025 Form 10-K";
const DOC_CALL = "Illustrative Q2 FY2026 earnings call";

export const COMPANIES: CompanySpec[] = [
  {
    ticker: "NWSC",
    name: "Northwind Semiconductor",
    exchange: "NASDAQ (illustrative)",
    sector: "Information Technology",
    industry: "Semiconductors",
    hq: "Austin, TX",
    employees: 31200,
    description: "Designs data-centre accelerators and high-speed networking silicon; manufacturing is outsourced to third-party foundries.",
    price: 184.2,
    dilutedShares2025: 1020,
    shareDrift: 0.008,
    beta: 1.45,
    revenue2021: 8400,
    growth: [0.18, 0.09, 0.31, 0.27],
    grossMargin: [0.58, 0.6, 0.57, 0.61, 0.63],
    rndPct: 0.2,
    sgaPct: 0.08,
    daPct: 0.05,
    capexPct: 0.06,
    taxRate: 0.15,
    debt2021: 6000,
    debtGrowth: 0,
    interestRate: 0.04,
    cash2021: 4200,
    ppeIntensity: 0.35,
    intangiblesPct: 0.45,
    dso: 52,
    dio: 95,
    dpo: 48,
    payout: 0.1,
    buybackPct: 0.4,
    dcf: { growthStart: 0.24, growthFinal: 0.09, marginTarget: 0.38 },
    evidence: [
      { id: "E1", document: DOC_10K, section: "Item 7 — MD&A, Segment results", excerpt: "Data-centre segment revenue increased 34% year over year, driven by accelerator shipments to cloud customers." },
      { id: "E2", document: DOC_10K, section: "Item 1A — Risk factors", excerpt: "Our three largest customers accounted for approximately 46% of net revenue in fiscal 2025." },
      { id: "E3", document: DOC_10K, section: "Item 1A — Risk factors", excerpt: "Substantially all of our wafers are manufactured by a single foundry partner in one geographic region." },
      { id: "E4", document: DOC_CALL, section: "Prepared remarks — CFO", excerpt: "We expect gross margin in the low-to-mid 60s for the remainder of the year as new packaging capacity comes online." },
      { id: "E5", document: DOC_10K, section: "Note 12 — Purchase obligations", excerpt: "Non-cancellable inventory and capacity purchase commitments totalled $9.1 billion at fiscal year end." },
    ],
    bull: [
      { text: "Data-centre revenue is growing faster than the company overall, shifting mix toward the higher-margin segment.", kind: "fact", evidence: ["E1"], confidence: "high" },
      { text: "Management guides gross margin to stay in the low-to-mid 60s, supporting operating leverage.", kind: "fact", evidence: ["E4"], confidence: "medium" },
      { text: "If accelerator demand persists through FY2027, operating margin could exceed the 36% modelled in the base case.", kind: "interpretation", evidence: ["E1", "E4"], confidence: "low" },
    ],
    bear: [
      { text: "Customer concentration is high: three customers represent ~46% of revenue.", kind: "fact", evidence: ["E2"], confidence: "high" },
      { text: "Single-foundry dependence creates supply and geopolitical exposure.", kind: "fact", evidence: ["E3"], confidence: "high" },
      { text: "Large purchase commitments could pressure margins if demand normalises.", kind: "interpretation", evidence: ["E5"], confidence: "medium" },
    ],
    catalysts: [
      { date: "2026-11-18", event: "Q3 FY2026 earnings release", kind: "fact" },
      { date: "2027-Q1", event: "Next-generation accelerator volume ramp (management target)", kind: "assumption" },
      { date: "2027-H1", event: "Second-source foundry qualification", kind: "assumption" },
    ],
    risks: [
      { label: "Customer concentration", severity: 4, likelihood: 3, note: "Top-3 customers ≈46% of revenue (E2)" },
      { label: "Foundry dependence", severity: 5, likelihood: 2, note: "Single-region manufacturing (E3)" },
      { label: "Inventory commitments", severity: 3, likelihood: 3, note: "$9.1bn non-cancellable (E5)" },
      { label: "Export controls", severity: 4, likelihood: 3, note: "Analyst assumption — not quantified in filing" },
    ],
  },
  {
    ticker: "MRDN",
    name: "Meridian Cloud Systems",
    exchange: "NYSE (illustrative)",
    sector: "Information Technology",
    industry: "Application Software",
    hq: "Seattle, WA",
    employees: 14800,
    description: "Subscription platform for enterprise data integration, workflow automation and governance.",
    price: 212.0,
    dilutedShares2025: 310,
    shareDrift: -0.015,
    beta: 1.25,
    revenue2021: 3100,
    growth: [0.29, 0.24, 0.21, 0.19],
    grossMargin: [0.74, 0.75, 0.77, 0.78, 0.79],
    rndPct: 0.24,
    sgaPct: 0.38,
    daPct: 0.04,
    capexPct: 0.03,
    taxRate: 0.18,
    debt2021: 1500,
    debtGrowth: 0,
    interestRate: 0.03,
    cash2021: 2600,
    ppeIntensity: 0.15,
    intangiblesPct: 0.6,
    dso: 70,
    dio: 0,
    dpo: 30,
    payout: 0,
    buybackPct: 0.3,
    dcf: { growthStart: 0.19, growthFinal: 0.11, marginTarget: 0.3 },
    evidence: [
      { id: "E1", document: DOC_10K, section: "Item 7 — Key metrics", excerpt: "Dollar-based net retention rate was 118% as of fiscal year end, compared with 121% in the prior year." },
      { id: "E2", document: DOC_10K, section: "Item 7 — Remaining performance obligations", excerpt: "RPO increased 23% to $8.4 billion, of which approximately 55% is expected to be recognised within twelve months." },
      { id: "E3", document: DOC_CALL, section: "Q&A", excerpt: "We are seeing elongated approval cycles for multi-year deals above one million dollars." },
      { id: "E4", document: DOC_10K, section: "Note 14 — Stock-based compensation", excerpt: "Stock-based compensation expense was $1.02 billion, or 14% of revenue." },
    ],
    bull: [
      { text: "Net retention of 118% means existing customers alone expand revenue meaningfully.", kind: "fact", evidence: ["E1"], confidence: "high" },
      { text: "RPO growth of 23% runs ahead of revenue growth, supporting near-term visibility.", kind: "fact", evidence: ["E2"], confidence: "high" },
      { text: "Operating margin can expand toward 26% as sales efficiency improves.", kind: "assumption", evidence: [], confidence: "medium" },
    ],
    bear: [
      { text: "Net retention declined three points year over year.", kind: "fact", evidence: ["E1"], confidence: "high" },
      { text: "Stock-based compensation equals ~14% of revenue, diluting the economic margin.", kind: "fact", evidence: ["E4"], confidence: "high" },
      { text: "Longer large-deal cycles may signal budget pressure in FY2027.", kind: "interpretation", evidence: ["E3"], confidence: "medium" },
    ],
    catalysts: [
      { date: "2026-12-04", event: "Q3 FY2026 earnings release", kind: "fact" },
      { date: "2027-03", event: "Investor day — long-term margin framework", kind: "assumption" },
    ],
    risks: [
      { label: "Retention erosion", severity: 4, likelihood: 3, note: "NRR 121% → 118% (E1)" },
      { label: "SBC dilution", severity: 3, likelihood: 4, note: "14% of revenue (E4)" },
      { label: "Deal elongation", severity: 3, likelihood: 3, note: "Management commentary (E3)" },
    ],
  },
  {
    ticker: "ALTP",
    name: "Alto Payments",
    exchange: "NYSE (illustrative)",
    sector: "Financials",
    industry: "Transaction & Payment Processing",
    hq: "Chicago, IL",
    employees: 18900,
    description: "Merchant acquiring and embedded-payments platform serving mid-market and enterprise merchants.",
    price: 96.75,
    dilutedShares2025: 480,
    shareDrift: 0.012,
    beta: 1.2,
    revenue2021: 5600,
    growth: [0.22, 0.17, 0.14, 0.12],
    grossMargin: [0.52, 0.53, 0.54, 0.54, 0.55],
    rndPct: 0.1,
    sgaPct: 0.2,
    daPct: 0.04,
    capexPct: 0.04,
    taxRate: 0.21,
    debt2021: 3000,
    debtGrowth: 0,
    interestRate: 0.045,
    cash2021: 3800,
    ppeIntensity: 0.2,
    intangiblesPct: 0.7,
    dso: 35,
    dio: 0,
    dpo: 25,
    payout: 0.15,
    buybackPct: 0.5,
    dcf: { growthStart: 0.11, growthFinal: 0.06, marginTarget: 0.27 },
    evidence: [
      { id: "E1", document: DOC_10K, section: "Item 7 — Volume metrics", excerpt: "Total payment volume rose 16% to $1.24 trillion; take rate declined 2 basis points." },
      { id: "E2", document: DOC_10K, section: "Item 1A — Risk factors", excerpt: "Pricing competition in the enterprise segment has intensified." },
    ],
    bull: [
      { text: "Payment volume grew 16%, ahead of revenue growth.", kind: "fact", evidence: ["E1"], confidence: "high" },
      { text: "Embedded-payments mix shift could stabilise take rate.", kind: "interpretation", evidence: [], confidence: "low" },
    ],
    bear: [
      { text: "Take rate declined two basis points.", kind: "fact", evidence: ["E1"], confidence: "high" },
      { text: "Enterprise pricing competition is intensifying.", kind: "fact", evidence: ["E2"], confidence: "medium" },
    ],
    catalysts: [{ date: "2026-11-05", event: "Q3 FY2026 earnings release", kind: "fact" }],
    risks: [
      { label: "Take-rate compression", severity: 4, likelihood: 4, note: "−2bp YoY (E1)" },
      { label: "Regulatory interchange caps", severity: 3, likelihood: 2, note: "Analyst assumption" },
    ],
  },
  {
    ticker: "CRSL",
    name: "Corsair Logistics",
    exchange: "NYSE (illustrative)",
    sector: "Industrials",
    industry: "Freight & Contract Logistics",
    hq: "Memphis, TN",
    employees: 96500,
    description: "Asset-light freight brokerage plus contract warehousing and dedicated fleet services.",
    price: 141.3,
    dilutedShares2025: 210,
    shareDrift: 0.01,
    beta: 1.1,
    revenue2021: 21500,
    growth: [0.14, -0.08, 0.03, 0.05],
    grossMargin: [0.22, 0.23, 0.19, 0.2, 0.21],
    rndPct: 0,
    sgaPct: 0.12,
    daPct: 0.05,
    capexPct: 0.055,
    taxRate: 0.24,
    debt2021: 7800,
    debtGrowth: 0,
    interestRate: 0.05,
    cash2021: 1100,
    ppeIntensity: 0.45,
    intangiblesPct: 0.25,
    dso: 48,
    dio: 5,
    dpo: 32,
    payout: 0.3,
    buybackPct: 0.4,
    dcf: { growthStart: 0.05, growthFinal: 0.035, marginTarget: 0.095 },
    evidence: [
      { id: "E1", document: DOC_10K, section: "Item 7 — Segment results", excerpt: "Contract logistics revenue increased 11% while brokerage revenue declined 2% on lower spot rates." },
      { id: "E2", document: DOC_CALL, section: "Q&A", excerpt: "We believe the freight cycle troughed in the first half." },
    ],
    bull: [
      { text: "Contract logistics (more stable) grew 11%.", kind: "fact", evidence: ["E1"], confidence: "high" },
      { text: "Management believes the freight cycle has troughed.", kind: "interpretation", evidence: ["E2"], confidence: "low" },
    ],
    bear: [
      { text: "Brokerage revenue declined on lower spot rates.", kind: "fact", evidence: ["E1"], confidence: "high" },
      { text: "Margins remain cyclical and below FY2022 peak.", kind: "fact", evidence: [], confidence: "high" },
    ],
    catalysts: [{ date: "2027-01-28", event: "Q4 FY2026 earnings release", kind: "fact" }],
    risks: [
      { label: "Freight cycle", severity: 4, likelihood: 3, note: "Spot-rate exposure (E1)" },
      { label: "Leverage", severity: 3, likelihood: 2, note: "Computed: see balance sheet pillar" },
    ],
  },
  {
    ticker: "VRDA",
    name: "Veridian Power & Light",
    exchange: "NYSE (illustrative)",
    sector: "Utilities",
    industry: "Electric Utilities & Renewables",
    hq: "Columbus, OH",
    employees: 12400,
    description: "Regulated electric transmission and distribution plus a contracted renewable generation portfolio.",
    price: 58.4,
    dilutedShares2025: 520,
    shareDrift: -0.02,
    beta: 0.7,
    revenue2021: 11200,
    growth: [0.06, 0.03, 0.04, 0.05],
    grossMargin: [0.42, 0.41, 0.42, 0.43, 0.43],
    rndPct: 0,
    sgaPct: 0.18,
    daPct: 0.14,
    capexPct: 0.3,
    taxRate: 0.2,
    debt2021: 24000,
    debtGrowth: 0.06,
    interestRate: 0.045,
    cash2021: 600,
    ppeIntensity: 2.8,
    intangiblesPct: 0.3,
    dso: 45,
    dio: 30,
    dpo: 40,
    payout: 0.65,
    buybackPct: 0,
    dcf: { growthStart: 0.05, growthFinal: 0.035, marginTarget: 0.24, capexPct: 0.2 },
    evidence: [
      { id: "E1", document: DOC_10K, section: "Item 7 — Capital plan", excerpt: "Our five-year capital plan totals $21 billion, approximately 70% of which is recoverable through regulated rate base." },
      { id: "E2", document: DOC_10K, section: "Item 1 — Regulation", excerpt: "A pending rate case requests an allowed return on equity of 10.2%." },
    ],
    bull: [
      { text: "~70% of the capital plan earns a regulated return.", kind: "fact", evidence: ["E1"], confidence: "high" },
      { text: "Rate-base growth of 6–7% is achievable if the rate case is approved as filed.", kind: "assumption", evidence: ["E2"], confidence: "medium" },
    ],
    bear: [
      { text: "Leverage is high relative to EBITDA and rising with the capital plan.", kind: "fact", evidence: ["E1"], confidence: "high" },
      { text: "Rate case outcome is uncertain; requested ROE may be cut.", kind: "interpretation", evidence: ["E2"], confidence: "medium" },
    ],
    catalysts: [{ date: "2027-02", event: "Rate case decision (expected)", kind: "assumption" }],
    risks: [
      { label: "Regulatory outcome", severity: 4, likelihood: 3, note: "Requested ROE 10.2% (E2)" },
      { label: "Funding / leverage", severity: 4, likelihood: 3, note: "Negative FCF during build-out" },
      { label: "Rates sensitivity", severity: 3, likelihood: 4, note: "Long-duration equity" },
    ],
  },
  {
    ticker: "HLXB",
    name: "Helix Biologics",
    exchange: "NASDAQ (illustrative)",
    sector: "Health Care",
    industry: "Biotechnology",
    hq: "Cambridge, MA",
    employees: 9700,
    description: "Commercial-stage antibody therapeutics company with an immunology franchise and an oncology pipeline.",
    price: 128.4,
    dilutedShares2025: 260,
    shareDrift: 0.01,
    beta: 0.9,
    revenue2021: 4200,
    growth: [0.35, 0.12, -0.04, 0.16],
    grossMargin: [0.82, 0.83, 0.84, 0.84, 0.85],
    rndPct: 0.38,
    sgaPct: 0.26,
    daPct: 0.03,
    capexPct: 0.04,
    taxRate: 0.14,
    debt2021: 2400,
    debtGrowth: 0,
    interestRate: 0.04,
    cash2021: 5100,
    ppeIntensity: 0.3,
    intangiblesPct: 0.4,
    dso: 60,
    dio: 180,
    dpo: 45,
    payout: 0,
    buybackPct: 0.2,
    dcf: { growthStart: 0.12, growthFinal: 0.05, marginTarget: 0.25 },
    evidence: [
      { id: "E1", document: DOC_10K, section: "Item 1 — Products", excerpt: "Our lead immunology product represented 71% of product revenue; composition-of-matter patent expires in 2031." },
      { id: "E2", document: DOC_10K, section: "Item 1 — Pipeline", excerpt: "Phase 3 data for our oncology candidate are expected in the first half of 2027." },
    ],
    bull: [
      { text: "Phase 3 oncology readout in H1 2027 is a potential diversification event.", kind: "fact", evidence: ["E2"], confidence: "high" },
      { text: "Net cash balance sheet funds the pipeline without dilution.", kind: "fact", evidence: [], confidence: "high" },
    ],
    bear: [
      { text: "One product is 71% of product revenue, with patent expiry in 2031.", kind: "fact", evidence: ["E1"], confidence: "high" },
      { text: "Clinical success probability is inherently uncertain.", kind: "interpretation", evidence: ["E2"], confidence: "medium" },
    ],
    catalysts: [{ date: "2027-H1", event: "Phase 3 oncology data", kind: "fact" }],
    risks: [
      { label: "Product concentration", severity: 5, likelihood: 4, note: "71% from lead product (E1)" },
      { label: "Clinical risk", severity: 4, likelihood: 3, note: "Binary readout (E2)" },
    ],
  },
  {
    ticker: "BRKF",
    name: "Birchfield Consumer Brands",
    exchange: "NYSE (illustrative)",
    sector: "Consumer Staples",
    industry: "Household & Personal Products",
    hq: "Cincinnati, OH",
    employees: 41000,
    description: "Portfolio of household-cleaning, personal-care and pet-care brands sold through mass retail and e-commerce.",
    price: 71.2,
    dilutedShares2025: 640,
    shareDrift: 0.012,
    beta: 0.8,
    revenue2021: 16800,
    growth: [0.07, 0.05, 0.02, 0.03],
    grossMargin: [0.44, 0.41, 0.43, 0.45, 0.46],
    rndPct: 0.02,
    sgaPct: 0.24,
    daPct: 0.035,
    capexPct: 0.04,
    taxRate: 0.23,
    debt2021: 11500,
    debtGrowth: 0,
    interestRate: 0.042,
    cash2021: 1400,
    ppeIntensity: 0.4,
    intangiblesPct: 0.9,
    dso: 30,
    dio: 70,
    dpo: 75,
    payout: 0.6,
    buybackPct: 0.6,
    dcf: { growthStart: 0.03, growthFinal: 0.025, marginTarget: 0.19 },
    evidence: [
      { id: "E1", document: DOC_10K, section: "Item 7 — Net sales", excerpt: "Organic sales grew 3%, comprising 4 points of price/mix offset by a 1 point volume decline." },
    ],
    bull: [{ text: "Pricing power sustained: +4pts price/mix.", kind: "fact", evidence: ["E1"], confidence: "high" }],
    bear: [{ text: "Volumes declined one point — elasticity may be rising.", kind: "interpretation", evidence: ["E1"], confidence: "medium" }],
    catalysts: [{ date: "2027-01-22", event: "Q2 FY2027 earnings release", kind: "fact" }],
    risks: [{ label: "Private-label share gains", severity: 3, likelihood: 3, note: "Volume −1pt (E1)" }],
  },
  {
    ticker: "KSTL",
    name: "Keystone Materials",
    exchange: "NYSE (illustrative)",
    sector: "Materials",
    industry: "Specialty Chemicals & Aggregates",
    hq: "Pittsburgh, PA",
    employees: 22300,
    description: "Specialty coatings, construction chemicals and quarried aggregates for infrastructure markets.",
    price: 88.6,
    dilutedShares2025: 180,
    shareDrift: 0.015,
    beta: 1.25,
    revenue2021: 9600,
    growth: [0.19, -0.06, -0.03, 0.04],
    grossMargin: [0.31, 0.33, 0.28, 0.27, 0.29],
    rndPct: 0.02,
    sgaPct: 0.11,
    daPct: 0.07,
    capexPct: 0.075,
    taxRate: 0.24,
    debt2021: 5200,
    debtGrowth: 0,
    interestRate: 0.05,
    cash2021: 900,
    ppeIntensity: 0.8,
    intangiblesPct: 0.35,
    dso: 55,
    dio: 75,
    dpo: 45,
    payout: 0.35,
    buybackPct: 0.3,
    dcf: { growthStart: 0.05, growthFinal: 0.035, marginTarget: 0.17 },
    evidence: [
      { id: "E1", document: DOC_10K, section: "Item 7 — Outlook", excerpt: "Infrastructure-related backlog increased 14% year over year." },
    ],
    bull: [{ text: "Infrastructure backlog up 14%.", kind: "fact", evidence: ["E1"], confidence: "high" }],
    bear: [{ text: "Margins remain below FY2022 peak amid weak industrial demand.", kind: "fact", evidence: [], confidence: "high" }],
    catalysts: [{ date: "2026-11-12", event: "Q3 FY2026 earnings release", kind: "fact" }],
    risks: [{ label: "Input-cost volatility", severity: 3, likelihood: 4, note: "Energy & raw materials" }],
  },
];
