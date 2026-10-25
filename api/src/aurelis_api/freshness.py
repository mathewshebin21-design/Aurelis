"""Data-freshness tracking.

Two independent questions:
  1. Is our copy recent? (when did we last check SEC successfully)
  2. Should a newer filing exist? (based on the latest period we hold and SEC filing deadlines)
Deadlines use the longest standard windows (non-accelerated filers: 10-Q 45 days,
10-K 90 days) so larger filers are never flagged early.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta

from .normalize.periods import fiscal_period_for

TEN_Q_DAYS = 45
TEN_K_DAYS = 90
QUARTER_DAYS = 91


@dataclass(frozen=True)
class Freshness:
    status: str  # current | filing_expected | no_data
    sync_status: str  # fresh | stale | never_checked
    latest_period_end: date | None
    next_period_end: date | None
    next_filing_expected_by: date | None
    last_checked_at: datetime | None
    explanation: str


def assess(
    *,
    latest_period_end: date | None,
    fye: tuple[int, int] | None,
    last_checked_at: datetime | None,
    now: datetime,
    sync_max_age_hours: int = 24,
) -> Freshness:
    if last_checked_at is None:
        sync = "never_checked"
    elif now - last_checked_at > timedelta(hours=sync_max_age_hours):
        sync = "stale"
    else:
        sync = "fresh"

    if latest_period_end is None or fye is None:
        return Freshness("no_data", sync, latest_period_end, None, None, last_checked_at, "No normalised periods stored yet")

    next_end = latest_period_end + timedelta(days=QUARTER_DAYS)
    is_annual = fiscal_period_for(next_end, fye).quarter == 4
    due = next_end + timedelta(days=TEN_K_DAYS if is_annual else TEN_Q_DAYS)
    form = "10-K" if is_annual else "10-Q"
    today = now.date()
    if today > due:
        return Freshness(
            "filing_expected",
            sync,
            latest_period_end,
            next_end,
            due,
            last_checked_at,
            f"A {form} for the period ending around {next_end} was due by {due}; it has not been ingested",
        )
    return Freshness("current", sync, latest_period_end, next_end, due, last_checked_at, f"Next {form} expected by {due}")
