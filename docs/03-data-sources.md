# 03 · Data sources, licensing and reliability

> Limits and terms change. The figures below were checked on 2026-10-22; those marked **verify** came from secondary sources and must be confirmed on the provider's own pricing and terms pages before integration. Nothing here is legal advice.

## Recommended stack

| Need | Primary source | Cost | Licensing / restrictions | Reliability & limitations |
|---|---|---|---|---|
| Company ↔ ticker ↔ CIK lookup | SEC `company_tickers.json`, `submissions` API | Free | US government public data; SEC asks for a declared User-Agent with contact details and fair-access behaviour | Authoritative for SEC registrants; tickers change, so key everything on **CIK** |
| Filings (10-K, 10-Q, 8-K, 20-F) | SEC EDGAR full-text and archives | Free | Same; the SEC states a **maximum of 10 requests/second** and can lower it ([SEC: Accessing EDGAR data](https://www.sec.gov/os/accessing-edgar-data)) | Complete for US filers; HTML/iXBRL parsing needed for narrative sections |
| Structured financial facts | SEC XBRL APIs: `companyfacts`, `companyconcept`, `frames` (data.sec.gov) | Free | Same | Issuer-tagged, so concept choice varies by company (e.g. `Revenues` vs `RevenueFromContractWithCustomer…`); restatements appear as later facts for the same period → needs normalisation and "as-reported vs latest" handling |
| Macro / risk-free rate | US Treasury daily par yield curve; FRED API | Free (FRED needs a key) | Treasury data is public; some FRED series carry third-party copyright — check per series | High; daily cadence |
| Equity risk premium, industry betas | Damodaran Online datasets (NYU Stern) | Free | Published for education and research; attribute the source | Annual/periodic updates; methodology documented |
| End-of-day prices | **Choose one:** Tiingo (Starter), Financial Modeling Prep (Basic), Alpha Vantage (free), Polygon/Massive (free tier) | Free tiers | Free tiers are generally **personal / non-display** use; FMP states display or redistribution requires a separate licence agreement; Tiingo historically personal-use only (**verify**) | Rate limits: FMP Basic 250 req/day; Alpha Vantage reportedly 25 req/day (**verify**); Tiingo historically ~1,000 req/day, 500 symbols/month (**verify**) |
| Earnings call transcripts | Not free at quality. Options: issuer IR pages (8-K exhibits sometimes include prepared remarks) or a paid licence later | — | Transcripts are usually copyrighted by the vendor | Phase 4 starts with 10-K/10-Q/8-K text only; transcripts are an optional paid add-on requiring approval |

**Avoid:** scraping Yahoo Finance or other sites whose terms forbid automated access, and redistributing licensed price data in a public demo.

## Public demo policy

The public portfolio deployment shows **SEC-derived fundamentals with provenance**, and either (a) delayed prices from a provider whose terms allow display, or (b) prices clearly marked "illustrative" when no such licence is held. The Phase 1 previews use option (b) for everything.

## Provenance model (Phase 2)

Every stored fact carries: `cik`, `accession_number`, `form`, `filed_at`, `period_start/end`, `fiscal_year/period`, `xbrl_concept`, `unit`, `decimals`, `source_url`, `ingested_at`, `normalisation_rule_id`, and `superseded_by` (for restatements). The UI's "Source tags" toggle is the visible end of this chain.
