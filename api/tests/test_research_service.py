"""End-to-end research flow on SYNTHETIC data with a scripted model (no network, no API key)."""

import re

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from aurelis_api.config import get_settings
from aurelis_api.db import get_session
from aurelis_api.edgar.client import COMPANYFACTS_URL, SUBMISSIONS_URL, TICKERS_URL, EdgarClient
from aurelis_api.ingest.service import ingest_issuer
from aurelis_api.models import Filing, ResearchClaim, ResearchRun
from aurelis_api.research.documents import ingest_document, search
from aurelis_api.research.llm import ModelRefused, ModelResponse
from aurelis_api.research.service import run_research
from aurelis_api.web.app import app

from .fixtures import synthetic as fx

pytestmark = pytest.mark.db
UA = "AURELIS tests test@example.com"
DOC_URL = f"https://www.sec.gov/Archives/edgar/data/{fx.CIK}/{fx.K24.replace('-', '')}/fxtr-000010.htm"
TEN_K_HTML = """<html><body><div style="display:none"><ix:header>hidden</ix:header></div>
<p>Table of Contents</p><p>Item 1. Business</p><p>Item 1A. Risk Factors</p><p>Item 7. Management's Discussion and Analysis</p>
<p>Item 1. Business</p><p>Fixture Corp (synthetic) designs test equipment sold to laboratories. Customers are concentrated:
our two largest customers accounted for 38% of net sales in fiscal 2024.</p>
<p>Item 1A. Risk Factors</p><p>Competition is intense and pricing pressure could adversely affect gross margin.
A single supplier provides our sensor modules.</p>
<p>Item 7. Management's Discussion and Analysis</p><p>Net sales increased 20% in fiscal 2024 compared to fiscal 2023, primarily due to
higher unit volumes. Gross margin improved due to a favourable product mix.</p>
<p>Item 15. Exhibits</p><p>Exhibit list.</p></body></html>"""


class CitingModel:
    """Scripted model that cites real ids from the prompt: one sound claim, one fabricated, one interpretation."""

    name = "scripted-citing-model"

    def __init__(self):
        self.prompt = ""

    def generate(self, system, user, schema):
        self.prompt = user
        rev = re.search(r"\[(F\d+)\] Revenue, FY2024: USD 1,200 million", user).group(1)
        mdna = next(m.group(1) for m in re.finditer(r"\[(E\d+)\][^\n]*\n([^\[]*)", user) if "Net sales increased 20%" in m.group(2))
        conc = next(m.group(1) for m in re.finditer(r"\[(E\d+)\][^\n]*\n([^\[]*)", user) if "38% of net sales" in m.group(2))
        return ModelResponse(
            {
                "claims": [
                    {
                        "section": "earnings",
                        "kind": "fact",
                        "text": "Revenue was USD 1,200 million in FY2024, with net sales up 20%.",
                        "confidence": "high",
                        "evidence_ids": [mdna],
                        "fact_ids": [rev],
                        "quotes": ["Net sales increased 20% in fiscal 2024"],
                    },
                    {
                        "section": "bull",
                        "kind": "fact",
                        "text": "Revenue will reach USD 1,500 million next year.",
                        "confidence": "low",
                        "evidence_ids": [mdna],
                        "fact_ids": [rev],
                        "quotes": [],
                    },
                    {
                        "section": "bear",
                        "kind": "interpretation",
                        "text": "Reliance on two customers (38% of net sales) concentrates risk.",
                        "confidence": "medium",
                        "evidence_ids": [conc],
                        "fact_ids": [],
                        "quotes": [],
                    },
                ],
                "open_questions": ["What share of revenue is recurring?"],
            },
            self.name,
            {"input_tokens": 1},
        )


class RefusingModel:
    name = "refusing"

    def generate(self, system, user, schema):
        raise ModelRefused("declined (test)")


@pytest.fixture
def ingested(session):
    with respx.mock() as mock:
        mock.get(TICKERS_URL).mock(return_value=httpx.Response(200, json=fx.tickers()))
        mock.get(SUBMISSIONS_URL.format(cik=fx.CIK)).mock(return_value=httpx.Response(200, json=fx.submissions()))
        mock.get(COMPANYFACTS_URL.format(cik=fx.CIK)).mock(return_value=httpx.Response(200, json=fx.company_facts()))
        mock.get(DOC_URL).mock(return_value=httpx.Response(200, text=TEN_K_HTML))
        with EdgarClient(UA, max_rps=1000) as client:
            ingest_issuer(session, client, "FXTR")
            doc = ingest_document(session, client, session.get(Filing, fx.K24))
    return doc


def test_document_ingest_and_search(session, ingested):
    assert [s["key"] for s in ingested.sections] == ["1", "1A", "7", "15"]
    assert "hidden" not in ingested.text
    hits = search(session, fx.CIK, "customer concentration net sales")
    assert hits and "38% of net sales" in hits[0].text and hits[0].section == "1"
    assert search(session, fx.CIK, "zzzz qqqq") == []


def test_research_run_verifies_and_stores_claims(session, ingested):
    model = CitingModel()
    result = run_research(session, fx.CIK, model)
    assert "[E" in model.prompt and "Do not calculate" not in model.prompt  # rules live in the system prompt
    verdicts = [c.verdict for c in result.checks]
    assert verdicts == ["verified", "rejected", "verified"]
    assert any("unverified_number" in i for i in result.checks[1].issues)
    run = session.get(ResearchRun, result.run.id)
    assert run.status == "ok" and run.metrics["rejected"] == 1 and run.metrics["citation_coverage"] == 1.0
    assert run.open_questions == ["What share of revenue is recurring?"]
    stored = session.query(ResearchClaim).filter_by(run_id=run.id).all()
    assert len(stored) == 3 and all(c.evidence_chunk_ids for c in stored)


def test_refusal_is_recorded_not_raised(session, ingested):
    result = run_research(session, fx.CIK, RefusingModel())
    assert result.run.status == "refused" and result.checks == []


def test_research_api(session, ingested, monkeypatch):
    run = run_research(session, fx.CIK, CitingModel()).run
    monkeypatch.setenv("AURELIS_ADMIN_TOKEN", "t")
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    get_settings.cache_clear()
    app.dependency_overrides[get_session] = lambda: session
    try:
        c = TestClient(app)
        latest = c.get("/v1/companies/FXTR/research").json()
        assert latest["id"] == run.id and latest["rejected_hidden"] == 1 and len(latest["claims"]) == 2
        first = latest["claims"][0]
        assert first["evidence"][0]["url"] == DOC_URL and first["facts"][0]["display"] == "USD 1,200 million"
        assert "Not investment advice" in latest["disclaimer"]
        full = c.get(f"/v1/research/runs/{run.id}", params={"include_rejected": True}).json()
        assert len(full["claims"]) == 3
        facts = c.get("/v1/companies/FXTR/research/facts").json()["facts"]
        assert any(f["display"] == "USD 1,200 million" for f in facts)
        hits = c.get("/v1/companies/FXTR/filings/search", params={"q": "supplier sensor"}).json()
        assert hits[0]["id"].startswith("E") and "single supplier" in hits[0]["text"]
        # Generating research needs an API key; without one the endpoint says so instead of failing obscurely.
        r = c.post("/v1/admin/research/FXTR", json={}, headers={"X-Admin-Token": "t"})
        assert r.status_code == 503 and "ANTHROPIC_API_KEY" in r.json()["detail"]
        assert c.post("/v1/admin/research/FXTR", json={}).status_code == 401
    finally:
        app.dependency_overrides.clear()
        get_settings.cache_clear()
