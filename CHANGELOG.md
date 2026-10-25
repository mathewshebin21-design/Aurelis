# Changelog

All notable changes to AURELIS. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow the project phases.

## [0.3.0] — 2026-10-25 · Phase 3: quantitative engine

### Added
- `api/src/aurelis_api/quant/`: a deterministic Decimal engine (`quant-1.0.0`) covering:
  - growth, margins, EBIT/EBITDA, free cash flow, effective tax rate, ROE, ROIC
  - current and quick ratios, debt/equity, debt/EBITDA, net debt/EBITDA, interest coverage
  - CAPM, WACC, FCFF DCF with fades, mid-year option, Gordon and exit-multiple terminal values with cross-checks
  - equity bridge, intrinsic value per share, sensitivity grids, probability-weighted scenarios
  - EV, multiples, peer percentiles and implied values
- Metrics computed from SEC-normalised statements, each with its formula, input lines (with status), stated assumptions and a reason when undefined. Data-quality caveats on inputs carry through to the metric.
- Endpoints: `/v1/companies/{ref}/metrics`, `/v1/companies/{ref}/dcf-inputs`, `/v1/valuation/{dcf,wacc,scenarios,comps}`.
- `shared/fixtures/oracle.py`: an independent exact-fraction oracle. Both the Python and the TypeScript engines are tested against its output (`quant-cases.json`).
- Tests: 92 non-live (oracle parity, behaviour, Hypothesis properties, API) plus 6 live, including Apple's FY2024 gross margin vs. its published 46.2%. Web: 4 new parity tests (16 total).
- `docs/08-quant-methodology.md`.

## [0.2.0] — 2026-10-22 · Phase 2: financial data architecture

### Added
- `api/`: FastAPI service (Python 3.12, SQLAlchemy 2, PostgreSQL, Alembic):
  - SEC EDGAR client with declared User-Agent, 8 req/s rate limiting, retries with `Retry-After`, conditional GET.
  - Ticker/CIK lookup with ticker history; issuer profiles and filing index from SEC submissions.
  - As-reported XBRL fact store (idempotent) and normalised income, balance-sheet and cash-flow lines with provenance (concept, accession, form, filed date, document URL).
  - Concept mapping with priority fallbacks; currency/unit validation; 52/53-week fiscal calendars; quarterly derivation from YTD figures; derived lines with rule IDs; explicit missing-data rows.
  - Restatement detection (latest vs originally reported, with cause classification) and stock-split handling (XBRL detection plus manual overrides).
  - Data-freshness assessment (sync status and expected-filing deadlines).
  - Endpoints: company search and profile, statements, as-reported fact history, freshness, guarded ingest trigger and ingest-run log; CLI `aurelis-api ingest|serve|sync-tickers`.
  - 57 tests: unit tests, a synthetic fixture issuer with hand-worked expectations, and PostgreSQL integration tests including migration up/down. Live SEC tests (`-m live`) for five real issuers pass.
- `docs/07-data-methodology.md`, `docker-compose.yml` (PostgreSQL 16 + pgvector), `api/.env.example`, GitHub Actions CI for `api/` and `web/`.

### Changed
- Repository split into `web/` (Next.js) and `api/` (FastAPI). Design C selected as the product direction.

### Fixed
- Statements are built only from periodic reports (10-K/10-Q/20-F/40-F and amendments). Found on real data: JPMorgan's proxy statement (rounded pay-versus-performance figures) was overriding audited 10-K net income.
- Split-cause classification now tolerates re-rounded per-share values (Nvidia 1.74 → 0.17).
- Balance-sheet integrity check: periods where total assets ≠ total liabilities & equity are flagged on both lines, naming the filings involved.
- Company search prefers issuers with ingested data and closer name matches ("apple" → Apple Inc.).
- Instant (balance-sheet) facts could be stored twice on re-ingest because PostgreSQL treats NULL start dates as distinct; the unique constraint now uses `NULLS NOT DISTINCT`.

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
