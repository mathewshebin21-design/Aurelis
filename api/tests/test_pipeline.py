"""Normalisation of the synthetic Fixture Corp payload. Expected values are worked by hand."""

from decimal import Decimal

import pytest

from aurelis_api.edgar.parse import iter_company_facts
from aurelis_api.normalize.pipeline import normalize
from aurelis_api.normalize.restatements import FactRecord
from aurelis_api.normalize.splits import detect_splits

from .fixtures import synthetic as fx

M = Decimal(1_000_000)


def records(payload):
    return [
        FactRecord(f.taxonomy, f.concept, f.unit, f.start, f.end, f.value, f.accession, f.form, f.filed)
        for f in iter_company_facts(payload)
    ]


@pytest.fixture(scope="module")
def result():
    recs = records(fx.company_facts())
    return normalize(recs, fiscal_year_end="0928", split_actions=detect_splits(recs))


def line(result, key, period_type, fy, fp):
    matches = [
        v for v in result.lines if v.line_key == key and v.period_type == period_type and v.fiscal_year == fy and v.fiscal_period == fp
    ]
    assert len(matches) == 1, f"{key} {period_type} {fp} {fy}: {len(matches)} rows"
    return matches[0]


def test_reporting_currency_and_fye(result):
    assert result.reporting_currency == "USD"
    assert result.fiscal_year_end == (9, 28)
    assert result.warnings == []


def test_concept_switch_keeps_one_revenue_line(result):
    fy22 = line(result, "revenue", "FY", 2022, "FY")
    fy23 = line(result, "revenue", "FY", 2023, "FY")
    assert fy22.value == 800 * M and fy22.source_concept == "us-gaap:SalesRevenueNet"
    assert fy23.value == 1000 * M and fy23.source_concept == "us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax"
    assert fy23.source_accession == fx.K24 and fy23.status == "reported" and not fy23.restated


def test_quarters_direct_and_derived(result):
    assert [line(result, "revenue", "Q", 2024, f"Q{i}").value for i in (1, 2, 3)] == [280 * M, 300 * M, 290 * M]
    q4 = line(result, "revenue", "Q", 2024, "Q4")
    assert q4.value == 330 * M and q4.status == "derived" and q4.rule_id == "q4_from_fy_less_9m"


def test_cash_flow_quarters_from_ytd(result):
    got = {fp: line(result, "operating_cash_flow", "Q", 2024, fp) for fp in ("Q1", "Q2", "Q3", "Q4")}
    assert got["Q1"].value == 60 * M and got["Q1"].status == "reported"
    assert (got["Q2"].value, got["Q2"].rule_id) == (70 * M, "q2_from_h1_less_q1")
    assert (got["Q3"].value, got["Q3"].rule_id) == (80 * M, "q3_from_9m_less_h1")
    assert (got["Q4"].value, got["Q4"].rule_id) == (90 * M, "q4_from_fy_less_9m")


def test_derived_lines(result):
    assert line(result, "gross_profit", "FY", 2024, "FY").value == 500 * M
    assert line(result, "gross_profit", "FY", 2024, "FY").rule_id == "gross_profit_from_revenue_less_cost"
    assert line(result, "ebitda", "FY", 2024, "FY").value == 320 * M
    assert line(result, "free_cash_flow", "FY", 2023, "FY").value == 200 * M
    debt = line(result, "total_debt", "FY", 2024, "FY")
    assert debt.value == 450 * M and any("Partial" in n for n in debt.notes)


def test_missing_values_are_explicit_not_imputed(result):
    gp22 = line(result, "gross_profit", "FY", 2022, "FY")
    assert gp22.status == "missing" and gp22.value is None
    cogs22 = line(result, "cost_of_revenue", "FY", 2022, "FY")
    assert cogs22.status == "missing" and "CostOfRevenue" in cogs22.notes[0]
    assert line(result, "eps_diluted", "Q", 2024, "Q4").status == "missing"


def test_restatement_is_flagged_with_original(result):
    ni = line(result, "net_income", "FY", 2023, "FY")
    assert ni.value == 95 * M and ni.restated and ni.original_value == 100 * M
    assert ni.source_accession == fx.K24
    assert "value_changed" in ni.notes[0] and fx.K23 in ni.notes[0]


def test_split_handling(result):
    eps23 = line(result, "eps_diluted", "FY", 2023, "FY")
    assert eps23.value == Decimal("1.50") and eps23.split_factor is None
    assert eps23.restated and "consistent_with_split_4_for_1" in eps23.notes[0]
    eps22 = line(result, "eps_diluted", "FY", 2022, "FY")
    assert eps22.value == Decimal("1.25") and eps22.split_factor == 4
    assert line(result, "eps_diluted", "FY", 2024, "FY").value == Decimal("1.80")


def test_balance_sheet_identity_and_period_mapping(result):
    for fy in (2023, 2024):
        a = line(result, "total_assets", "FY", fy, "FY").value
        le = line(result, "liabilities_and_equity", "FY", fy, "FY").value
        lia = line(result, "total_liabilities", "FY", fy, "FY").value
        eq = line(result, "equity", "FY", fy, "FY").value
        assert a == le == lia + eq
    assert line(result, "cash", "Q", 2024, "Q3").value == 280 * M
    assert line(result, "total_assets", "Q", 2024, "Q4").value == 2300 * M


def test_dei_facts_do_not_leak_into_statements(result):
    assert not any(v.source_concept and v.source_concept.startswith("dei:") for v in result.lines)


def test_non_usd_filer_keeps_native_currency():
    res = normalize(records(fx.eur_company_facts()), fiscal_year_end="1231")
    rev = line(res, "revenue", "FY", 2024, "FY")
    assert res.reporting_currency == "EUR" and rev.currency == "EUR" and rev.value == 5_000_000


def test_fiscal_year_end_inferred_when_missing():
    res = normalize(records(fx.eur_company_facts()), fiscal_year_end=None)
    assert res.fiscal_year_end == (12, 31) and "inferred" in res.warnings[0]
