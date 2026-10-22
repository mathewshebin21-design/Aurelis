"""Live checks against real SEC EDGAR data. Opt-in: `pytest -m live`.

Requires network access to www.sec.gov and data.sec.gov and AURELIS_SEC_USER_AGENT.
These tests assert accounting identities and provenance on real filings rather
than hard-coded numbers, so they stay valid as issuers file new reports.
"""

import os

import pytest

from aurelis_api.edgar.client import EdgarClient
from aurelis_api.edgar.parse import iter_company_facts, parse_submissions
from aurelis_api.normalize.pipeline import normalize
from aurelis_api.normalize.restatements import FactRecord
from aurelis_api.normalize.splits import detect_splits

pytestmark = pytest.mark.live

# Large US filers across industries and fiscal calendars (CIKs are public SEC identifiers).
ISSUERS = {
    "AAPL": 320193,  # 52/53-week September year end
    "MSFT": 789019,  # June year end
    "JPM": 19617,  # bank: no cost of revenue / current assets
    "WMT": 104169,  # January year end
    "NVDA": 1045810,  # late-January 52/53-week year, stock splits
}


@pytest.fixture(scope="module")
def client():
    ua = os.environ.get("AURELIS_SEC_USER_AGENT")
    if not ua:
        pytest.skip("AURELIS_SEC_USER_AGENT not set")
    with EdgarClient(ua) as c:
        yield c


@pytest.mark.parametrize("ticker", list(ISSUERS))
def test_real_issuer_normalises_with_provenance(client, ticker):
    cik = ISSUERS[ticker]
    profile = parse_submissions(client.submissions(cik).json())
    facts = [
        FactRecord(f.taxonomy, f.concept, f.unit, f.start, f.end, f.value, f.accession, f.form, f.filed)
        for f in iter_company_facts(client.company_facts(cik).json())
    ]
    res = normalize(facts, fiscal_year_end=profile.fiscal_year_end, split_actions=detect_splits(facts))
    assert res.reporting_currency == "USD"
    fy = {(v.line_key, v.fiscal_year): v for v in res.lines if v.period_type == "FY"}
    latest = max(y for (k, y) in fy if k == "total_assets" and fy[(k, y)].value is not None)
    assets, le = fy[("total_assets", latest)], fy[("liabilities_and_equity", latest)]
    assert assets.value == le.value, "balance sheet must balance"
    for v in res.lines:
        if v.status == "reported":
            assert v.source_concept and v.source_accession and v.source_filed
        if v.status == "derived":
            assert v.rule_id
        if v.status == "missing":
            assert v.value is None and v.notes
