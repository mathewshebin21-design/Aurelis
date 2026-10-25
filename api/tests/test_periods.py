from datetime import date

import pytest

from aurelis_api.normalize.periods import duration_kind, fiscal_period_for, infer_fye, parse_fye


@pytest.mark.parametrize(
    ("start", "end", "kind"),
    [
        (date(2024, 1, 1), date(2024, 12, 31), "FY"),
        (date(2023, 10, 1), date(2024, 9, 28), "FY"),  # 52-week year
        (date(2022, 9, 25), date(2023, 9, 30), "FY"),  # 53-week year
        (date(2024, 1, 1), date(2024, 3, 31), "Q"),
        (date(2023, 10, 1), date(2023, 12, 30), "Q"),  # 13-week quarter
        (date(2024, 1, 1), date(2024, 6, 30), "H1"),
        (date(2024, 1, 1), date(2024, 9, 30), "9M"),
        (date(2024, 1, 1), date(2024, 1, 31), "other"),
    ],
)
def test_duration_kind(start, end, kind):
    assert duration_kind(start, end) == kind


@pytest.mark.parametrize(
    ("end", "fye", "fy", "q"),
    [
        # December year end
        (date(2024, 3, 31), (12, 31), 2024, 1),
        (date(2024, 12, 31), (12, 31), 2024, 4),
        # 52/53-week September calendar (nominal 09-28)
        (date(2023, 12, 30), (9, 28), 2024, 1),
        (date(2024, 3, 30), (9, 28), 2024, 2),
        (date(2024, 6, 29), (9, 28), 2024, 3),
        (date(2024, 9, 28), (9, 28), 2024, 4),
        (date(2023, 9, 30), (9, 28), 2023, 4),  # two days after nominal FYE still closes FY2023
        # Retailer with late-January year end: named after the calendar year in which it ends
        (date(2025, 2, 1), (1, 31), 2025, 4),
        (date(2024, 5, 4), (1, 31), 2025, 1),
    ],
)
def test_fiscal_period_for(end, fye, fy, q):
    p = fiscal_period_for(end, fye)
    assert (p.fiscal_year, p.quarter) == (fy, q)


def test_parse_and_infer_fye():
    assert parse_fye("0930") == (9, 30)
    assert parse_fye("1399") is None
    assert parse_fye(None) is None
    assert infer_fye([date(2022, 12, 31), date(2023, 12, 31), date(2021, 6, 30)]) == (12, 31)
    assert parse_fye("0229") == (2, 29)
    assert fiscal_period_for(date(2023, 2, 28), (2, 29)).quarter == 4  # non-leap year falls back to Feb 28
