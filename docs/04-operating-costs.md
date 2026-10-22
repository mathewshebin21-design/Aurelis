# 04 · Estimated operating costs

All prices USD per month, checked 2026-10-22 against providers' public list prices where available; treat as estimates and re-check before committing. **No paid service will be enabled without your approval.**

## Infrastructure

| Component | Portfolio / demo tier | Light production tier |
|---|---|---|
| Next.js hosting (Vercel) | Hobby: $0 (non-commercial use only) | Pro: ~$20 per member |
| FastAPI (Render / Fly.io / Railway) | $0–7 (small instance; free tiers sleep) | ~$7–25 |
| Postgres + pgvector (Neon / Supabase) | $0 free tier (≈0.5 GB) | ~$19–25 |
| Object storage for filings and reports (Cloudflare R2) | $0 (10 GB free) | ~$1–5 |
| Scheduled ingestion (GitHub Actions cron) | $0 within free minutes | $0–5 |
| Monitoring (Sentry free, OpenTelemetry → Grafana Cloud free) | $0 | $0–29 |
| Domain | ~$1 (≈$12/yr) | ~$1 |
| **Subtotal** | **≈ $0–10** | **≈ $50–110** |

## Data

| Source | Cost |
|---|---|
| SEC EDGAR / XBRL, Treasury, FRED, Damodaran | $0 |
| End-of-day prices (free tier, illustrative label in public demo) | $0 |
| Licensed display of delayed prices (optional, later) | ~$30–100+ depending on provider and display rights |
| Earnings transcripts (optional) | Typically $100+; excluded unless approved |

## AI (Claude API)

List prices per million tokens (input / output): **Claude Haiku 5.5** $0.10 / $0.50 (prompts ≤100K tokens), **Claude Sonnet 5.5** $2 / $10, **Claude Opus 5.5** $4 / $20. Cache reads cost ~10% of input; Message Batches run at 50% off for non-urgent work.

Unit assumptions for one **research run** (thesis + risks + catalysts for one issuer): ~40K input tokens (retrieved chunks + computed facts, mostly cacheable across runs on the same filing) and ~4K output tokens.

| Route | Model (proposal — to be confirmed by evals) | Est. cost per run | 300 runs / month |
|---|---|---|---|
| Thesis, bull/bear, risk narrative | Claude Opus 5.5, `medium` effort | 40K × $4/M + 4K × $20/M ≈ **$0.24** (≈ $0.12 with cache hits) | ≈ $36–72 |
| Same on Claude Sonnet 5.5 | | ≈ **$0.12** (≈ $0.06 cached) | ≈ $18–36 |
| Section classification, chunk tagging, metadata extraction (batch) | Claude Haiku 5.5 via Batches | ≈ $0.002 per filing | < $1 |
| Embeddings | Open-source model run in the API container (e.g. a small sentence-transformer) or a hosted embedding API | ≈ $0–5 | ≈ $0–5 |

Thinking tokens are billed as output, so the real numbers depend on effort level; per-route measurement in Phase 4 will set the final model and effort. A hard monthly budget cap and per-user rate limits will be configured before any public AI feature.

## Totals

| Scenario | Monthly estimate |
|---|---|
| Portfolio demo (cached sample reports, a few dozen live runs) | **≈ $5–25** |
| Light production (≈300 research runs, paid hosting tiers) | **≈ $80–200** |
