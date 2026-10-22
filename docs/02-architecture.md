# 02 · Proposed architecture

## Principles

1. **The engine calculates; AI explains.** Every number shown comes from deterministic, tested Python. LLM output is restricted to text that cites computed facts and filing excerpts.
2. **Provenance is data.** Each fact stores where it came from; the UI can always answer "where did this number come from?"
3. **Boring, cheap infrastructure.** Postgres (with pgvector) does relational, time-series and vector work; no separate vector DB or queue until load proves the need.
4. **Modular monolith first.** One FastAPI service with clear internal packages; split only when a module needs independent scaling.

## System overview

```
            ┌──────────────────────────── Next.js 16 (App Router, TS) ────────────────────────────┐
 Browser ──▶│  RSC pages · client islands (valuation, scenarios) · shadcn/ui · Motion · ⌘K search │
            │  BFF route handlers: session cookie → API JWT, input validation (zod), caching       │
            └───────────────────────────────┬──────────────────────────────────────────────────────┘
                                            │ HTTPS (JSON, OpenAPI-typed client)
            ┌───────────────────────────────▼──────────── FastAPI (Python 3.12) ──────────────────┐
            │ api/         routers, auth deps, pydantic v2 schemas, rate limits                     │
            │ ingest/      EDGAR client (UA, 10 rps limiter, retries) · XBRL → facts · filings text │
            │ normalize/   concept mapping · units/currency · fiscal calendars · restatements       │
            │ quant/       metrics · dcf · wacc · comps · scenarios · health score  (pure, tested)  │
            │ research/    chunking · embeddings · retrieval · claim generation · citation checker  │
            │ reports/     IC memo builder (HTML → PDF)                                             │
            │ workspace/   users, workspaces, watchlists, saved sessions, audit log                 │
            └──────┬──────────────────────┬──────────────────────────┬───────────────────────────┘
                   │                      │                          │
          Postgres 16 + pgvector   Object storage (filings,     Anthropic API (Claude)
          (facts, filings meta,     rendered reports)           behind a provider interface
           embeddings, workspace)
                   ▲
          Scheduled jobs (GitHub Actions cron or platform cron): nightly EDGAR sync, freshness checks
```

## Data model (core tables)

| Table | Key columns | Notes |
|---|---|---|
| `issuer` | `cik` PK, name, tickers[], sic, fiscal_year_end, currency | Ticker history kept in `issuer_ticker(valid_from, valid_to)` |
| `filing` | accession PK, cik, form, filed_at, period_end, url, sha256 | Immutable |
| `fact` | id, cik, concept, value numeric(28,6), unit, period_start/end, fy, fp, accession, decimals, `superseded_by` | As-reported, never overwritten |
| `normalized_line` | cik, statement, line_key, fy, fp, value, unit, `source_fact_ids[]`, `rule_id` | The view the UI and quant engine read |
| `metric_snapshot` | cik, as_of, metric, value, `engine_version`, `inputs_hash` | Cache of engine outputs, reproducible by hash |
| `chunk` | id, accession, section, text, embedding vector(…), char_start/end | RAG units; citations point here |
| `claim` | id, session_id, kind (fact/assumption/interpretation), text, confidence, `evidence_chunk_ids[]`, `fact_refs[]`, check_status | Evidence-to-claim traceability |
| `workspace`, `member`, `watchlist`, `research_session`, `audit_event` | | Row-level authorization by workspace |

## Quant engine (Phase 3)

- Pure functions over `Decimal` or `float64` with explicit rounding at presentation only.
- Conventions documented and versioned (`engine_version`): end-of-year discounting by default, Gordon growth terminal value on final-year FCFF, ΔNWC on incremental revenue, EV = market cap + debt − cash (leases and minorities configurable).
- Tests: hand-worked examples (like the TS mirror in `tests/finance.test.ts`), property tests (Hypothesis: monotonicity in WACC, g), and golden files for each normalised issuer.
- The TypeScript mirror in this preview (`src/lib/finance`) is kept for instant client-side interactivity; a parity test will compare TS and Python outputs on shared fixtures.

## AI research pipeline (Phase 4)

1. **Retrieve**: hybrid search (pgvector + Postgres full-text) over chunked 10-K/10-Q/8-K sections for the issuer and period.
2. **Compute**: the quant engine produces a *computed facts* block (numbers with IDs).
3. **Generate**: Claude returns structured output (JSON schema) of claims: `{kind, text, evidence_chunk_ids, fact_refs, confidence}`. The model is instructed never to compute; it may only quote numbers from the facts block or cited text.
4. **Verify**: a deterministic checker extracts every number in each claim and requires it to match a referenced fact or appear verbatim in a cited chunk; claims of kind *fact* without evidence are rejected; interpretations without evidence are flagged as unsupported.
5. **Evaluate**: an offline eval set measures citation precision/recall and unsupported-claim rate per release.

## Security (Phase 6)

Auth.js (or a managed provider) with httpOnly session cookies; the BFF exchanges for a short-lived JWT to FastAPI; every query scoped by `workspace_id`; zod on the edge and pydantic in the API; secrets only in platform env vars; CSP and rate limiting; Alembic migrations; structured logging + OpenTelemetry traces; Playwright and pytest in CI.

## Repository layout (target)

```
.
  web/        Next.js app (this preview grows into it)
  api/        FastAPI service (uv, ruff, mypy, pytest)
  packages/   shared OpenAPI-generated TS client
  infra/      docker-compose (Postgres + pgvector), deployment manifests
  docs/       research, architecture, ADRs, methodology, case study
```

The Phase 1 preview sits at the repository root today; Phase 2 moves it to `web/` when the API is introduced.
