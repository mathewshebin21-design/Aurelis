"""Quant engine tests.

Expected values come from shared/fixtures/quant-cases.json, produced by an
independent exact-fraction oracle (shared/fixtures/oracle.py) that shares no
code with this engine. The TypeScript preview engine is tested against the
same file, so the two engines cannot silently diverge.
"""

import json
from decimal import Decimal, getcontext
from pathlib import Path

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from aurelis_api.quant import ratios as r
from aurelis_api.quant.dcf import (
    DcfAssumptions,
    DcfInputError,
    Scenario,
    cost_of_equity,
    exit_multiple_terminal_value,
    gordon_terminal_value,
    grid,
    present_value,
    probability_weighted,
    run_dcf,
    sensitivity,
    wacc,
)
from aurelis_api.quant.metrics import BY_KEY, LineInput, PeriodLines, compute_metrics
from aurelis_api.quant.valuation import CompanyFundamentals, enterprise_value, implied_per_share, multiples, peer_stats

# Do test-side arithmetic at the engine's precision, so comparisons measure the engine, not the test.
getcontext().prec = r.PRECISION

CASES = json.loads((Path(__file__).parents[2] / "shared" / "fixtures" / "quant-cases.json").read_text())
TOL = Decimal("1e-18")


def D(x) -> Decimal:
    return Decimal(str(x))


def close(a: Decimal | None, expected: str, tol: Decimal = TOL) -> None:
    assert a is not None, "expected a value, got None"
    assert abs(a - Decimal(expected)) <= tol, f"{a} != {expected}"


def assumptions(case: dict, **overrides) -> DcfAssumptions:
    i = case["in"]
    base = DcfAssumptions(
        base_revenue=D(i["base_revenue"]),
        years=i["years"],
        growth_start=D(i["g0"]),
        growth_final=D(i["g1"]),
        margin_start=D(i["m0"]),
        margin_target=D(i["m1"]),
        tax_rate=D(i["tax"]),
        da_pct_revenue=D(i["da"]),
        capex_pct_revenue=D(i["capex"]),
        nwc_pct_incremental_revenue=D(i["nwc"]),
        wacc=D(i["wacc"]),
        terminal_growth=D(i["tg"]),
        net_debt=D(i["net_debt"]),
        diluted_shares=D(i["shares"]),
    )
    return DcfAssumptions(**{**base.__dict__, **overrides})


# ── Oracle parity ──────────────────────────────────────────────────────────


def test_capm_wacc_tv_pv_match_oracle():
    c = CASES
    close(cost_of_equity(D("0.04"), D("1.2"), D("0.05")), c["capm"]["out"])
    w = c["wacc"]["in"]
    close(wacc(D(w["equity"]), D(w["debt"]), D(w["ke"]), D(w["kd"]), D(w["tax"])), c["wacc"]["out"])
    close(gordon_terminal_value(D(100), D("0.08"), D("0.02")), c["gordon"]["out"])
    close(present_value(D(100), D("0.1"), D(2)), c["present_value"]["out"])


@pytest.mark.parametrize("name", ["dcf_two_year", "dcf_three_year_fade"])
def test_dcf_matches_oracle(name):
    case = CASES[name]
    res = run_dcf(assumptions(case))
    out = case["out"]
    for row, fcff in zip(res.rows, out["fcff"], strict=True):
        close(row.fcff, fcff)
    for k in ("terminal_value", "pv_terminal_value", "enterprise_value", "equity_value", "per_share"):
        close(getattr(res, k), out[k])


def test_ratios_match_oracle():
    c = CASES["ratios"]
    close(r.roe(*map(D, c["roe"]["in"])), c["roe"]["out"])
    e, t, b, en = map(D, c["roic"]["in"])
    close(r.roic(e, t, b, en), c["roic"]["out"])
    close(r.current_ratio(*map(D, c["current_ratio"]["in"])), c["current_ratio"]["out"])
    close(r.quick_ratio(*map(D, c["quick_ratio"]["in"])), c["quick_ratio"]["out"])
    close(r.debt_to_equity(*map(D, c["debt_to_equity"]["in"])), c["debt_to_equity"]["out"])
    close(r.debt_to_ebitda(*map(D, c["debt_to_ebitda"]["in"])), c["debt_to_ebitda"]["out"])
    close(r.net_debt_to_ebitda(*map(D, c["net_debt_to_ebitda"]["in"])), c["net_debt_to_ebitda"]["out"])
    close(r.interest_coverage(*map(D, c["interest_coverage"]["in"])), c["interest_coverage"]["out"])
    s0, s1, n = c["cagr"]["in"]
    close(r.cagr(D(s0), D(s1), n), c["cagr"]["out"], Decimal("1e-30"))
    close(enterprise_value(*map(D, c["enterprise_value"]["in"])), c["enterprise_value"]["out"])


def test_comps_match_oracle():
    c = CASES["comps"]
    peers = [
        multiples(CompanyFundamentals(f"P{i}", D(m) * 100, D(0), D(0), None, D(100), None, None, None, None))
        for i, m in enumerate(c["peer_ev_to_ebitda"])
    ]
    stats = peer_stats(peers)["ev_to_ebitda"]
    close(stats.median, c["median"])
    close(stats.low, c["p25"])
    close(stats.high, c["p75"])
    t = c["target"]
    target = CompanyFundamentals("T", D(1), D(t["net_debt"]), D(0), None, D(t["ebitda"]), None, None, None, None)
    implied = {v.key: v for v in implied_per_share(target, peer_stats(peers), D(t["shares"]))}
    close(implied["ev_to_ebitda"].median, c["implied_per_share_median"])
    assert implied["price_to_earnings"].median is None  # no peer P/E available


# ── Engine behaviour ───────────────────────────────────────────────────────


def test_undefined_ratios_return_none_not_numbers():
    assert r.growth(D(10), D(0)) is None
    assert r.margin(D(10), D(-5)) is None
    assert r.roe(D(10), D(-100), D(50)) is None
    assert r.interest_coverage(D(100), None) is None
    assert r.interest_coverage(D(100), D(0)) is None
    assert r.effective_tax_rate(D(10), D(-50)) is None
    assert r.effective_tax_rate(D(60), D(50)) is None  # > 100% is not meaningful
    assert r.cagr(D(-1), D(10), 3) is None
    assert r.median([]) is None
    with pytest.raises(TypeError):
        r.D(0.1)  # floats are rejected


def test_mid_year_convention_discounts_half_a_year_less():
    base = assumptions(CASES["dcf_two_year"])
    mid = run_dcf(DcfAssumptions(**{**base.__dict__, "mid_year": True}))
    end = run_dcf(base)
    close(mid.rows[0].discount_factor, str(Decimal(1) / Decimal("1.1").sqrt()), Decimal("1e-26"))
    assert mid.sum_pv_fcff > end.sum_pv_fcff
    assert mid.pv_terminal_value == end.pv_terminal_value  # TV always discounted N full years


def test_exit_multiple_and_implied_cross_checks():
    base = assumptions(CASES["dcf_two_year"])
    g = run_dcf(base)
    # Using the Gordon result's implied exit multiple reproduces the same value, and vice versa.
    em = run_dcf(DcfAssumptions(**{**base.__dict__, "terminal_method": "exit_multiple", "exit_multiple": g.implied_exit_multiple}))
    close(em.per_share, str(g.per_share), Decimal("1e-25"))
    close(g.implied_perpetual_growth, "0.02", Decimal("1e-25"))
    assert exit_multiple_terminal_value(D(50), D(10)) == 500


def test_equity_bridge_includes_other_claims():
    plain = run_dcf(assumptions(CASES["dcf_two_year"]))
    res = run_dcf(assumptions(CASES["dcf_two_year"], minority_interest=D(50), preferred_equity=D(25), non_operating_assets=D(15)))
    assert res.enterprise_value == plain.enterprise_value  # claims affect equity only
    close(res.equity_value, str(plain.equity_value - 50 - 25 + 15))  # = EV − net debt − 60


def test_warnings_flag_fragile_results():
    res = run_dcf(assumptions(CASES["dcf_two_year"]))
    assert any("Terminal value" in w for w in res.warnings)  # 86% of EV in this toy case
    bad = run_dcf(assumptions(CASES["dcf_two_year"], net_debt=D(10_000)))
    assert any("Equity value is not positive" in w for w in bad.warnings)


@pytest.mark.parametrize(
    ("override", "message"),
    [
        ({"wacc": D("0.02")}, "WACC must exceed"),
        ({"diluted_shares": D(0)}, "shares"),
        ({"years": 0}, "1–30"),
        ({"tax_rate": D("1.2")}, "Tax rate"),
        ({"base_revenue": D(0)}, "Base revenue"),
        ({"terminal_method": "exit_multiple"}, "exit multiple"),
    ],
)
def test_invalid_inputs_are_rejected(override, message):
    with pytest.raises(DcfInputError, match=message):
        run_dcf(assumptions(CASES["dcf_two_year"], **override))


def test_sensitivity_grid():
    base = assumptions(CASES["dcf_two_year"])
    waccs, gs = grid(D("0.10"), D("0.01"), 1), [D("0.01"), D("0.02"), D("0.10")]
    m = sensitivity(base, waccs, gs)
    assert m[1][1] == run_dcf(base).per_share
    assert m[0][1] > m[1][1] > m[2][1]  # value falls as WACC rises
    assert m[1][2] is None  # g ≥ WACC is undefined, not a number


def test_probability_weighting():
    base = assumptions(CASES["dcf_two_year"])
    bear = DcfAssumptions(**{**base.__dict__, "wacc": D("0.12")})
    weighted, results = probability_weighted([Scenario("bear", D("0.25"), bear), Scenario("base", D("0.75"), base)])
    assert weighted == D("0.25") * results[0][1].per_share + D("0.75") * results[1][1].per_share
    with pytest.raises(DcfInputError, match="sum to 1"):
        probability_weighted([Scenario("base", D("0.9"), base)])


# ── Properties (Hypothesis) ─────────────────────────────────────────────────

rates = st.decimals(min_value=Decimal("0.05"), max_value=Decimal("0.15"), places=4)
growths = st.decimals(min_value=Decimal("0.00"), max_value=Decimal("0.03"), places=4)


@settings(max_examples=150, deadline=None)
@given(w=rates, g=growths, bump=st.decimals(min_value=Decimal("0.0005"), max_value=Decimal("0.02"), places=4))
def test_value_strictly_decreases_with_wacc(w, g, bump):
    base = assumptions(CASES["dcf_three_year_fade"], wacc=w, terminal_growth=g)
    assert run_dcf(base).enterprise_value > run_dcf(DcfAssumptions(**{**base.__dict__, "wacc": w + bump})).enterprise_value


@settings(max_examples=150, deadline=None)
@given(w=rates, g=growths, nd=st.decimals(min_value=Decimal(-500), max_value=Decimal(500), places=2))
def test_bridge_identity_and_terminal_share_bounds(w, g, nd):
    res = run_dcf(assumptions(CASES["dcf_three_year_fade"], wacc=w, terminal_growth=g, net_debt=nd))
    close(res.enterprise_value, str(res.sum_pv_fcff + res.pv_terminal_value), Decimal("1e-24"))
    close(res.equity_value, str(res.enterprise_value - nd), Decimal("1e-24"))
    assert res.terminal_share is not None and 0 < res.terminal_share < 1


# ── Metrics with traceability ───────────────────────────────────────────────


def period(fy: int, **vals) -> PeriodLines:
    return PeriodLines(
        f"FY{fy}", fy, {k: LineInput(k, None if v is None else D(v), "missing" if v is None else "reported") for k, v in vals.items()}
    )


def test_metrics_compute_with_inputs_and_reasons():
    p23 = period(2023, revenue=1000, equity=500, total_debt=300, cash=100)
    p24 = period(
        2024,
        revenue=1200,
        gross_profit=480,
        operating_income=240,
        depreciation_amortization=60,
        net_income=150,
        income_tax=50,
        pretax_income=200,
        equity=700,
        total_debt=300,
        cash=100,
        current_assets=400,
        current_liabilities=200,
        receivables=100,
        operating_cash_flow=260,
        capex=-60,
        interest_expense=None,
    )
    res = {(m.period, m.key): m for m in compute_metrics([p23, p24])}
    assert res[("FY2024", "revenue_growth")].value == D("0.2")
    assert res[("FY2024", "gross_margin")].value == D("0.4")
    assert res[("FY2024", "ebitda")].value == 300
    assert res[("FY2024", "free_cash_flow")].value == 200  # capex tagged negative is handled
    assert res[("FY2024", "roe")].value == D("0.25")  # 150 / avg(500, 700)
    # ROIC: 240 × (1 − 0.25) / avg(300+500−100, 300+700−100) = 180 / 800
    roic = res[("FY2024", "roic")]
    assert roic.value == D("0.225") and roic.assumptions == []
    assert {(i.period, i.line_key) for i in roic.inputs} >= {("FY2023", "equity"), ("FY2024", "operating_income")}
    quick = res[("FY2024", "quick_ratio")]
    assert quick.value == D("1") and "treated as zero" in quick.assumptions[0]
    cov = res[("FY2024", "interest_coverage")]
    assert cov.value is None and "Interest expense" in cov.reason
    first = res[("FY2023", "revenue_growth")]
    assert first.value is None and first.inputs[1].status == "missing"


def test_roic_falls_back_to_statutory_rate_and_says_so():
    p23 = period(2023, total_debt=0, equity=1000, cash=0)
    p24 = period(2024, operating_income=100, income_tax=0, pretax_income=-10, total_debt=0, equity=1000, cash=0)
    m = {x.key: x for x in compute_metrics([p23, p24]) if x.period == "FY2024"}["roic"]
    assert m.value == D("0.079") and "21% US statutory" in m.assumptions[0]


def test_data_quality_caveats_flow_into_metrics():
    p = PeriodLines(
        "FY2024",
        2024,
        {
            "total_debt": LineInput("total_debt", D(100), "derived", ("Partial: not every debt component was reported for this period",)),
            "equity": LineInput("equity", D(500), "reported"),
        },
    )
    m = {x.key: x for x in compute_metrics([p])}
    assert m["debt_to_equity"].value == D("0.2")
    assert any("Partial" in a for a in m["debt_to_equity"].assumptions)
    assert m["quick_ratio"].value is None and m["quick_ratio"].assumptions == []  # no caveats on undefined values


def test_non_consecutive_years_do_not_produce_growth():
    res = {(m.period, m.key): m for m in compute_metrics([period(2020, revenue=100), period(2022, revenue=150)])}
    assert res[("FY2022", "revenue_growth")].value is None


def test_every_metric_documents_formula_and_reason():
    for m in BY_KEY.values():
        assert m.formula and m.undefined_reason and m.needs
