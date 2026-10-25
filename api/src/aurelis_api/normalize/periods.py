"""Reporting-period handling: classify durations and map dates to fiscal periods.

Fiscal-year labels follow one consistent convention: the fiscal year is named
after the calendar year in which it ends. Quarter numbers are derived from the
position of the period end inside that fiscal year, which handles 52/53-week
calendars (e.g. years ending on the last Saturday of September) through a
tolerance window rather than exact dates.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Literal

DurationKind = Literal["FY", "Q", "H1", "9M", "other"]

# 52/53-week years run 364–371 days; quarters 13–14 weeks (91–98 days) or calendar 89–92.
_RANGES: tuple[tuple[DurationKind, int, int], ...] = (
    ("Q", 84, 98),
    ("H1", 175, 190),
    ("9M", 266, 280),
    ("FY", 350, 380),
)

FYE_TOLERANCE_DAYS = 10


def duration_kind(start: date, end: date) -> DurationKind:
    days = (end - start).days + 1
    for kind, lo, hi in _RANGES:
        if lo <= days <= hi:
            return kind
    return "other"


def parse_fye(mmdd: str | None) -> tuple[int, int] | None:
    if not mmdd or len(mmdd) != 4 or not mmdd.isdigit():
        return None
    month, day = int(mmdd[:2]), int(mmdd[2:])
    if not (1 <= month <= 12 and 1 <= day <= 31):
        return None
    return month, day


def _nominal_fye(year: int, fye: tuple[int, int]) -> date:
    month, day = fye
    for d in (day, 30, 29, 28):  # e.g. "0229" or "0431" fall back to the month's last valid day
        try:
            return date(year, month, d)
        except ValueError:
            continue
    raise ValueError(f"Invalid fiscal year end {fye}")


@dataclass(frozen=True)
class FiscalPeriod:
    fiscal_year: int
    quarter: int  # 1–4; 4 coincides with the fiscal year end


def fiscal_period_for(end: date, fye: tuple[int, int]) -> FiscalPeriod:
    """Fiscal year and quarter for a period ending on `end`."""
    fy_end = _nominal_fye(end.year, fye)
    if fy_end < end - timedelta(days=FYE_TOLERANCE_DAYS):
        fy_end = _nominal_fye(end.year + 1, fye)
    days_before = (fy_end - end).days
    quarters_before = round(days_before / 91.31)
    quarter = max(1, min(4, 4 - quarters_before))
    return FiscalPeriod(fy_end.year, quarter)


def infer_fye(fy_period_ends: list[date]) -> tuple[int, int] | None:
    """Most common month/day among fiscal-year period ends (used when SEC metadata lacks it)."""
    if not fy_period_ends:
        return None
    (month, day), _ = Counter((d.month, d.day) for d in fy_period_ends).most_common(1)[0]
    return month, day
