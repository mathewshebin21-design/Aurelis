# 07 · Financial data methodology (Phase 2)

How AURELIS turns SEC filings into comparable financial statements. The code lives in `api/src/aurelis_api/`; each rule below names its module.

## 1. Sources and access (`edgar/`)

| Data | Endpoint | Use |
|---|---|---|
| Ticker ↔ CIK map | `www.sec.gov/files/company_tickers_exchange.json` | Lookup; ticker history kept in `issuer_ticker` (retired tickers marked `is_current = false`) |
| Issuer profile and filing index | `data.sec.gov/submissions/CIK##########.json` | Name, SIC, **fiscal year end**, filings with accession numbers and document URLs |
| XBRL facts | `data.sec.gov/api/xbrl/companyfacts/CIK##########.json` | Every non-dimensional fact the issuer has tagged, in every filing |

Fair access: every request carries a User-Agent with contact details (the client refuses to start without one), requests are rate-limited to 8/s (below the SEC's stated 10/s ceiling), 429/5xx responses are retried with exponential back-off and `Retry-After`, and `If-Modified-Since` avoids re-downloading unchanged company facts.

## 2. Storage: as reported, never overwritten (`models.py`)

`fact` stores each XBRL value exactly as filed, keyed by *(CIK, taxonomy, concept, unit, period start, period end, accession)*. Re-ingesting is idempotent. Instant facts (no start date) are protected by a `NULLS NOT DISTINCT` unique constraint; the integration tests caught a duplication bug here before it shipped.

## 3. Normalisation (`normalize/`)

**Concept mapping.** Each statement line lists XBRL concepts in priority order (`concepts.py`). The first concept reported for a period wins, so a switch from `SalesRevenueNet` to `RevenueFromContractWithCustomerExcludingAssessedTax` still gives one continuous revenue line. Every value records which concept it came from.

**Units and currency.** Monetary lines accept only ISO currency units, per-share lines only `<CCY>/shares`, and share counts only `shares`. The reporting currency is the most common currency on revenue, assets and net income facts. Values are never mixed across currencies and never converted silently. Conversion will use the `fx_rate` table, where every rate names its source; until then, non-USD filers stay in their native currency.

**Periods (`periods.py`).**
- Duration type by length: quarter 84–98 days, half-year 175–190, nine months 266–280, fiscal year 350–380. These windows cover 52/53-week calendars.
- Fiscal year label = the calendar year in which the fiscal year ends. Quarter number = the period end's position within that year, with a 10-day tolerance around the nominal year end.
- Fiscal year end comes from SEC submissions metadata. If that is missing, it is inferred from reported annual periods and a warning is logged.

**Quarterly derivation.** 10-Q cash-flow statements are usually year-to-date only. Missing 3-month values are derived as Q2 = H1 − Q1, Q3 = 9M − H1, Q4 = FY − 9M (or FY − Q1 − Q2 − Q3). Subtraction only happens when both pieces start on the same date. Per-share values and share counts are never derived by subtraction.

**Derived lines.** These are always marked `derived` with a `rule_id`:
- gross profit (only when not reported), EBITDA = EBIT + D&A, free cash flow = CFO − |capex|
- total debt = short-term borrowings + current and non-current long-term debt, flagged "partial" if a component is missing
- total liabilities = total liabilities & equity − equity (only when not reported; the note flags NCI and mezzanine equity)

**Which filings count.** Statements are built only from periodic financial reports: 10-K, 10-Q, 10-KT, 10-QT, 20-F and 40-F, plus their amendments. Other forms also carry XBRL but with rounded or unaudited figures, so their facts stay in the raw store only. Examples are proxy statements (pay-versus-performance tables), registration statements and 8-K exhibits. Real data showed why this matters: JPMorgan's 2026 proxy statement reports FY2023 net income rounded to $49,600M, and because it was filed after the audited 10-K figure of $49,552M, a naive "latest wins" rule would have chosen the rounded number.

**Restatements (`restatements.py`).** When several filings report the same concept and period, the most recently filed value is current (an amendment beats an original filed the same day). The first-filed value is kept as `original_value`. If the values differ, the line is flagged `restated`, the note names both filings, and the cause is classified as `value_changed` or `consistent_with_split_N_for_1`. The split match allows half a cent of re-rounding, because restated per-share values are rounded again (e.g. Nvidia's 1.74 → 0.17 after its 10-for-1 split).

**Integrity check.** Every period where total assets ≠ total liabilities & equity gets a note on both lines naming the two filings, and a pipeline warning. This happens when a later filing restates one line without re-tagging the other. For example, JPMorgan's 2010 filings restated 2009 total assets by about +$88B after a consolidation accounting change, but not the matching total. Neither value is discarded or "corrected".

**Stock splits (`splits.py`).** Splits are detected from the `StockholdersEquityNoteStockSplitConversionRatio1` fact (effective date approximated by that fact's period end and noted), or entered manually in `corporate_action`; manual entries override detected ones within 120 days. Later filings restate comparatives retroactively, so only values whose latest filing predates a split are adjusted: per-share values ÷ ratio, share counts × ratio. Each adjusted line records its `split_factor`.

**Missing data.** Nothing is imputed. Every template line absent from a period that has data for that statement gets an explicit `missing` row with a reason: which concepts were looked for, why a derivation wasn't possible, or why Q4 per-share figures cannot exist.

## 4. Freshness (`freshness.py`)

Two independent signals:
- **sync status:** `fresh`, `stale` (no successful SEC check within 24 h) or `never_checked`.
- **data status:** `current` if the next filing isn't due yet, `filing_expected` if a newer 10-Q/10-K should exist. The deadline is the latest period end + one quarter + the longest standard filing window (10-Q 45 days, 10-K 90 days), so large filers are never flagged early.

## 5. API (`web/app.py`)

`GET /v1/companies?q=` · `/v1/companies/{ticker|cik}` · `/statements/{income|balance|cashflow}?period=FY|Q&limit=` · `/facts/{taxonomy:concept}` (full as-reported history, showing restatements) · `/freshness` · `POST /v1/admin/ingest/{ref}` and `GET /v1/admin/ingest-runs` (temporary `X-Admin-Token`; real auth in Phase 6). Decimal values are returned as strings to keep precision. Every line carries a `provenance` object: status, concept, accession, form, filed date, document URL, rule, restatement and split details, and notes.

## 6. Verification status

| Check | Status |
|---|---|
| Unit tests: periods, 52/53-week mapping, restatements, splits, freshness, EDGAR client (UA, rate limit, retries, 304, 404), parsers | ✅ passing |
| Pipeline on a **synthetic** fixture issuer (concept switch, YTD cash flows, 10-K/A restatement, 4-for-1 split, missing lines, EUR filer); expected values worked by hand | ✅ passing |
| PostgreSQL integration: Alembic upgrade → downgrade → upgrade, idempotent ingest, conditional GET, failure recording, API responses, auth guard, input validation | ✅ passing |
| **Live SEC tests** (`pytest -m live`) on AAPL, MSFT, JPM, WMT and NVDA: the latest balance sheet balances; every older period balances or carries an integrity warning; every reported line comes from a periodic report and has full provenance | ✅ passing (2026-10-25) |
| Manual review of real ingests (≈165,000 facts across the five issuers) | ✅ Key FY figures spot-checked against the issuers' published results (e.g. Apple FY2024 revenue $391,035M, net income $93,736M). Detected splits match real events (Apple 7:1 and 4:1; Nvidia 4:1 and 10:1; Walmart 3:1), and split-adjusted EPS matches hand calculation (Apple FY2015 $9.22 ÷ 4 = $2.305) |

Real-data review found and fixed two issues before merge: proxy-statement figures overriding audited ones, and split-cause labels missing re-rounded values. It also led to the integrity check above.

The live tests check accounting identities and provenance rather than hard-coded figures, so they stay valid as issuers file new reports.
