# 01 · Competitive product research

> Scope: publicly visible product patterns of established research platforms, studied for interaction ideas only. No proprietary designs, branding, layouts or datasets were copied. AURELIS uses its own visual language, its own names and an illustrative dataset of fictional companies.

## 1. Platforms reviewed

| Platform | Positioning | Strongest interface patterns | Strongest analytical capabilities | Gaps an AI-native entrant can address |
|---|---|---|---|---|
| **Bloomberg Terminal** | Institutional real-time data + news + execution | Command-line navigation (`TICKER <EQUITY> FUNCTION <GO>`), mnemonic function codes, multi-panel launchpads, extreme information density, keyboard-first | Breadth (every asset class), real-time data, relative value (RV), financial analysis (FA), DCF templates, BQL | Steep learning curve, dated visual language, roughly $25–32k per seat per year (public estimates), AI features are assistive and not evidence-graphed |
| **Koyfin** | "Bloomberg-lite" for advisors and analysts | Clean dashboards, saved layouts, flexible charting, watchlists with custom columns, snapshot pages | Fundamentals, estimates, macro charting, screeners, model portfolios | Limited explicit valuation modelling; AI layer is thin; claims are not linked to sources |
| **FinChat / Fiscal.ai** | AI copilot over fundamentals and transcripts | Chat-first research, KPI segment charts, citations back to filings and transcripts | Segment/KPI datasets, transcript search, AI answers with source links | Answers can blend facts and interpretation; arithmetic is sometimes performed by the model; limited scenario modelling |
| **TIKR** | Affordable fundamentals for retail and semi-pro | Dense financial-statement tables, multi-year views, simple valuation tab, guru holdings | Long history (10+ years), consensus estimates, simple valuation multiples | Light on interactivity in valuation; little scenario or risk tooling; no AI-traced narrative |
| **Institutional valuation tools** (sell-side DCF templates, valuation add-ins, PE/IB models) | Excel-native modelling | Driver-based assumptions, sensitivity tables (WACC × g), football-field charts, EV → equity bridges | Rigorous DCF/LBO/comps mechanics, audit trails in spreadsheets | Hard to share and review, error-prone formulas, no provenance on inputs, no narrative layer |

## 2. Patterns worth adopting (re-expressed, not copied)

1. **Command-driven navigation** → AURELIS ⌘K palette plus short function codes in Design A (`FA`, `DCF`, `SCN`, `THS`). Every preview has a palette.
2. **Snapshot → drill-down hierarchy** → company Overview → Financials → Valuation → Scenarios → Thesis tabs, each with stable URLs.
3. **Sensitivity tables and football fields** → live 5×5 WACC × g matrix and a valuation range chart driven by the same engine.
4. **Citations on AI answers** → extended to *typed claims*: every statement is labelled *sourced fact*, *assumption* or *AI interpretation*, with an evidence panel and an unsupported-claim flag.
5. **Saved layouts and watchlists** → watchlists in the preview; saved research sessions in Phase 5.
6. **Dense, tabular statements** → normalised statements with %-of-revenue toggle and a *source concept* column that shows the XBRL mapping.

## 3. Differentiated product strategy

**Positioning:** *"An evidence-bound investment research terminal. AI explains, the engine calculates, and every number can be traced back to its source."*

| Differentiator | What it means in the product | Why it's credible in a portfolio |
|---|---|---|
| **Separation of fact, assumption and interpretation** | Three claim types with distinct visual treatment; AI is never a source of numbers | Shows judgement about LLM failure modes in finance |
| **Deterministic, tested quant engine** | DCF, WACC, ratios and scores in pure functions with hand-verified unit tests (TS mirror now, Python system-of-record in Phase 3) | Demonstrates finance correctness, not just UI |
| **Provenance everywhere** | Each statement cell maps to a filing, an XBRL concept and an accession number (Phase 2); demo data is labelled | Mirrors institutional data-governance practice |
| **Transparent scoring** | Health score = five published threshold tables; methodology rendered in the UI | Avoids black-box "ratings" and regulatory risk |
| **Committee-ready output** | Design B's editorial format targets the investment-committee memo | Bridges MBA communication and engineering |

**Target users (portfolio narrative):** a buy-side analyst at a small fund, a private-wealth advisor preparing committee papers, and an MBA student learning valuation. **Non-goals:** real-time trading, order execution, personalised advice.

## 4. Risks and how the design handles them

- **Hallucinated numbers** → engine-only arithmetic; AI outputs are post-checked for numbers that don't appear in the computed facts or cited excerpts (Phase 4 evaluation).
- **Implied recommendations** → language rules ("screens attractive", "price above model value"), no buy/sell labels, and a disclaimer on every view.
- **Data licensing** → Phase 2 uses SEC EDGAR (US government public data) as the system of record for fundamentals; price data from a licensed provider is shown only within its terms (see `03-data-sources.md`).
