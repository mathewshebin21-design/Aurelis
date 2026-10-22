# AURELIS — AI Investment Intelligence Terminal

> **Status: Phase 1. Design previews are awaiting selection.** Every company, ticker, price, filing excerpt and figure in this build is **fictional** and exists only to evaluate the interface.

AURELIS is an evidence-bound equity research workspace: a deterministic engine does the calculations, the AI layer explains them with citations, and every number can be traced back to its source.

## Run the previews

Requirements: Node.js ≥ 20.

```bash
npm install
npm run dev            # http://localhost:3100
# or a production build:
npm run build && npm start
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
npm run typecheck      # TypeScript
npm run lint           # ESLint (next/core-web-vitals)
npm test               # finance engine unit tests (node:test, hand-verified values)
npm run test:e2e       # Playwright: every route × desktop/mobile, slider + ⌘K interactions, 404s
                       # (in containers with a preinstalled Chromium: PW_CHROMIUM=/path/to/chrome npm run test:e2e)
```

## Project structure

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
6. [Design comparison and recommendation](docs/06-design-recommendation.md)
7. [Changelog](CHANGELOG.md)

## Disclaimer

AURELIS is a portfolio project. Model outputs are illustrations under stated assumptions. They are not forecasts, ratings or investment advice, and they do not imply any return.
