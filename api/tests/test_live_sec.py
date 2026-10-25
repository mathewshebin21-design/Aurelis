"""Live checks against real SEC EDGAR data. Opt-in: `pytest -m live`.

Requires network access to www.sec.gov and data.sec.gov and AURELIS_SEC_USER_AGENT.
These tests assert accounting identities and provenance on real filings rather
than hard-coded numbers, so they stay valid as issuers file new reports.
"""

import os
from decimal import Decimal

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
    years = sorted(y for (k, y) in fy if k == "total_assets" and fy[(k, y)].value is not None)
    assert years, "expected at least one fiscal-year balance sheet"
    latest = years[-1]
    assert fy[("total_assets", latest)].value == fy[("liabilities_and_equity", latest)].value, "latest balance sheet must balance"
    for y in years:  # older periods must balance or carry an explicit integrity warning
        a, le = fy.get(("total_assets", y)), fy.get(("liabilities_and_equity", y))
        if a and le and le.value is not None and a.value != le.value:
            assert any("Integrity check failed" in n for n in a.notes)
    assert all(
        v.source_form and v.source_form.removesuffix("/A") in {"10-K", "10-Q", "10-KT", "10-QT", "20-F", "40-F"}
        for v in res.lines
        if v.status == "reported"
    ), "statements must come from periodic reports only"
    for v in res.lines:
        if v.status == "reported":
            assert v.source_concept and v.source_accession and v.source_filed
        if v.status == "derived":
            assert v.rule_id
        if v.status == "missing":
            assert v.value is None and v.notes


def test_apple_fy2024_gross_margin_matches_published(client):
    """Apple reported a 46.2% total gross margin for fiscal 2024 (10-K, filed November 2024)."""
    from aurelis_api.quant.metrics import LineInput, PeriodLines, compute_metrics

    profile = parse_submissions(client.submissions(320193).json())
    facts = [
        FactRecord(f.taxonomy, f.concept, f.unit, f.start, f.end, f.value, f.accession, f.form, f.filed)
        for f in iter_company_facts(client.company_facts(320193).json())
    ]
    res = normalize(facts, fiscal_year_end=profile.fiscal_year_end, split_actions=detect_splits(facts))
    lines = {v.line_key: LineInput(v.line_key, v.value, v.status) for v in res.lines if v.period_type == "FY" and v.fiscal_year == 2024}
    gm = next(m for m in compute_metrics([PeriodLines("FY2024", 2024, lines)]) if m.key == "gross_margin")
    assert gm.value is not None and abs(gm.value - Decimal("0.462")) < Decimal("0.0005")


@pytest.mark.parametrize("cik", [320193, 1045810])
def test_real_10k_text_splits_into_items(client, cik):
    """The latest real 10-K yields substantive Risk Factors and MD&A sections (not table-of-contents lines)."""
    from aurelis_api.research.text import html_to_text, split_sections

    profile = parse_submissions(client.submissions(cik).json())
    tenk = next(f for f in profile.filings if f.form == "10-K" and f.url)
    text = html_to_text(client.get_text(tenk.url))
    secs = {s.key: s for s in split_sections(text, "10-K")}
    assert {"1", "1A", "7", "8"} <= set(secs)
    assert secs["1A"].end - secs["1A"].start > 20_000 and secs["7"].end - secs["7"].start > 10_000
    assert secs["1"].start < secs["1A"].start < secs["7"].start < secs["8"].start
