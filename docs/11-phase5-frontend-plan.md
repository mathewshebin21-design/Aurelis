# 11 · Phase 5 frontend integration plan (Design C · Quant Research Lab)

Status: **plan approved for the non-blocked parts; implementation in progress** on `claude/phase-5-terminal`, stacked on PR #4.

## 1. Principles

1. **Design C stays the design.** The live product reuses Design C's shell, tokens, typography, panel grammar (instrument codes such as `H-01`, hairline panels, mono numerals) and chart components. The `/a`, `/b`, `/c` previews stay as the approved design reference, labelled illustrative. The live product is served from **`/terminal`** and is never restyled into a generic dashboard.
2. **No financial arithmetic in the UI.** Every number shown in `/terminal` comes from the API: statements, metrics, health score, DCF, WACC, sensitivity, scenarios and comps. The TypeScript engine in `web/src/lib/finance/` remains only for the illustrative previews and its parity test. An ESLint `no-restricted-imports` rule forbids importing it from live code. UI code may only *format* API values (Decimal strings → display) and arrange them.
3. **Facts, assumptions and interpretation stay separate on screen.** Each value carries its kind:
   - **Reported**: from a filing, linked to the accession and form.
   - **Computed**: engine output, showing its formula and inputs.
   - **Assumption**: user-entered and labelled as such.
   - **AI interpretation**: verified, flagged or rejected, with evidence.
4. **No invented data.** Missing values render as "Not reported" or "Not applicable" with the API's reason. There are no placeholder figures in live screens, and nothing illustrative is mixed into `/terminal`.

## 2. Backend contract audit

| Endpoint | Used by | Status | Action |
|---|---|---|---|
| `GET /v1/companies?q=` | Search, command palette | Typed | Add `has_data` and `last_ingested_at`, so not-yet-ingested issuers are shown honestly |
| `GET /v1/companies/{ref}` | Company header | Typed | — |
| `GET /v1/companies/{ref}/freshness` | Header freshness chip | Typed | — |
| `GET /v1/companies/{ref}/statements/{statement}` | Financials | Typed, with per-line provenance | — |
| `GET /v1/companies/{ref}/facts/{concept}` | Provenance drawer (all reported values, restatements) | Typed | — |
| `GET /v1/companies/{ref}/metrics` | Overview, Financials ratios | Typed (formula, inputs, assumptions, reason) | — |
| *(missing)* health score | Overview `H-01` panel | Only the TS preview | **Add** `GET /v1/companies/{ref}/scorecard`: port the five published pillars to `quant/score.py` with tests and oracle parity; financial-sector issuers get "not applicable" pillars and a re-based total |
| `GET /v1/companies/{ref}/dcf-inputs` | Valuation prefill | Typed | Add input validation on `ref` (was a bare `str`) |
| `POST /v1/valuation/dcf` | Valuation studio, sensitivity grid | Typed | — |
| `POST /v1/valuation/wacc` | WACC helper | **Untyped** | Add response model |
| `POST /v1/valuation/scenarios` | Scenarios | **Untyped** | Add response model |
| `POST /v1/valuation/comps` | Comps table | **Untyped** | Add response model |
| `GET /v1/companies/{ref}/research` and `GET /v1/research/runs/{id}` | Research and evidence inspector | **Untyped** | Add response models (claims, evidence excerpts, facts, metrics) |
| `GET /v1/companies/{ref}/research/facts` | "What the model was given" view | **Untyped** | Add response model |
| `GET /v1/companies/{ref}/filings/search?q=` | Evidence search | Typed | — |
| Admin endpoints (`/v1/admin/*`) | — | Token-guarded | **Never called from the browser.** Not exposed in Phase 5 UI |

Cross-cutting:
- **Contract source of truth:** FastAPI's OpenAPI document. `api/scripts/export_openapi.py` writes `shared/openapi.json`; `openapi-typescript` (a free dev dependency) generates `web/src/lib/api/schema.d.ts`. CI fails if either is stale.
- **Errors:** FastAPI returns `{"detail": ...}` with status codes 404 (unknown or not ingested), 409 (no statements or text), 422 (invalid assumptions, with the engine's message) and 503. The client maps these to typed results, and screens render each state on purpose.
- **CORS:** not needed. The browser never calls FastAPI directly (see §3).
- **Decimals:** numbers come back as strings, at full precision. They are parsed only for display formatting and charts, never for further calculation.

## 3. Frontend data architecture

```
Browser ──► Next.js (server components) ──server-side fetch──► FastAPI ──► PostgreSQL
   │                                                          ▲
   └── interactive calculators ──► /terminal/api/* route handlers (thin proxy, allow-listed paths) ──┘
```

- **Reads** (statements, metrics, scorecard, research) are fetched in server components with `AURELIS_API_URL`, which is a server-only variable. Caching uses Next's fetch cache with revalidation tied to data freshness.
- **Calculators** (DCF sliders, WACC, scenarios, comps) post to an allow-listed proxy route handler, which forwards the request body unchanged to `/v1/valuation/*`. Requests are debounced (about 250 ms), and stale responses are discarded with an abort controller. The engine does the maths; the UI shows "recalculating" rather than estimating.
- **Typed client** `web/src/lib/api/`: `getJson<Path>()` and `postJson<Path>()` are typed from `schema.d.ts` and return `{ok: true, data} | {ok: false, status, detail}`.
- **Local-only state** (until Phase 6 auth): the watchlist, saved scenarios and last-used assumptions live in `localStorage`, clearly labelled "saved on this device".

## 4. Screen → endpoint map (Design C panels)

| Screen (`/terminal/...`) | Panels | Endpoints |
|---|---|---|
| `search` | Ranked results; ingested vs not ingested; recent searches | companies?q |
| `company/[t]` Overview | Identity and freshness, key metrics strip (`M-01`), health score (`H-01`) with methodology, latest research summary, data-quality notes | company, freshness, metrics, scorecard, research |
| `company/[t]/financials` | Income, balance and cash-flow statements; FY/Q toggle; restated and derived markers; provenance drawer (concept, form, accession, filed date, prior values) | statements, facts/{concept}, metrics |
| `company/[t]/valuation` | DCF studio (prefill from filings, market inputs entered by the user and labelled), sensitivity grid, WACC helper, comps with user-entered market caps, warnings panel | dcf-inputs, valuation/dcf, valuation/wacc, valuation/comps |
| `company/[t]/scenarios` | Bear/base/bull built from DCF assumptions, probabilities, weighted value, per-scenario warnings; saved locally | valuation/scenarios |
| `company/[t]/research` | Claims by section with verdict badges; kind tags (fact, interpretation, assumption); open questions; "show rejected" toggle with reasons; model, prompt and engine versions | research, research/runs/{id}?include_rejected |
| Evidence inspector (side sheet on Research and Financials) | Excerpt with section, form, filed date, character offsets, sec.gov link; cited facts with formula and inputs; full-text filing search | research/runs/{id}, filings/search |
| `dashboard` / `watchlist` | Watchlist companies with freshness, score and key metrics | company, freshness, metrics, scorecard (per ticker, bounded) |

## 5. Milestones

| # | Milestone | Verification |
|---|---|---|
| 5.0 | Backend contract hardening: typed responses, `has_data`, `ref` validation, `quant/score.py` and scorecard endpoint, OpenAPI export | pytest (score bands, sector N/A, parity with the preview rules), ruff, mypy |
| 5.1 | Typed web client: generated schema, fetch wrappers, proxy route with allow-list, display formatters, lint rule banning `lib/finance` in live code | node:test (client error mapping, formatters, proxy allow-list), typecheck, CI drift check |
| 5.2 ✅ | `/terminal` shell in Design C, search, company header and freshness, overview | Playwright against a real API seeded with the synthetic fixture |
| 5.3 | Financials with provenance drawer | e2e: values match API, provenance opens with accession |
| 5.4 | Valuation studio (DCF, sensitivity, WACC, comps) | e2e: slider change → engine response rendered; 422 warnings shown |
| 5.5 | Scenarios | e2e: weighted value equals API's |
| 5.6 | Research and evidence inspector, filing search | e2e with a scripted research run; rejected claims visible only via the toggle, with reasons |
| 5.7 | Dashboard and watchlist, responsive and accessibility pass, docs, CHANGELOG 0.5.0 | Playwright at desktop and mobile widths, axe checks, screenshots for design review |

CI adds a `web-e2e` job: a Postgres service, the API started from source, a seed script that ingests the synthetic fixture through the real pipeline (no network), and Playwright run against `next build`. There are no paid services and no model calls in CI.

## 6. Unresolved blockers and decisions needed

| # | Blocker | Impact | Proposed handling |
|---|---|---|---|
| B1 | **Live AI acceptance test** needs your approval and `ANTHROPIC_API_KEY` | The Research screen has no real runs to show | Build and test it against scripted runs in CI; show an honest empty state in production until approved runs exist |
| B2 | **No licensed market data** (price, market cap, beta, risk-free rate) | DCF per-share vs price, comps and WACC need market inputs | Market inputs are entered by the user and labelled "assumption". No price is shown or implied. A licensed feed is a later, costed decision |
| B3 | **Accounts / auth** (Phase 6) | Watchlists and saved scenarios cannot sync across devices | `localStorage`, labelled as device-local |
| B4 | **Ingestion on demand** is admin-only | Public users cannot add new companies | Ship a curated, pre-ingested universe. Not-ingested issuers show "Data not yet available". A request queue comes after auth |
| B5 | **Hosting** for API and Postgres is not chosen | No public deployment yet | Local and CI only; hosting options and costs go to you before Phase 6 |
| B6 | **Open PR stack** #1–#4 is unmerged (Phase 5 would be the fifth level) | Review burden grows | Recommend merging #1–#4 after your review; Phase 5 rebases onto `main` with merge commits |
| B7 | Leftover `claude/...` branch in the unrelated Custom-Denim repo | None for AURELIS | You can delete it from GitHub |

## 7. Running the terminal locally

```bash
# API on the development database (ingest companies first: aurelis-api ingest AAPL MSFT JPM)
cd api && uv run aurelis-api serve --port 8000
# Web (production build)
cd web && npm run build && AURELIS_API_URL=http://127.0.0.1:8000 npx next start --port 3100   # → http://localhost:3100/terminal
# Terminal e2e (creates/re-seeds the aurelis_e2e database with synthetic data)
cd web && npx playwright test -c playwright.terminal.config.ts
```
