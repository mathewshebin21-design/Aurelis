"""Spending guard: actual-cost accounting, worst-case reservations and the hard stop (no network)."""

from decimal import Decimal

import pytest

from aurelis_api.models import AiUsage
from aurelis_api.research.budget import BudgetedModel, BudgetExceeded, BudgetGuard, cost_of, price_for, worst_case
from aurelis_api.research.llm import ModelNotConfigured, ModelRefused, ModelResponse


def test_cost_from_reported_usage():
    cost, notes = cost_of({"input_tokens": 10_000, "output_tokens": 2_000}, "claude-opus-5-5")
    assert cost == Decimal("0.08") and notes == []  # 10k × $4/M + 2k × $20/M
    cached, _ = cost_of({"input_tokens": 0, "output_tokens": 0, "cache_creation_input_tokens": 1_000_000}, "claude-opus-5-5")
    assert cached == Decimal(5)  # cache writes bill at 1.25× input


def test_fallback_iterations_are_billed_per_model():
    usage = {
        "input_tokens": 0,
        "output_tokens": 0,
        "iterations": [
            {"model": "claude-opus-5-5", "input_tokens": 1_000_000, "output_tokens": 0},
            {"model": "claude-opus-4-8", "input_tokens": 1_000_000, "output_tokens": 100_000},
        ],
    }
    cost, _ = cost_of(usage, "claude-opus-4-8")
    assert cost == Decimal(4) + Decimal(5) + Decimal("2.5")


def test_unknown_model_is_charged_at_the_ceiling_not_zero():
    p, known = price_for("some-future-model")
    assert not known and p.output == Decimal(50)
    _, notes = cost_of({"input_tokens": 1, "output_tokens": 1}, "some-future-model")
    assert notes and "highest known rate" in notes[0]
    assert price_for("claude-opus-5-5-20261001")[1]  # dated snapshot ids resolve to their family


def test_worst_case_covers_full_output_and_a_fallback_attempt():
    # 10k in, 10k out at the dearer of opus-5-5 and the opus-4-8 fallback ($5/$25), two attempts
    assert worst_case(10_000, 10_000, "claude-opus-5-5") == Decimal("0.6")


class Fake:
    name = "claude-opus-5-5"

    def __init__(self, outcome):
        self.outcome, self.calls = outcome, 0

    def generate(self, system, user, schema):
        self.calls += 1
        if isinstance(self.outcome, Exception):
            raise self.outcome
        return self.outcome


def ticking():
    t = iter(range(0, 10_000, 2))  # each clock read advances 2 s
    return lambda: float(next(t))


@pytest.mark.db
def test_ledger_records_actual_cost_and_latency(session):
    guard = BudgetGuard(session, "t", Decimal(2))
    ok = ModelResponse({}, "claude-opus-5-5", {"input_tokens": 10_000, "output_tokens": 2_000})
    m = BudgetedModel(Fake(ok), guard, max_tokens=10_000, count_tokens=lambda *a: 10_000, clock=ticking())
    m.generate("s", "u", {})
    (rec,) = session.query(AiUsage).all()
    assert rec.status == "ok" and rec.cost_usd == Decimal("0.08") and rec.latency_ms == 2000 and rec.served_model == "claude-opus-5-5"
    assert rec.reserved_usd > rec.cost_usd and guard.spent() == Decimal("0.08")


@pytest.mark.db
def test_refusal_is_billed_and_configuration_errors_are_not(session):
    guard = BudgetGuard(session, "t", Decimal(10))
    refused = ModelRefused("declined", usage={"input_tokens": 1_000_000, "output_tokens": 0}, model="claude-opus-5-5")
    with pytest.raises(ModelRefused):
        BudgetedModel(Fake(refused), guard, max_tokens=100, count_tokens=lambda *a: 10).generate("s", "u", {})
    with pytest.raises(ModelNotConfigured):
        BudgetedModel(Fake(ModelNotConfigured("no key")), guard, max_tokens=100).generate("s", "u", {})
    rows = session.query(AiUsage).all()
    assert [(r.status, r.cost_usd) for r in rows] == [("refused", Decimal(4))]


@pytest.mark.db
def test_unknown_failure_books_the_full_reservation(session):
    guard = BudgetGuard(session, "t", Decimal(2))
    with pytest.raises(ConnectionError):
        BudgetedModel(Fake(ConnectionError("reset")), guard, max_tokens=1_000, count_tokens=lambda *a: 1_000).generate("s", "u", {})
    (rec,) = session.query(AiUsage).all()
    assert rec.status == "error" and rec.cost_usd == rec.reserved_usd > 0


@pytest.mark.db
def test_hard_stop_before_a_call_that_could_exceed_the_limit(session):
    guard = BudgetGuard(session, "t", Decimal("0.50"))
    big = ModelResponse({}, "claude-opus-5-5", {"input_tokens": 50_000, "output_tokens": 10_000})  # $0.40 actual
    inner = Fake(big)
    m = BudgetedModel(inner, guard, max_tokens=5_000, count_tokens=lambda *a: 1_000)
    m.generate("s", "u", {})  # reservation ≈ $0.26 fits
    with pytest.raises(BudgetExceeded, match="would be exceeded"):
        m.generate("s", "u", {})  # $0.40 spent + $0.26 worst case > $0.50
    assert inner.calls == 1 and guard.spent() == Decimal("0.4")
    other = BudgetGuard(session, "other-key", Decimal("0.50"))
    assert other.spent() == 0  # budgets are separate per key


def test_budget_must_be_positive():
    with pytest.raises(ValueError):
        BudgetGuard(None, "t", Decimal(0))  # type: ignore[arg-type]
