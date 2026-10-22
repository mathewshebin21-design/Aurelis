# Changelog

All notable changes to AURELIS. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow the project phases.

## [0.1.0] — 2026-10-22 · Phase 1: research, architecture and design previews

### Added
- Competitive research, architecture, data-source licensing review, cost estimate, roadmap and design recommendation (`docs/`).
- Next.js 16 + TypeScript + Tailwind CSS 4 + shadcn/ui-style components (Radix primitives) + Motion app with three complete design concepts:
  - **A · Institutional Terminal** (`/a`), **B · Private Wealth** (`/b`), **C · Quant Research Lab** (`/c`), plus a comparison hub at `/`.
  - Each concept: landing page, ⌘K company search and search page, executive dashboard, company research page, financial statements, interactive valuation workspace, scenario analysis, investment thesis panel, watchlist and responsive navigation.
- Deterministic TypeScript finance engine (`src/lib/finance`): growth, CAGR, margins, EBITDA, FCF, ROE, ROIC, current/quick ratios, debt/equity, debt/EBITDA, net debt/EBITDA, interest coverage, EV, CAPM, WACC, FCFF DCF, Gordon terminal value, sensitivity matrix, probability-weighted scenarios, rule-based health score and valuation signal.
- Illustrative dataset of eight **fictional** issuers with internally consistent statements (balance sheet balances, cash flow reconciles), clearly labelled throughout the UI.
- Unit tests with hand-worked expected values (`tests/finance.test.ts`) and Playwright browser tests covering every preview route on desktop and mobile (`e2e/`).
- Chart palettes for each design validated for colour-vision deficiency, lightness band and contrast.
