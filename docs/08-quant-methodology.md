# 08 · Quantitative engine methodology (Phase 3)

Code: `api/src/aurelis_api/quant/`. Engine version: `quant-1.0.0` (returned with every result).

## Principles

- **Deterministic.** Pure functions, `decimal.Decimal` with 34 significant digits, no floats, no clock, no randomness. The same inputs always give the same output.
- **Undefined is not zero.** A ratio with a missing input, or a zero or negative denominator where that makes no sense, returns `None` plus a stated reason. Examples: margin on non-positive revenue, ROE on negative equity, coverage with no interest expense.
- **Facts vs assumptions.** Metrics read only normalised filing data, and each result lists the exact statement lines used (with their reported / derived / missing status). Valuation endpoints echo every caller-supplied assumption, and any assumption the engine makes itself (such as the 21% statutory tax fallback) is listed. Data-quality caveats on input lines carry through to the metric, e.g. a partial debt total or a failed balance-sheet integrity check.
- **AI never calculates.** The Phase 4 research layer may only quote these outputs.

## Metrics (`metrics.py`, `ratios.py`)

| Metric | Formula | Undefined when |
|---|---|---|
| Revenue growth | revenue_t / revenue_{t−1} − 1 (consecutive fiscal years only) | prior revenue missing or ≤ 0 |
| Gross / operating / EBITDA / net / FCF margin | line / revenue | revenue ≤ 0 or line missing |
| EBIT | operating income | not reported (banks) |
| EBITDA | operating income + D&A | either missing |
| Free cash flow | CFO − \|capex\| | either missing |
| Effective tax rate | income tax / pre-tax income | pre-tax ≤ 0 or rate outside 0–100% |
| ROE | net income / average(opening, closing equity) | average equity ≤ 0 |
| ROIC | EBIT × (1 − tax) / average(debt + equity − cash) | invested capital inputs missing or ≤ 0. Tax = effective rate, else 21% statutory (stated) |
| Current ratio | current assets / current liabilities | unclassified balance sheet |
| Quick ratio | (cash + short-term investments + receivables) / current liabilities | missing inputs; absent STI counts as zero (stated) |
| Debt / equity, Debt / EBITDA, Net debt / EBITDA | as named; net debt = debt − cash − STI | denominator ≤ 0 |
| Interest coverage | EBIT / interest expense | no interest expense reported |

## Valuation (`dcf.py`, `valuation.py`)

- **CAPM:** k_e = r_f + β × ERP. **WACC:** E/V·k_e + D/V·k_d·(1 − t), using market-value weights.
- **FCFF:** EBIT·(1 − t) + D&A − CapEx − ΔNWC, with ΔNWC = NWC% × Δrevenue. Growth and margin fade linearly from year 1 to year N.
- **Discounting:** end of year; mid-year (t − 0.5) is optional. The terminal value is always discounted N full years.
- **Terminal value:** Gordon growth on FCFF_N (requires WACC > g), or an exit multiple on EBITDA_N. Each method reports the other as a cross-check (implied exit multiple, implied perpetual growth).
- **Equity bridge:** EV − net debt − minority interest − preferred + non-operating assets. Intrinsic value per share = equity value / diluted shares.
- **Warnings:**
  - terminal value above 75% of EV
  - final-year FCFF not positive
  - equity value not positive
  - terminal growth above 4%
- **Sensitivity:** value per share over a WACC × g grid; invalid cells (g ≥ WACC) are `null`.
- **Scenarios:** probability-weighted value; probabilities must sum to 1.
- **Comparables:**
  - EV = market cap + debt + minority interest + preferred − cash (cash includes short-term investments).
  - Multiples: EV/revenue, EV/EBITDA, EV/EBIT, P/E, P/B, FCF yield.
  - Peer statistics: 25th, 50th and 75th percentiles (Excel PERCENTILE.INC definition).
  - Implied value per share: the target's own metric × the peer multiple, less net debt for EV-based multiples.
  - Market caps are caller-supplied market inputs, because SEC filings contain no prices.

## API

`GET /v1/companies/{ref}/metrics` · `GET /v1/companies/{ref}/dcf-inputs` (filing-derived starting values, each with its source lines, plus the list of assumptions the caller must supply) · `POST /v1/valuation/dcf` (optional sensitivity grid) · `POST /v1/valuation/wacc` · `POST /v1/valuation/scenarios` · `POST /v1/valuation/comps`. Inputs are validated with bounds. Invalid combinations return 422 with the reason.

## Verification

| Check | Result |
|---|---|
| **Independent oracle:** `shared/fixtures/oracle.py` computes expected values with exact fractions (`fractions.Fraction`). It is written straight from the formulas and shares no code with either engine. Simple cases also show the hand-worked arithmetic. | Python engine matches to 1e-18; TypeScript preview engine matches to 1e-12 relative |
| **Behaviour tests:** undefined ratios, mid-year discounting, exit-multiple ↔ Gordon round trip, equity bridge, warnings, input validation, sensitivity monotonicity, scenario weighting, comps percentiles and implied values, metric traceability, caveat propagation | ✅ |
| **Property tests (Hypothesis, 300 generated cases):** EV strictly falls as WACC rises; EV = PV(FCFF) + PV(TV); equity = EV − net debt; terminal share in (0, 1) | ✅ |
| **API tests on the synthetic fixture issuer:** metrics with inputs and reasons, DCF inputs (no guessed tax rate), DCF / WACC / scenarios / comps endpoints, validation | ✅ |
| **Live check on real data:** Apple's FY2024 gross margin computed from SEC filings matches its published 46.2% | ✅ |

Real data also showed how the engine behaves on a bank (JPMorgan). Operating-company metrics such as gross margin, EBITDA and current ratio are correctly unavailable, each with a reason. Debt/equity carries a caveat because the debt total is only partially tagged.
