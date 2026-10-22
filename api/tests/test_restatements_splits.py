from datetime import date
from decimal import Decimal

from aurelis_api.normalize.restatements import FactRecord, select_latest, split_ratio_cause, values_equal
from aurelis_api.normalize.splits import SplitAction, adjust, detect_splits, merge_actions, split_factor


def fact(value, accession, filed, form="10-K", concept="NetIncomeLoss", unit="USD", start=date(2023, 1, 1), end=date(2023, 12, 31)):
    return FactRecord("us-gaap", concept, unit, start, end, Decimal(str(value)), accession, form, filed)


def test_latest_filing_wins_and_original_is_kept():
    sel = select_latest([fact(100, "a", date(2024, 2, 1)), fact(95, "b", date(2024, 6, 1), "10-K/A"), fact(95, "c", date(2025, 2, 1))])
    (s,) = sel.values()
    assert s.fact.value == 95 and s.fact.accession == "c"
    assert s.original.value == 100
    assert s.restated and s.restatement_cause == "value_changed"
    assert s.times_reported == 3


def test_repeated_comparatives_are_not_restatements():
    (s,) = select_latest([fact(100, "a", date(2024, 2, 1)), fact(100, "b", date(2025, 2, 1))]).values()
    assert not s.restated and s.restatement_cause is None


def test_same_day_amendment_supersedes_original():
    (s,) = select_latest([fact(100, "b", date(2024, 2, 1), "10-K/A"), fact(90, "a", date(2024, 2, 1), "10-K")]).values()
    assert s.fact.form == "10-K/A"


def test_split_cause_detection():
    assert split_ratio_cause(Decimal("6.00"), Decimal("1.50")) == "consistent_with_split_4_for_1"
    assert split_ratio_cause(Decimal("0.30"), Decimal("3.00")) == "consistent_with_reverse_split_1_for_10"
    assert split_ratio_cause(Decimal("100"), Decimal("95")) is None
    assert split_ratio_cause(Decimal("1"), Decimal("-1")) is None


def test_tolerances():
    assert values_equal(Decimal("100.4"), Decimal("100"), "USD")
    assert not values_equal(Decimal("1.501"), Decimal("1.50"), "USD/shares")


def test_split_factor_only_applies_to_values_filed_before_the_split():
    actions = [SplitAction(Decimal(4), date(2024, 6, 29), "xbrl")]
    assert split_factor(date(2022, 9, 24), date(2023, 11, 3), actions) == 4  # old value, never re-filed
    assert split_factor(date(2023, 9, 30), date(2024, 11, 1), actions) == 1  # re-filed after split: already adjusted
    two = [*actions, SplitAction(Decimal(2), date(2025, 1, 1), "manual")]
    assert split_factor(date(2022, 9, 24), date(2023, 11, 3), two) == 8
    assert adjust(Decimal("5.00"), "per_share", Decimal(4)) == Decimal("1.25")
    assert adjust(Decimal(100), "shares", Decimal(4)) == 400
    assert adjust(Decimal(100), "money", Decimal(4)) == 100


def test_detect_and_merge_splits():
    facts = [
        fact(4, "q", date(2024, 8, 2), "10-Q", "StockholdersEquityNoteStockSplitConversionRatio1", "pure", None, date(2024, 6, 29)),
        fact(4, "k", date(2024, 11, 1), "10-K", "StockholdersEquityNoteStockSplitConversionRatio1", "pure", None, date(2024, 9, 28)),
    ]
    detected = detect_splits(facts)
    assert len(detected) == 1 and detected[0].ratio == 4 and detected[0].effective_date == date(2024, 6, 29)
    manual = [SplitAction(Decimal(4), date(2024, 6, 10), "manual")]
    merged = merge_actions(detected, manual)
    assert merged == manual  # manual entry overrides the approximate XBRL date
