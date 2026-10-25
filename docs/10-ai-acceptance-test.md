# 10 · Live AI research acceptance test

**Status: prepared, not run.** Nothing has been spent. The live run needs (1) your explicit approval and (2) `ANTHROPIC_API_KEY` set in the environment that runs it.

Code: `api/src/aurelis_api/research/{acceptance,budget,evaluation}.py`. Command: `aurelis-api acceptance-test`.

## What it does

For Apple (AAPL), Microsoft (MSFT) and JPMorgan (JPM):

1. Ingest real SEC XBRL statements and the latest 10-K and 10-Q text (free SEC data).
2. Build the computed facts with the Phase 3 engine and retrieve filing passages, as in production research.
3. Make **one** research call per company to `AURELIS_RESEARCH_MODEL` (default `claude-opus-5-5`, effort `medium`, `max_tokens` 10,000), wrapped in the spending guard.
4. Store the run and claims with the deterministic verifier's verdicts, then evaluate every claim and write a report to `docs/evaluations/acceptance-<UTC timestamp>.{md,json}`.

## Spending limit ($2 total, hard stop)

- **Before each call** the guard reserves a worst case: the exact input size from the free token-counting endpoint (×1.1 + 200), plus full `max_tokens` of output, priced at the dearer of the requested model and the refusal-fallback model, times two attempts (a declined attempt plus its fallback). If `spent + reservation > limit`, **the call is not made** and the run stops. No later company is attempted.
- **After each call** the actual cost is computed from the API's reported `usage` (per-attempt `iterations` when a fallback happened; cache reads and writes priced separately) and written to the `ai_usage` ledger with the actual latency, the served model and the status.
- **Accounting:** refusals and truncations are billed from their usage. A failure with unknown outcome (e.g. a network reset) books the **full reservation**, so the limit can never be overrun by an unseen charge. A missing API key makes no request and records nothing.
- **Persistence:** spend is persisted under the key `acceptance-test`, so re-running the command cannot reset or exceed the $2 total.
- **Prices:** prices are Anthropic list prices per million tokens (Opus 5.5: $4 input, $20 output). An unknown model id is charged at the highest known rate, never at zero.

Dry run on real data (2026-10-25, no model calls):

| Company | Facts | Passages | Input tokens (estimate) | Worst-case reservation |
|---|---|---|---|---|
| AAPL | 44 | 24 | ~14,000 | $0.656 |
| MSFT | 46 | 23 | ~14,000 | $0.656 |
| JPM | 24 | 23 | ~13,100 | $0.646 |
| **Total** | | | | **$1.958** (fits under $2.00) |

These are reservations, not costs. Actual costs and latency are reported only from the live run's ledger. The JPM fact set is smaller because bank statements have no gross margin, inventory or similar lines; the engine reports those as not applicable rather than inventing them.

## Evaluation of each claim

| Dimension | How it is measured |
|---|---|
| Source validity | Every cited id exists in the prompt. The cited passages and facts share substantive terms with the claim, or contain its numbers; otherwise the claim is listed as a *weak-source claim* |
| Numerical accuracy | Each number in a claim is checked against cited facts (within displayed rounding) or cited passage text. Reported as verified / checked |
| Quotation accuracy | Each quote is found verbatim (whitespace- and quote-normalised) in a cited passage |
| Completeness | Sections covered by non-rejected claims. Required: summary, bull, bear, risk. Open questions are counted |
| Unsupported assertions | Claims rejected or flagged as unsupported, or containing an unverified number |
| Interpretation quality | Automated: citation share of interpretations, direction consistency (e.g. "grew" while citing a negative growth fact), bull/bear balance, advisory or guarantee language. A human rubric (accuracy, insight, balance, clarity on a 1–5 scale) is left blank for a reviewer and is never auto-scored |

The report lists **every claim, including rejected ones with their reasons**, plus the cited excerpts. It also confirms that re-verification reproduces the stored verdicts.

## Running it

```bash
# free: ingest + size prompts + show worst-case reservations
AURELIS_SEC_USER_AGENT="Name email@example.com" uv run aurelis-api acceptance-test

# paid, only after approval, with the key in the environment (never in the repo)
export ANTHROPIC_API_KEY=...        # or set it as an environment secret
uv run aurelis-api acceptance-test --live --approve-spend --budget-usd 2
```

`--live` without `--approve-spend`, or without a key, refuses to run.
