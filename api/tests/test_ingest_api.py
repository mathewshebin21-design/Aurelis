"""End-to-end: mocked SEC → ingest → Postgres → HTTP API. Uses synthetic fixtures only."""

import httpx
import pytest
import respx
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from aurelis_api.config import get_settings
from aurelis_api.db import get_session
from aurelis_api.edgar.client import COMPANYFACTS_URL, SUBMISSIONS_URL, TICKERS_URL, EdgarClient
from aurelis_api.ingest.service import ingest_issuer
from aurelis_api.models import CorporateAction, Fact, IngestRun, NormalizedLine
from aurelis_api.web.app import app

from .fixtures import synthetic as fx

pytestmark = pytest.mark.db
UA = "AURELIS tests test@example.com"
LAST_MODIFIED = "Fri, 01 Nov 2024 12:00:00 GMT"


@pytest.fixture
def sec():
    with respx.mock(assert_all_called=False) as mock:
        mock.get(TICKERS_URL).mock(return_value=httpx.Response(200, json=fx.tickers()))
        mock.get(SUBMISSIONS_URL.format(cik=fx.CIK)).mock(return_value=httpx.Response(200, json=fx.submissions()))
        facts = mock.get(COMPANYFACTS_URL.format(cik=fx.CIK))
        facts.side_effect = lambda req: (
            httpx.Response(304)
            if req.headers.get("If-Modified-Since") == LAST_MODIFIED
            else httpx.Response(200, json=fx.company_facts(), headers={"Last-Modified": LAST_MODIFIED})
        )
        yield mock


@pytest.fixture
def api(session, monkeypatch):
    monkeypatch.setenv("AURELIS_ADMIN_TOKEN", "s3cret-test-token")
    monkeypatch.setenv("AURELIS_SEC_USER_AGENT", UA)
    get_settings.cache_clear()
    app.dependency_overrides[get_session] = lambda: session
    yield TestClient(app)
    app.dependency_overrides.clear()
    get_settings.cache_clear()


def test_ingest_is_idempotent_and_uses_conditional_get(session, sec):
    with EdgarClient(UA, max_rps=1000) as client:
        run = ingest_issuer(session, client, "FXTR")
        assert run.status == "ok" and run.facts_seen == run.facts_inserted > 40 and run.lines_written > 100
        n_facts = session.scalar(select(func.count()).select_from(Fact))
        again = ingest_issuer(session, client, "FXTR")
        assert again.status == "not_modified"
        forced = ingest_issuer(session, client, str(fx.CIK), force=True)
        assert forced.status == "ok" and forced.facts_inserted == 0
    assert session.scalar(select(func.count()).select_from(Fact)) == n_facts
    split = session.scalars(select(CorporateAction)).one()
    assert (split.ratio, split.source, str(split.effective_date)) == (4, "xbrl", "2024-06-29")
    assert session.scalar(select(func.count()).select_from(IngestRun)) == 3


def test_failed_ingest_is_recorded(session):
    with respx.mock() as mock:
        mock.get(TICKERS_URL).mock(return_value=httpx.Response(200, json=fx.tickers()))
        mock.get(SUBMISSIONS_URL.format(cik=fx.CIK)).mock(return_value=httpx.Response(200, json={"cik": "9999901"}))
        with EdgarClient(UA, max_rps=1000) as client, pytest.raises(Exception, match="submissions"):
            ingest_issuer(session, client, "FXTR")
    run = session.scalars(select(IngestRun)).one()
    assert run.status == "error" and "PayloadError" in run.error
    assert session.scalar(select(func.count()).select_from(NormalizedLine)) == 0


def test_admin_endpoints_require_token(api):
    assert api.post("/v1/admin/ingest/FXTR").status_code == 401
    assert api.post("/v1/admin/ingest/FXTR", headers={"X-Admin-Token": "wrong"}).status_code == 401
    assert api.get("/v1/admin/ingest-runs").status_code == 401


def test_api_end_to_end(api, sec):
    r = api.post("/v1/admin/ingest/FXTR", headers={"X-Admin-Token": "s3cret-test-token"})
    assert r.status_code == 200 and r.json()["status"] == "ok"

    assert api.get("/v1/health").json() == {"status": "ok"}
    hits = api.get("/v1/companies", params={"q": "fxtr"}).json()
    assert hits[0]["cik"] == fx.CIK and hits[0]["tickers"] == ["FXTR"]
    assert api.get("/v1/companies", params={"q": "fixture"}).json()[0]["name"].startswith("Fixture Corp")

    co = api.get("/v1/companies/FXTR").json()
    assert co["fiscal_year_end"] == "0928" and co["reporting_currency"] == "USD"

    inc = api.get("/v1/companies/FXTR/statements/income", params={"period": "FY", "limit": 3}).json()
    assert inc["periods"] == ["FY2022", "FY2023", "FY2024"]
    rev24 = next(x for x in inc["lines"] if x["line_key"] == "revenue" and x["fiscal_year"] == 2024)
    assert rev24["value"] == "1200000000" and rev24["provenance"]["source_accession"] == fx.K24
    assert rev24["provenance"]["source_url"].endswith("fxtr-000010.htm")
    ni23 = next(x for x in inc["lines"] if x["line_key"] == "net_income" and x["fiscal_year"] == 2023)
    assert ni23["provenance"]["restated"] and ni23["provenance"]["original_value"] == "100000000"
    eps22 = next(x for x in inc["lines"] if x["line_key"] == "eps_diluted" and x["fiscal_year"] == 2022)
    assert eps22["value"] == "1.25" and eps22["provenance"]["split_factor"] == "4"
    gp22 = next(x for x in inc["lines"] if x["line_key"] == "gross_profit" and x["fiscal_year"] == 2022)
    assert gp22["value"] is None and gp22["provenance"]["status"] == "missing"

    cf = api.get("/v1/companies/FXTR/statements/cashflow", params={"period": "Q", "limit": 4}).json()
    q = {x["fiscal_period"]: x for x in cf["lines"] if x["line_key"] == "operating_cash_flow"}
    assert q["Q4"]["value"] == "90000000" and q["Q4"]["provenance"]["rule_id"] == "q4_from_fy_less_9m"

    history = api.get("/v1/companies/FXTR/facts/us-gaap:NetIncomeLoss").json()
    fy23 = [h for h in history if h["period_end"] == "2023-09-30"]
    assert [h["value"] for h in fy23] == ["100000000", "95000000", "95000000"]

    fresh = api.get("/v1/companies/FXTR/freshness").json()
    assert fresh["latest_period_end"] == "2024-09-28" and fresh["sync_status"] == "fresh"

    runs = api.get("/v1/admin/ingest-runs", headers={"X-Admin-Token": "s3cret-test-token"}).json()
    assert runs[0]["status"] == "ok"


def test_input_validation_and_404(api):
    assert api.get("/v1/companies/NOPE").status_code == 404
    assert api.get("/v1/companies/FXTR/statements/bogus").status_code == 422
    assert api.get("/v1/companies/bad%20ref").status_code == 422
    assert api.get("/v1/companies", params={"q": ""}).status_code == 422
    assert api.get("/v1/companies/FXTR/statements/income", params={"period": "H1"}).status_code == 422
