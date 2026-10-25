"""Acceptance harness and claim evaluation on SYNTHETIC data with scripted models (no network, no spend)."""

import json
from decimal import Decimal

import pytest

from aurelis_api.models import AiUsage
from aurelis_api.research import acceptance as acc
from aurelis_api.research.evaluation import _direction, evaluate_run
from aurelis_api.research.facts import Fact
from aurelis_api.research.service import run_research

from .fixtures import synthetic as fx
from .test_research_service import CitingModel, ingested  # noqa: F401  (fixture)

pytestmark = pytest.mark.db


def growth(value):
    return Fact("F9", "Revenue growth", "FY2024", Decimal(value), f"{value}%", "ratio", "engine")


def test_direction_mismatch_is_detected():
    assert _direction("Revenue grew strongly", [growth("-0.05")]).startswith("says increase")
    assert _direction("Revenue declined", [growth("0.2")]).startswith("says decrease")
    assert _direction("Revenue grew", [growth("0.2")]) is None
    assert _direction("Revenue grew", []) is None


def test_evaluation_scores_every_dimension_and_keeps_rejected_claims(session, ingested):  # noqa: F811
    run = run_research(session, fx.CIK, CitingModel()).run
    ev = evaluate_run(session, run.id)
    assert ev["claims_total"] == 3 and ev["verdicts"] == {"verified": 2, "flagged": 0, "rejected": 1}
    assert ev["verdicts_match_stored"]
    rejected = [c for c in ev["claims"] if c["verdict"] == "rejected"]
    assert len(rejected) == 1 and any("unverified_number" in i for i in rejected[0]["issues"])
    d = ev["dimensions"]
    assert d["quotation_accuracy"] == {"quotes": 1, "found_verbatim": 1, "rate": 1.0}
    assert d["numerical_accuracy"]["numbers_checked"] > d["numerical_accuracy"]["numbers_verified"] > 0
    assert d["completeness"]["required_missing"] == ["summary", "bull", "risk"]  # a rejected claim does not count as coverage
    assert d["unsupported_assertions"]["count"] == 1
    assert d["interpretation_quality"]["human_review"]["insight"] is None  # left for a reviewer, never auto-scored


def test_live_run_links_actual_usage_and_report_preserves_rejections(session, engine, ingested, tmp_path):  # noqa: F811
    from sqlalchemy.orm import Session

    with Session(engine, expire_on_commit=False) as ledger:
        results = acc.run_live(session, ledger, ["FXTR"], Decimal(2), CitingModel(), count_tokens=lambda *a: 100)
        assert [r.status for r in results] == ["ok"]
        (rec,) = ledger.query(AiUsage).all()
        assert rec.research_run_id == results[0].run_id and rec.input_tokens == 1 and rec.detail["ticker"] == "FXTR"
        md_path = acc.write_report(session, ledger, results, Decimal(2), tmp_path)
    md = md_path.read_text()
    data = json.loads(md_path.with_suffix(".json").read_text())
    assert "Revenue will reach USD 1,500 million next year." in md and "**rejected**" in md and "unverified_number" in md
    assert data["calls"][0]["latency_ms"] >= 0 and Decimal(data["spent_usd"]) == rec.cost_usd
    assert len(data["evaluations"][0]["claims"]) == 3


def test_live_run_stops_before_any_call_the_budget_cannot_cover(session, engine, ingested):  # noqa: F811
    from sqlalchemy.orm import Session

    model = CitingModel()
    with Session(engine, expire_on_commit=False) as ledger:
        results = acc.run_live(session, ledger, ["FXTR", "FXTR"], Decimal("0.01"), model, count_tokens=lambda *a: 100)
        assert [r.status for r in results] == ["stopped_budget"]  # hard stop: the second ticker is never attempted
        assert model.prompt == "" and ledger.query(AiUsage).count() == 0
