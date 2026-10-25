from datetime import UTC, date, datetime

from aurelis_api.freshness import assess

NOW = datetime(2025, 1, 10, 12, tzinfo=UTC)


def test_current_when_next_10q_not_yet_due():
    f = assess(latest_period_end=date(2024, 9, 28), fye=(9, 28), last_checked_at=NOW, now=NOW)
    # next quarter ends ~2024-12-28 (Q1); 10-Q due 45 days later
    assert f.status == "current" and f.sync_status == "fresh"
    assert f.next_period_end == date(2024, 12, 28) and f.next_filing_expected_by == date(2025, 2, 11)


def test_filing_expected_when_deadline_passed():
    f = assess(latest_period_end=date(2024, 3, 30), fye=(9, 28), last_checked_at=datetime(2025, 1, 1, tzinfo=UTC), now=NOW)
    assert f.status == "filing_expected" and f.sync_status == "stale"
    assert "10-Q" in f.explanation


def test_annual_deadline_uses_10k_window():
    f = assess(latest_period_end=date(2024, 9, 30), fye=(12, 31), last_checked_at=None, now=NOW)
    assert f.next_period_end == date(2024, 12, 30)
    assert f.next_filing_expected_by == date(2025, 3, 30) and f.status == "current"
    assert f.sync_status == "never_checked"


def test_no_data():
    assert assess(latest_period_end=None, fye=None, last_checked_at=None, now=NOW).status == "no_data"
