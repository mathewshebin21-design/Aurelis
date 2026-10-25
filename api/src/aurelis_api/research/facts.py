"""Computed facts handed to the model: the only numbers it may quote.

Every fact has a stable id (F1, F2, …), a display string and the exact value,
and is produced by the deterministic engine from normalised statements.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import NormalizedLine
from ..normalize.concepts import BY_KEY as LINE_DEFS
from ..quant import ratios as r
from ..quant.metrics import BY_KEY as METRIC_DEFS
from ..quant.metrics import LineInput, PeriodLines, compute_metrics


@dataclass(frozen=True)
class Fact:
    id: str
    label: str
    period: str
    value: Decimal
    display: str
    unit: str  # currency | ratio | multiple | per_share
    source: str

    def as_prompt_line(self) -> str:
        return f"[{self.id}] {self.label}, {self.period}: {self.display}  (source: {self.source})"


def fmt(value: Decimal, unit: str, currency: str = "USD") -> str:
    if unit == "ratio":
        return f"{(value * 100).quantize(Decimal('0.1'))}%"
    if unit == "multiple":
        return f"{value.quantize(Decimal('0.01'))}x"
    if unit == "per_share":
        return f"{currency} {value.quantize(Decimal('0.01'))} per share"
    millions = (value / Decimal(1_000_000)).quantize(Decimal(1))
    return f"{currency} {millions:,} million"


STATEMENT_FACTS = (
    "revenue",
    "gross_profit",
    "operating_income",
    "net_income",
    "eps_diluted",
    "operating_cash_flow",
    "free_cash_flow",
    "cash",
    "total_debt",
)
METRIC_FACTS = (
    "revenue_growth",
    "gross_margin",
    "operating_margin",
    "net_margin",
    "fcf_margin",
    "roe",
    "roic",
    "current_ratio",
    "debt_to_equity",
    "net_debt_to_ebitda",
    "interest_coverage",
)


def _periods(session: Session, cik: int, period_type: str) -> list[PeriodLines]:
    rows = session.scalars(
        select(NormalizedLine)
        .where(NormalizedLine.cik == cik, NormalizedLine.period_type == period_type)
        .order_by(NormalizedLine.period_end)
    ).all()
    by: dict[tuple[int, str], dict[str, LineInput]] = {}
    for x in rows:
        by.setdefault((x.fiscal_year, x.fiscal_period), {})[x.line_key] = LineInput(x.line_key, x.value, x.status, tuple(x.notes or ()))
    return [
        PeriodLines(f"FY{fy}" if fp == "FY" else f"{fp} FY{fy}", fy, lines)
        for (fy, fp), lines in sorted(by.items())
        if any(li.status != "missing" for li in lines.values())
    ]


def build_facts(
    session: Session, cik: int, *, currency: str = "USD", years: int = 2, prefix: str = "F", label_prefix: str = ""
) -> list[Fact]:
    """Statement values and engine metrics for the latest `years` fiscal years plus the latest quarter."""
    facts: list[Fact] = []

    def add(label: str, period: str, value: Decimal | None, unit: str, source: str) -> None:
        if value is not None:
            facts.append(
                Fact(f"{prefix}{len(facts) + 1}", f"{label_prefix}{label}", period, value, fmt(value, unit, currency), unit, source)
            )

    annual = _periods(session, cik, "FY")
    metrics = {(m.period, m.key): m for m in compute_metrics(annual)}
    for p in annual[-years:]:
        for key in STATEMENT_FACTS:
            li = p.lines.get(key)
            unit = "per_share" if key.startswith("eps") else "currency"
            if li and li.value is not None:
                add(LINE_DEFS[key].label, p.label, li.value, unit, f"{li.status} statement line '{key}'")
        for key in METRIC_FACTS:
            m = metrics.get((p.label, key))
            if m and m.value is not None:
                add(METRIC_DEFS[key].label, p.label, m.value, m.unit, f"engine: {m.formula}")

    # Earnings: latest quarter versus the same quarter a year earlier (year-over-year).
    quarters = _periods(session, cik, "Q")
    if quarters:
        q = quarters[-1]
        fp = q.label.split()[0]
        prior = next((x for x in quarters if x.label == f"{fp} FY{q.fiscal_year - 1}"), None)
        for key in ("revenue", "operating_income", "net_income"):
            cur = q.lines.get(key)
            if cur and cur.value is not None:
                add(f"{LINE_DEFS[key].label} (quarter)", q.label, cur.value, "currency", f"{cur.status} statement line '{key}'")
                old = prior.lines.get(key) if prior else None
                yoy = r.growth(cur.value, old.value if old else None)
                if prior:
                    add(
                        f"{LINE_DEFS[key].label} growth vs. {prior.label}",
                        q.label,
                        yoy,
                        "ratio",
                        "engine: current / prior-year quarter − 1",
                    )
    return facts
