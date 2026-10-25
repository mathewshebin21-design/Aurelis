# 09 · AI research methodology (Phase 4)

Code: `api/src/aurelis_api/research/`. Prompt version `research-1.0`. Default model `claude-opus-5-5` at `medium` effort (configurable: `AURELIS_RESEARCH_MODEL`, `AURELIS_RESEARCH_EFFORT`).

## Design: the model writes, the engine and the verifier decide

```
SEC filing HTML ──► plain text ──► Item sections ──► chunks (char offsets) ──► PostgreSQL full-text index
                                                                                     │
normalised statements ──► quant engine ──► computed facts [F1…] ──┐                  │ topic queries
                                                                 ├──► prompt ──► Claude (structured JSON)
                                    filing passages [E…] ────────┘                    │
                                                                                     ▼
                                                     deterministic verifier ──► stored claims + verdicts
```

1. **Filing text** (`text.py`, `documents.py`). The primary 10-K/10-Q document is fetched under the same SEC fair-access client, converted to text (inline-XBRL headers and hidden blocks removed) and split into Item sections. The splitter picks the body occurrence of each heading rather than the table-of-contents line, keeps form order (10-Q Part I/II reuse item numbers), and falls back to "full document" for annual-report layouts where items appear only in a cross-reference index (e.g. JPMorgan). Chunks of about 1,500 characters overlap by 200 and start on word boundaries. Character offsets point back into the stored text.
2. **Retrieval.** PostgreSQL full-text search over chunks, matching any of the query's terms and ranked by `ts_rank_cd`, with table-heavy chunks down-weighted in favour of narrative text. One query per research topic covers business, risks, results, margins, liquidity, competition, outlook and concentration. Results come from the latest annual and quarterly reports, de-duplicated, up to 24 passages. It is deterministic, explainable and free. A pgvector index can be added alongside without changing callers.
3. **Computed facts** (`facts.py`): statement values and engine metrics for the latest two fiscal years, plus the latest quarter versus the same quarter a year earlier (earnings analysis). Peer facts are added for competitor research. Each fact has an id, a display string and its source. These are the **only numbers the model may use**; `GET /v1/companies/{ref}/research/facts` shows them.
4. **Generation** (`prompt.py`, `llm.py`). The system prompt defines three claim kinds (*fact*, *interpretation*, *assumption*), forbids arithmetic and advice, and asks for open questions instead of guesses. The output is constrained by a JSON schema; each claim carries section, kind, text, confidence, evidence ids, fact ids and optional verbatim quotes. The client uses Anthropic's server-side refusal fallback, checks `stop_reason` before reading content, and never stores truncated output.
5. **Verification** (`verify.py`). It is deterministic and runs on every claim before anything is shown. Each claim is rejected, flagged or verified:

| Check | Effect |
|---|---|
| Cited id not in the prompt | reject (`unknown_reference`) |
| `fact` with no citation | reject (`unsupported_fact`) |
| Number in a fact or interpretation that matches no cited fact (within its displayed rounding) and appears in no cited passage | reject (`unverified_number`). This catches invented figures *and* the model's own arithmetic |
| Quote not found verbatim in a cited passage | reject for facts, flag otherwise (`quote_not_found`) |
| Guarantee language | reject |
| `interpretation` with no citation | flag (`unsupported_interpretation`) |
| Figure inside an `assumption` | flag (`assumed_figure`), so it is never read as reported data |
| Year not present in cited sources | flag (`unverified_year`) |
| Advisory language (buy/sell, price targets) | flag |

6. **Storage and API.**
   - Runs keep the model, engine version, prompt version, the full fact list, evidence ids, open questions, metrics and token usage.
   - Each claim keeps its verdict and issues.
   - `GET /v1/companies/{ref}/research` publishes verified and flagged claims, each with evidence excerpts (form, filed date, section, character offsets, sec.gov URL) and the facts behind it. Rejected claims stay in the audit trail and are counted, but are hidden unless `include_rejected=true` is passed.

## Evaluation

- **Verifier benchmark** (`tests/test_verify.py`): 21 hand-labelled claims covering legitimate rounding ($391.0 billion vs USD 391,035 million; 46% vs 46.2%), fabricated numbers, hidden arithmetic (a "0.6 percentage point" margin change computed from two cited margins), missing and fake citations, invented quotes, guarantees, advice and unsupported interpretations. **Accuracy 21/21; rejection precision and recall 1.0.**
- **Real-data dry run (Apple):** 44 computed facts, 24 retrieved passages, a prompt of about 10,000 tokens (≈ $0.10 per run on Claude Opus 5.5 by list price). The verifier accepts a correct FY2025 gross margin (46.9%), rejects a fabricated 48.5%, and accepts a tariff interpretation citing the 10-Q.
- **Live parser tests:** real Apple and Nvidia 10-Ks split into substantive Risk Factors and MD&A sections.
- **Live AI evaluation: pending.** No `ANTHROPIC_API_KEY` is configured in the development environment, and paid API use needs approval. Once enabled, `aurelis-api research TICKER` produces stored runs and `aurelis-api eval-citations` reports aggregate verification rates (verified / flagged / rejected share, unsupported-claim rate, share of numbers verified against sources).
