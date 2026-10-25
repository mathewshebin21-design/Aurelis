"""Quant endpoints over the synthetic Fixture Corp data (no real company figures)."""

import json
from decimal import Decimal
from pathlib import Path

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from aurelis_api.db import get_session
from aurelis_api.edgar.client import COMPANYFACTS_URL, SUBMISSIONS_URL, TICKERS_URL, EdgarClient
from aurelis_api.ingest.service import ingest_issuer
from aurelis_api.web.app import app

from .fixtures import synthetic as fx

pytestmark = pytest.mark.db
CASES = json.loads((Path(__file__).parents[2] / "shared" / "fixtures" / "quant-cases.json").read_text())


@pytest.fixture
def api(session):
    with respx.mock() as mock:
        mock.get(TICKERS_URL).mock(return_value=httpx.Response(200, json=fx.tickers()))
        mock.get(SUBMISSIONS_URL.format(cik=fx.CIK)).mock(return_value=httpx.Response(200, json=fx.submissions()))
        mock.get(COMPANYFACTS_URL.format(cik=fx.CIK)).mock(return_value=httpx.Response(200, json=fx.company_facts()))
        with EdgarClient("AURELIS tests test@example.com", max_rps=1000) as client:
            ingest_issuer(session, client, "FXTR")
    app.dependency_overrides[get_session] = lambda: session
    yield TestClient(app)
    app.dependency_overrides.clear()


def two_year_body(**overrides):
    i = CASES["dcf_two_year"]["in"]
    a = {
        "base_revenue": i["base_revenue"],
        "years": i["years"],
        "growth_start": i["g0"],
        "growth_final": i["g1"],
        "margin_start": i["m0"],
        "margin_target": i["m1"],
        "tax_rate": i["tax"],
        "da_pct_revenue": i["da"],
        "capex_pct_revenue": i["capex"],
        "nwc_pct_incremental_revenue": i["nwc"],
        "wacc": i["wacc"],
        "terminal_growth": i["tg"],
        "net_debt": i["net_debt"],
        "diluted_shares": i["shares"],
    }
    return {**a, **overrides}


def test_metrics_endpoint_traces_every_input(api):
    body = api.get("/v1/companies/FXTR/metrics", params={"limit": 3}).json()
    assert body["periods"] == ["FY2022", "FY2023", "FY2024"] and body["engine_version"].startswith("quant-")
    m = {(x["period"], x["key"]): x for x in body["metrics"]}
    assert Decimal(m[("FY2024", "revenue_growth")]["value"]) == Decimal("0.2")  # 1,200 / 1,000 − 1
    assert Decimal(m[("FY2024", "free_cash_flow")]["value"]) == 255_000_000  # 300 − 45
    roe = m[("FY2024", "roe")]  # 150 / avg(800, 950)
    assert abs(Decimal(roe["value"]) - Decimal(150) / Decimal("875")) < Decimal("1e-30")
    assert {(i["period"], i["line_key"]) for i in roe["inputs"]} == {("FY2024", "net_income"), ("FY2024", "equity"), ("FY2023", "equity")}
    roic = m[("FY2024", "roic")]  # FY2023 debt was never reported → undefined, with a reason
    assert roic["value"] is None and "invested-capital" in roic["reason"]
    gm22 = m[("FY2022", "gross_margin")]
    assert gm22["value"] is None and any(i["status"] == "missing" for i in gm22["inputs"])


def test_dcf_inputs_separate_facts_from_assumptions(api):
    body = api.get("/v1/companies/FXTR/dcf-inputs").json()
    assert body["period"] == "FY2024"
    assert Decimal(body["facts"]["base_revenue"]["value"]) == 1_200_000_000
    assert Decimal(body["facts"]["net_debt"]["value"]) == 150_000_000  # 450 debt − 300 cash (no STI reported)
    assert body["facts"]["tax_rate"]["value"] is None  # income tax not in fixture → not guessed
    assert "wacc (or CAPM inputs)" in body["required_assumptions"]


def test_dcf_endpoint_matches_oracle_and_returns_sensitivity(api):
    r = api.post("/v1/valuation/dcf", json={"assumptions": two_year_body(), "sensitivity": {"each_side": 1}})
    assert r.status_code == 200
    out = r.json()
    assert abs(Decimal(out["per_share"]) - Decimal(CASES["dcf_two_year"]["out"]["per_share"])) < Decimal("1e-18")
    grid = out["sensitivity"]["per_share"]
    assert len(grid) == 3 and Decimal(grid[1][1]) == Decimal(out["per_share"])
    assert out["warnings"] and "Not a forecast" in out["disclaimer"]


@pytest.mark.parametrize(
    "bad",
    [{"wacc": "0.02"}, {"diluted_shares": "0"}, {"tax_rate": "1.5"}, {"years": 99}, {"terminal_method": "exit_multiple"}],
)
def test_dcf_rejects_invalid_assumptions(api, bad):
    assert api.post("/v1/valuation/dcf", json={"assumptions": two_year_body(**bad)}).status_code == 422


def test_wacc_and_scenarios(api):
    w = api.post(
        "/v1/valuation/wacc",
        json={
            "risk_free": "0.04",
            "beta": "1.2",
            "equity_risk_premium": "0.05",
            "equity_value": "800",
            "debt_value": "200",
            "pre_tax_cost_of_debt": "0.05",
            "tax_rate": "0.25",
        },
    ).json()
    assert Decimal(w["cost_of_equity"]) == Decimal("0.10")
    assert Decimal(w["wacc"]) == Decimal("0.0875")  # 0.8 × 10% + 0.2 × 5% × (1 − 25%)
    s = api.post(
        "/v1/valuation/scenarios",
        json={
            "scenarios": [
                {"name": "bear", "probability": "0.25", "assumptions": two_year_body(wacc="0.12")},
                {"name": "base", "probability": "0.75", "assumptions": two_year_body()},
            ]
        },
    ).json()
    per = {x["name"]: Decimal(x["per_share"]) for x in s["scenarios"]}
    assert abs(Decimal(s["probability_weighted_per_share"]) - (Decimal("0.25") * per["bear"] + Decimal("0.75") * per["base"])) < Decimal(
        "1e-25"
    )
    bad = api.post("/v1/valuation/scenarios", json={"scenarios": [{"name": "x", "probability": "0.5", "assumptions": two_year_body()}]})
    assert bad.status_code == 422


def test_comps_requires_market_caps_and_uses_filed_fundamentals(api):
    assert api.post("/v1/valuation/comps", json={"target": "FXTR", "peers": ["FXTR"], "market_caps": {}}).status_code == 422
    body = api.post("/v1/valuation/comps", json={"target": "FXTR", "peers": ["FXTR"], "market_caps": {"FXTR": "10000000000"}}).json()
    m = body["target"]["multiples"]
    assert Decimal(m["enterprise_value"]) == 10_150_000_000  # 10,000m + 450m debt − 300m cash
    assert Decimal(m["ev_to_ebitda"]) == Decimal(10_150) / Decimal(320)
    assert body["target"]["period"] == "FY2024" and "caller-supplied" in body["notes"][0]
    assert (
        api.post("/v1/valuation/comps", json={"target": "NOPE", "peers": ["FXTR"], "market_caps": {"NOPE": "1", "FXTR": "1"}}).status_code
        == 404
    )
