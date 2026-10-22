"""Choose one value per (concept, unit, period) when several filings report it.

The same fact is normally repeated as a comparative in later filings. When a
later filing reports a *different* value for the same period, that is a
restatement (or a retroactive split adjustment). We keep the most recently
filed value as current, retain the originally reported value, and record the
filing that changed it.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

COMMON_SPLIT_RATIOS = (2, 3, 4, 5, 6, 7, 8, 10, 15, 20, 25, 30, 40, 50)


@dataclass(frozen=True)
class FactRecord:
    taxonomy: str
    concept: str
    unit: str
    start: date | None
    end: date
    value: Decimal
    accession: str
    form: str
    filed: date


@dataclass(frozen=True)
class Selected:
    fact: FactRecord  # the current (most recently filed) value
    original: FactRecord  # the first value ever filed for this period
    times_reported: int

    @property
    def restated(self) -> bool:
        return not values_equal(self.fact.value, self.original.value, self.fact.unit)

    @property
    def restatement_cause(self) -> str | None:
        if not self.restated:
            return None
        return split_ratio_cause(self.original.value, self.fact.value) or "value_changed"


def values_equal(a: Decimal, b: Decimal, unit: str) -> bool:
    # Monetary facts are reported to at most the unit; ignore sub-unit noise.
    tol = Decimal("0.5") if "/" not in unit and unit != "pure" else Decimal("0.0005")
    return abs(a - b) <= tol


def split_ratio_cause(original: Decimal, latest: Decimal) -> str | None:
    """Label a change that matches a common split ratio (e.g. EPS 6.00 → 1.50 is 4:1)."""
    if original == 0 or latest == 0 or (original > 0) != (latest > 0):
        return None
    ratio = abs(original / latest)
    for r in COMMON_SPLIT_RATIOS:
        for candidate, label in ((Decimal(r), f"split_{r}_for_1"), (Decimal(1) / Decimal(r), f"reverse_split_1_for_{r}")):
            if abs(ratio - candidate) / candidate < Decimal("0.02"):
                return f"consistent_with_{label}"
    return None


def _order(f: FactRecord) -> tuple[date, bool, str]:
    # Later filing wins; on the same day an amendment (/A) supersedes the original.
    return (f.filed, f.form.endswith("/A"), f.accession)


def select_latest(facts: Iterable[FactRecord]) -> dict[tuple[str, str, str, date | None, date], Selected]:
    groups: dict[tuple[str, str, str, date | None, date], list[FactRecord]] = defaultdict(list)
    for f in facts:
        groups[(f.taxonomy, f.concept, f.unit, f.start, f.end)].append(f)
    out = {}
    for key, rows in groups.items():
        rows.sort(key=_order)
        out[key] = Selected(fact=rows[-1], original=rows[0], times_reported=len(rows))
    return out
