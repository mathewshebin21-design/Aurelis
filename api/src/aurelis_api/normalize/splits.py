"""Stock-split handling for per-share values and share counts.

Filings made after a split restate comparative periods retroactively, so the
most recently filed value for such periods is already adjusted. Only values
whose latest filing predates the split need adjusting: per-share amounts are
divided by the cumulative ratio and share counts multiplied by it.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal

from .concepts import SPLIT_RATIO_CONCEPT
from .restatements import FactRecord


@dataclass(frozen=True)
class SplitAction:
    ratio: Decimal  # new shares per old share; 0.1 for a 1-for-10 reverse split
    effective_date: date
    source: str  # "xbrl" | "manual"
    source_accession: str | None = None
    note: str | None = None


def detect_splits(facts: Iterable[FactRecord]) -> list[SplitAction]:
    """Splits disclosed through the XBRL split-ratio concept.

    The disclosing fact's period end is used as the effective date; it is an
    approximation, recorded in the note, and can be overridden manually.
    """
    found: list[SplitAction] = []
    for f in sorted((f for f in facts if f.concept == SPLIT_RATIO_CONCEPT and f.value > 0), key=lambda f: f.end):
        if any(a.ratio == f.value and abs((a.effective_date - f.end).days) <= 400 for a in found):
            continue  # the same split repeated in later filings
        found.append(
            SplitAction(
                ratio=f.value,
                effective_date=f.end,
                source="xbrl",
                source_accession=f.accession,
                note="Effective date approximated by the period end of the disclosing fact",
            )
        )
    return found


def merge_actions(detected: list[SplitAction], manual: list[SplitAction]) -> list[SplitAction]:
    """Manual entries override detected ones within 120 days of each other."""
    kept = [d for d in detected if not any(abs((d.effective_date - m.effective_date).days) <= 120 for m in manual)]
    return sorted(kept + manual, key=lambda a: a.effective_date)


def split_factor(period_end: date, filed: date, actions: list[SplitAction]) -> Decimal:
    """Cumulative ratio of splits that happened after the value was last filed."""
    factor = Decimal(1)
    for a in actions:
        if filed < a.effective_date and period_end < a.effective_date + timedelta(days=1):
            factor *= a.ratio
    return factor


def adjust(value: Decimal, kind: str, factor: Decimal) -> Decimal:
    if factor == 1:
        return value
    if kind == "per_share":
        return value / factor
    if kind == "shares":
        return value * factor
    return value
