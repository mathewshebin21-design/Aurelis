# AURELIS — AI Investment Intelligence Terminal

> **Status: Phase 4 (evidence-bound AI research).** Design C (Quant Research Lab) has been selected. The web previews still run on a clearly labelled **fictional** dataset. The API ingests real SEC EDGAR data with full provenance.

AURELIS is an evidence-bound equity research workspace: a deterministic engine does the calculations, the AI layer explains them with citations, and every number can be traced back to its source.

## Repository layout

```
web/    Next.js 16 front end (design previews; Design C becomes the product UI in Phase 5)
api/    FastAPI service: SEC EDGAR ingestion, normalisation, provenance, freshness (Python 3.12, uv)
docs/   research, architecture, data sources, costs, roadmap, design decision, data methodology
```

## Run the API (Phase 2)

Requirements: Python 3.12+, [uv](https://docs.astral.sh/uv/), PostgreSQL 15+ (or `docker compose up -d db`).

```bash
cd api
cp .env.example .env          # set AURELIS_SEC_USER_AGENT to "Your Name you@example.com"
uv sync
uv run alembic upgrade head
uv run aurelis-api ingest AAPL MSFT     # fetch from SEC EDGAR and normalise
uv run aurelis-api serve                # http://127.0.0.1:8000/docs (OpenAPI)
```

Examples:
- `GET /v1/companies/AAPL/statements/income?period=FY&limit=5`: every line carries its source concept, accession number, filing date and document URL, or the rule that derived it.
- `GET /v1/companies/AAPL/metrics`: margins, returns, liquidity, leverage and coverage, each with its formula, inputs and any stated assumption.
- `GET /v1/companies/AAPL/research`: AI-written bull/bear, risk, catalyst, earnings and competition claims. Every claim is labelled fact, assumption or interpretation, cited to filing passages or computed facts, and checked by a deterministic verifier (`aurelis-api ingest-text AAPL`, then `aurelis-api research AAPL`; needs `ANTHROPIC_API_KEY`).
- `POST /v1/valuation/dcf`: deterministic DCF with an optional WACC × g sensitivity grid. See `/docs` for the WACC, scenario and comparables calculators.

## Run the design previews

Requirements: Node.js ≥ 20.

```bash
cd web
npm install
npm run dev            # http://localhost:3100
```

## Preview URLs

Open **http://localhost:3100/** for the comparison hub, which links every page of every design. To compare designs, open the same path under `/a`, `/b` and `/c`.

| Page | Design A · Terminal | Design B · Private Wealth | Design C · Quant Lab |
|---|---|---|---|
| Landing | `/a` | `/b` | `/c` |
| Company search (also ⌘K / Ctrl-K anywhere) | `/a/search` | `/b/search` | `/c/search` |
| Executive dashboard | `/a/dashboard` | `/b/dashboard` | `/c/dashboard` |
| Company research | `/a/company/NWSC` | `/b/company/NWSC` | `/c/company/NWSC` |
| Financial statements | `/a/company/NWSC/financials` | `/b/company/NWSC/financials` | `/c/company/NWSC/financials` |
| Valuation workspace | `/a/company/NWSC/valuation` | `/b/company/NWSC/valuation` | `/c/company/NWSC/valuation` |
| Scenario analysis | `/a/company/NWSC/scenarios` | `/b/company/NWSC/scenarios` | `/c/company/NWSC/scenarios` |
| Investment thesis | `/a/company/NWSC/thesis` | `/b/company/NWSC/thesis` | `/c/company/NWSC/thesis` |
| Watchlist | `/a/watchlist` | `/b/watchlist` | `/c/watchlist` |

Illustrative tickers: `NWSC`, `MRDN`, `ALTP`, `CRSL`, `VRDA`, `HLXB`, `BRKF`, `KSTL`. Resize the window or use device emulation to check the responsive navigation.

## Checks

```bash
# API
cd api
uv run ruff check . && uv run mypy src
uv run pytest            # unit + PostgreSQL integration (AURELIS_TEST_DATABASE_URL)
uv run pytest -m live    # real SEC EDGAR checks (needs network + AURELIS_SEC_USER_AGENT)

# Web
cd web
npm run typecheck      # TypeScript
npm run lint           # ESLint (next/core-web-vitals)
npm test               # finance engine unit tests (node:test, hand-verified values)
npm run test:e2e       # Playwright: every route × desktop/mobile, slider + ⌘K interactions, 404s
                       # (in containers with a preinstalled Chromium: PW_CHROMIUM=/path/to/chrome npm run test:e2e)
```

## Web project structure (`web/`)

```
src/app/                    routes: / (hub), /[design] (landing), /[design]/(app)/… (shelled pages)
src/components/shells/      navigation shells for each design (A rail+tape, B masthead, C sidebar)
src/components/landing/     the three landing pages
src/components/features/    dashboard, statements, valuation studio, scenarios, thesis, search, watchlist
src/components/charts/      dependency-free SVG charts with hover layers
src/components/ui/          shadcn/ui-style primitives (Radix)
src/lib/finance/            deterministic engine: metrics.ts, dcf.ts, score.ts
src/lib/data/               illustrative dataset (companies.ts) and derived statements (build.ts)
tests/                      unit tests        e2e/  Playwright tests        docs/  deliverables
```

## Documents

1. [Competitive product research](docs/01-competitive-research.md)
2. [Proposed architecture](docs/02-architecture.md)
3. [Data sources, licensing and reliability](docs/03-data-sources.md)
4. [Estimated operating costs](docs/04-operating-costs.md)
5. [Implementation roadmap](docs/05-roadmap.md)
6. [Design comparison and recommendation](docs/06-design-recommendation.md) (Design C selected)
7. [Financial data methodology](docs/07-data-methodology.md)
8. [Quantitative engine methodology](docs/08-quant-methodology.md)
9. [AI research methodology](docs/09-research-methodology.md)
10. [Live AI research acceptance test](docs/10-ai-acceptance-test.md) (prepared; awaiting approval)
11. [Phase 5 frontend integration plan](docs/11-phase5-frontend-plan.md) (Design C live terminal)
10. [Changelog](CHANGELOG.md)

## Disclaimer

AURELIS is a portfolio project. Model outputs are illustrations under stated assumptions. They are not forecasts, ratings or investment advice, and they do not imply any return.
