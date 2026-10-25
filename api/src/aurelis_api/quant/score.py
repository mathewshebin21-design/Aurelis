"""Financial health score: transparent, rule-based, 0–100.

Five pillars, each scored from published threshold bands. The table is the
same for every issuer and is returned verbatim by the API as the methodology.
These are the same rules as the Phase 1 design preview (`web/src/lib/finance/score.ts`);
`tests/test_score.py` checks that the two stay identical.

Financial-sector issuers (SIC 6000–6799) do not report operating margin, EBITDA or
interest expense in an industrial sense. For them, a pillar whose metric is
undefined is *not applicable* rather than scored as a failure, and the total is
re-based over the applicable pillars. With fewer than three applicable pillars no
grade is given.

The score describes historical financial condition. It is not a forecast, a
rating or a recommendation.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from . import ratios as r

D = Decimal


@dataclass(frozen=True)
class Band:
    threshold: Decimal
    points: int


@dataclass(frozen=True)
class PillarRule:
    id: str
    label: str
    metric: str
    metric_key: str
    max: int
    bands: tuple[Band, ...]
    when_undefined: int
    rationale: str
    lower_is_better: bool = False


def _bands(*pairs: tuple[str, int]) -> tuple[Band, ...]:
    return tuple(Band(D(t), p) for t, p in pairs)


RULES: tuple[PillarRule, ...] = (
    PillarRule(
        "profitability",
        "Profitability",
        "Operating margin (latest FY)",
        "operating_margin",
        20,
        _bands(("0.25", 20), ("0.15", 15), ("0.08", 10), ("0", 5)),
        0,
        "Operating margin captures pricing power and cost discipline before financing choices.",
    ),
    PillarRule(
        "growth",
        "Growth",
        "3-year revenue CAGR",
        "revenue_cagr_3y",
        20,
        _bands(("0.2", 20), ("0.1", 15), ("0.05", 10), ("0", 5)),
        0,
        "Multi-year CAGR smooths single-year noise from acquisitions or cyclical peaks.",
    ),
    PillarRule(
        "returns",
        "Capital returns",
        "ROIC (latest FY)",
        "roic",
        20,
        _bands(("0.2", 20), ("0.12", 15), ("0.08", 10), ("0", 5)),
        0,
        "ROIC above the cost of capital indicates value creation from reinvestment.",
    ),
    PillarRule(
        "leverage",
        "Balance sheet",
        "Net debt / EBITDA",
        "net_debt_to_ebitda",
        20,
        _bands(("0", 20), ("1", 16), ("2", 12), ("3.5", 6)),
        0,
        "Leverage relative to cash earnings; negative EBITDA scores zero.",
        lower_is_better=True,
    ),
    PillarRule(
        "coverage",
        "Interest coverage",
        "EBIT / interest expense",
        "interest_coverage",
        20,
        _bands(("8", 20), ("4", 14), ("2", 7)),
        20,
        "Ability to service debt from operating profit; no interest expense earns full marks.",
    ),
)
MIN_APPLICABLE_FOR_GRADE = 3


def score_band(value: Decimal | None, rule: PillarRule) -> int:
    if value is None:
        return rule.when_undefined
    for b in rule.bands:
        if (value <= b.threshold) if rule.lower_is_better else (value >= b.threshold):
            return b.points
    return 0


def grade_for(total: int) -> str:
    return "Strong" if total >= 80 else "Sound" if total >= 60 else "Mixed" if total >= 40 else "Weak"


def is_financial_sector(sic: str | None) -> bool:
    return bool(sic and sic.isdigit() and 6000 <= int(sic) <= 6799)


def revenue_cagr_3y(revenue_by_year: dict[int, Decimal | None], latest_year: int) -> Decimal | None:
    return r.cagr(revenue_by_year.get(latest_year - 3), revenue_by_year.get(latest_year), 3)


@dataclass(frozen=True)
class PillarResult:
    id: str
    label: str
    metric: str
    metric_key: str
    value: Decimal | None
    points: int | None  # None = not applicable
    max: int
    applicable: bool
    note: str | None


@dataclass(frozen=True)
class Scorecard:
    total: int | None  # re-based to 100 over applicable pillars
    raw_points: int
    applicable_max: int
    grade: str | None
    pillars: list[PillarResult]
    notes: list[str]


def health_score(values: dict[str, Decimal | None], *, financial_sector: bool = False) -> Scorecard:
    pillars: list[PillarResult] = []
    for rule in RULES:
        v = values.get(rule.metric_key)
        if v is None and financial_sector:
            pillars.append(
                PillarResult(
                    rule.id,
                    rule.label,
                    rule.metric,
                    rule.metric_key,
                    None,
                    None,
                    rule.max,
                    False,
                    "Not applicable: metric undefined for a financial-sector issuer",
                )
            )
            continue
        note = None if v is not None else f"Metric undefined; rule awards {rule.when_undefined} points"
        pillars.append(PillarResult(rule.id, rule.label, rule.metric, rule.metric_key, v, score_band(v, rule), rule.max, True, note))
    applicable = [p for p in pillars if p.applicable]
    raw = sum(p.points or 0 for p in applicable)
    cap = sum(p.max for p in applicable)
    notes = []
    if len(applicable) < MIN_APPLICABLE_FOR_GRADE:
        notes.append(f"Only {len(applicable)} of {len(RULES)} pillars apply; no score or grade is given")
        return Scorecard(None, raw, cap, None, pillars, notes)
    total = raw if cap == 100 else int((D(raw) * 100 / D(cap)).to_integral_value(rounding="ROUND_HALF_EVEN"))
    if cap != 100:
        notes.append(f"Re-based to 100 over {len(applicable)} applicable pillars ({raw}/{cap} points)")
    return Scorecard(total, raw, cap, grade_for(total), pillars, notes)
