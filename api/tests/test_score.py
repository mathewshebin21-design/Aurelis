"""Health score: band edges, undefined metrics, financial-sector handling, parity with the preview rules, API."""

import re
from decimal import Decimal
from pathlib import Path

import pytest

from aurelis_api.quant import score as sc

from .test_quant_api import api  # noqa: F401  (fixture)

D = Decimal
TS_RULES = (Path(__file__).parents[2] / "web" / "src" / "lib" / "finance" / "score.ts").read_text()


def full(**over):
    v = {
        "operating_margin": D("0.30"),
        "revenue_cagr_3y": D("0.25"),
        "roic": D("0.25"),
        "net_debt_to_ebitda": D("-0.5"),
        "interest_coverage": D("10"),
    }
    return {**v, **over}


def test_band_edges_are_inclusive():
    prof = sc.RULES[0]
    assert sc.score_band(D("0.25"), prof) == 20 and sc.score_band(D("0.2499"), prof) == 15
    assert sc.score_band(D("0"), prof) == 5 and sc.score_band(D("-0.01"), prof) == 0
    lev = sc.RULES[3]
    assert sc.score_band(D("0"), lev) == 20 and sc.score_band(D("3.5"), lev) == 6 and sc.score_band(D("3.51"), lev) == 0


def test_totals_and_grades():
    card = sc.health_score(full())
    assert card.total == 100 and card.grade == "Strong" and card.applicable_max == 100
    weak = sc.health_score(full(operating_margin=D("-0.1"), revenue_cagr_3y=D("-0.1"), roic=D("-0.1"), net_debt_to_ebitda=D("5")))
    assert weak.total == 20 and weak.grade == "Weak"  # only coverage scores


def test_undefined_metrics_follow_the_published_rule():
    card = sc.health_score(full(interest_coverage=None, roic=None))
    pts = {p.id: p.points for p in card.pillars}
    assert pts["coverage"] == 20 and pts["returns"] == 0  # no interest expense earns full marks; missing ROIC earns none
    assert all(p.applicable for p in card.pillars)


def test_financial_sector_rebases_over_applicable_pillars():
    card = sc.health_score(full(operating_margin=None, net_debt_to_ebitda=None, interest_coverage=None), financial_sector=True)
    assert [p.id for p in card.pillars if not p.applicable] == ["profitability", "leverage", "coverage"]
    assert card.total is None and card.grade is None  # 2 of 5 pillars apply: no grade
    card = sc.health_score(full(net_debt_to_ebitda=None, roic=D("0.1")), financial_sector=True)
    assert card.applicable_max == 80 and card.raw_points == 70 and card.total == 88 and card.grade == "Strong"
    assert sc.is_financial_sector("6021") and not sc.is_financial_sector("3571") and not sc.is_financial_sector(None)


def test_revenue_cagr_uses_fiscal_years_three_apart():
    assert sc.revenue_cagr_3y({2021: D(100), 2024: D("133.1")}, 2024) == pytest.approx(D("0.1"), abs=D("1e-20"))
    assert sc.revenue_cagr_3y({2022: D(100), 2024: D(150)}, 2024) is None


def test_rules_match_the_design_preview_table():
    """The UI preview published this methodology; the engine must not silently diverge from it."""
    blocks = re.findall(r'id: "(\w+)".*?max: (\d+),(.*?)bands: \[(.*?)\],\s*whenUndefined: (\d+)', TS_RULES, re.S)
    assert [b[0] for b in blocks] == [r.id for r in sc.RULES]
    for (rid, mx, mid, bands, undef), rule in zip(blocks, sc.RULES, strict=True):
        ts = [(D(t), int(p)) for t, p in re.findall(r"threshold: ([\d.\-]+), points: (\d+)", bands)]
        assert ts == [(b.threshold, b.points) for b in rule.bands], rid
        assert int(mx) == rule.max and int(undef) == rule.when_undefined
        assert ("lowerIsBetter: true" in mid) == rule.lower_is_better


@pytest.mark.db
def test_scorecard_endpoint_shows_rules_inputs_and_points(api):  # noqa: F811
    r = api.get("/v1/companies/FXTR/scorecard")
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["period"].startswith("FY") and not d["financial_sector"]
    assert [p["id"] for p in d["pillars"]] == [x.id for x in sc.RULES]
    assert all(p["bands"] and p["rationale"] for p in d["pillars"])
    assert sum(p["points"] for p in d["pillars"]) == d["raw_points"]
    cagr = next(m for m in d["inputs"] if m["key"] == "revenue_cagr_3y")
    assert cagr["formula"].startswith("(revenue FY") and len(cagr["inputs"]) == 2
    assert api.get("/v1/companies/NOPE/scorecard").status_code == 404
    assert api.get("/v1/companies/bad ref!/scorecard").status_code == 422


@pytest.mark.db
def test_search_reports_whether_data_exists(api):  # noqa: F811
    hits = api.get("/v1/companies", params={"q": "FXTR"}).json()
    assert hits[0]["has_data"] is True and hits[0]["last_ingested_at"]
