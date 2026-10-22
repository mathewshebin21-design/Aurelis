# 05 · Implementation roadmap

Each milestone ends with a verification gate; work does not proceed until the gate passes.

| Phase | Scope | Key deliverables | Verification gate |
|---|---|---|---|
| **1 · Research & previews** ✅ (Design C selected) | Research, architecture, three interactive design concepts | This folder; `/a`, `/b`, `/c` previews; TS finance engine + tests | Typecheck, lint, 12 unit tests, Playwright route/interaction suite, visual review — **awaiting design selection** |
| **2 · Financial data** ✅ (live SEC verification pending network access) | EDGAR + XBRL ingestion, normalisation, provenance | `api/ingest`, `api/normalize`, Postgres schema + Alembic, freshness tracker, restatement handling, ticker/CIK lookup | Golden-file tests for 10 real issuers reconciled to filed statements; balance-sheet identity and cash-flow tie-out checks; source link for every cell |
| **3 · Quant engine** | Python system of record for every metric in the brief | `api/quant` with ratios, EBITDA/EBIT, FCF, ROE/ROIC, liquidity, leverage, coverage, EV/equity, WACC, DCF, TV, sensitivities, comps | Hand-verified examples, Hypothesis property tests, TS↔Python parity test, ≥95% branch coverage on `quant/` |
| **4 · AI research** | Filing RAG, earnings analysis, typed claims, citation checker | Retrieval, structured claim generation, deterministic number/citation verifier, unsupported-claim detection | Eval set: citation precision ≥ 0.95, zero un-sourced numbers in *fact* claims, unsupported-claim rate reported per release |
| **5 · Advanced analytics** | DCF studio, scenarios, peers, watchlists, hypothetical portfolios, health score, risk dashboard, saved sessions, IC reports | Productionised versions of the preview features backed by the API; PDF memo export | Scoring rules unit-tested; reports reproducible from `inputs_hash`; no return guarantees anywhere in copy |
| **6 · Hardening & launch** | Auth + workspace authz, validation, migrations, observability, CI/CD, docs | GitHub Actions (lint, types, pytest, vitest/node tests, Playwright), deployment guide, README, case study | Security review checklist, authz tests per endpoint, green CI on main, deployed demo URL |

**Indicative effort:** Phase 2 ≈ 1.5–2 weeks · Phase 3 ≈ 1 week · Phase 4 ≈ 2 weeks · Phase 5 ≈ 2 weeks · Phase 6 ≈ 1 week (one engineer, focused).
