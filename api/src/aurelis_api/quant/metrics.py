"""Compute financial metrics from normalised statement lines, with full traceability.

Each metric result carries its formula, the exact input lines (with their own
status: reported / derived / missing) and, when it cannot be computed, the
reason. Nothing is estimated: a missing input yields `value = None`.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Literal

from . import ratios as r

Unit = Literal["ratio", "multiple", "currency"]
US_STATUTORY_TAX = Decimal("0.21")


@dataclass(frozen=True)
class LineInput:
    """A statement value for one period (subset of NormalizedLine)."""

    line_key: str
    value: Decimal | None
    status: str  # reported | derived | missing
    notes: tuple[str, ...] = ()


@dataclass(frozen=True)
class PeriodLines:
    label: str  # e.g. "FY2024"
    fiscal_year: int
    lines: dict[str, LineInput]


@dataclass(frozen=True)
class InputRef:
    period: str
    line_key: str
    value: Decimal | None
    status: str


@dataclass
class MetricResult:
    key: str
    label: str
    unit: Unit
    formula: str
    period: str
    value: Decimal | None
    inputs: list[InputRef]
    assumptions: list[str] = field(default_factory=list)
    reason: str | None = None


@dataclass(frozen=True)
class MetricDef:
    key: str
    label: str
    unit: Unit
    formula: str
    needs: tuple[tuple[str, int], ...]  # (line_key, period offset: 0 = current, -1 = prior)
    compute: Callable[[dict[tuple[str, int], Decimal | None], list[str]], Decimal | None]
    undefined_reason: str


def _tax_rate(v: dict[tuple[str, int], Decimal | None], assumptions: list[str]) -> Decimal:
    rate = r.effective_tax_rate(v.get(("income_tax", 0)), v.get(("pretax_income", 0)))
    if rate is None:
        assumptions.append("Effective tax rate not meaningful for this period; used 21% US statutory rate")
        return US_STATUTORY_TAX
    return rate


def _sti(v: dict[tuple[str, int], Decimal | None], assumptions: list[str]) -> Decimal | None:
    sti = v.get(("short_term_investments", 0))
    if sti is None:
        assumptions.append("Short-term investments not reported; treated as zero")
    return sti


def _ic(v: dict[tuple[str, int], Decimal | None], off: int) -> Decimal | None:
    return r.invested_capital(v.get(("total_debt", off)), v.get(("equity", off)), v.get(("cash", off)))


METRICS: tuple[MetricDef, ...] = (
    MetricDef(
        "revenue_growth",
        "Revenue growth",
        "ratio",
        "revenue_t / revenue_{t−1} − 1",
        (("revenue", 0), ("revenue", -1)),
        lambda v, a: r.growth(v[("revenue", 0)], v[("revenue", -1)]),
        "Prior-period revenue is missing or not positive",
    ),
    MetricDef(
        "gross_margin",
        "Gross margin",
        "ratio",
        "gross_profit / revenue",
        (("gross_profit", 0), ("revenue", 0)),
        lambda v, a: r.margin(v[("gross_profit", 0)], v[("revenue", 0)]),
        "Gross profit is not reported (common for banks and insurers) or revenue is not positive",
    ),
    MetricDef(
        "ebit",
        "EBIT (operating income)",
        "currency",
        "operating_income",
        (("operating_income", 0),),
        lambda v, a: v[("operating_income", 0)],
        "Operating income is not reported (common for banks)",
    ),
    MetricDef(
        "operating_margin",
        "Operating (EBIT) margin",
        "ratio",
        "operating_income / revenue",
        (("operating_income", 0), ("revenue", 0)),
        lambda v, a: r.margin(v[("operating_income", 0)], v[("revenue", 0)]),
        "Operating income is not reported or revenue is not positive",
    ),
    MetricDef(
        "ebitda",
        "EBITDA",
        "currency",
        "operating_income + depreciation_amortization",
        (("operating_income", 0), ("depreciation_amortization", 0)),
        lambda v, a: r.ebitda(v[("operating_income", 0)], v[("depreciation_amortization", 0)]),
        "Operating income or D&A is not reported",
    ),
    MetricDef(
        "ebitda_margin",
        "EBITDA margin",
        "ratio",
        "(operating_income + depreciation_amortization) / revenue",
        (("operating_income", 0), ("depreciation_amortization", 0), ("revenue", 0)),
        lambda v, a: r.margin(r.ebitda(v[("operating_income", 0)], v[("depreciation_amortization", 0)]), v[("revenue", 0)]),
        "EBITDA inputs are missing or revenue is not positive",
    ),
    MetricDef(
        "net_margin",
        "Net margin",
        "ratio",
        "net_income / revenue",
        (("net_income", 0), ("revenue", 0)),
        lambda v, a: r.margin(v[("net_income", 0)], v[("revenue", 0)]),
        "Net income or revenue is missing, or revenue is not positive",
    ),
    MetricDef(
        "free_cash_flow",
        "Free cash flow",
        "currency",
        "operating_cash_flow − |capex|",
        (("operating_cash_flow", 0), ("capex", 0)),
        lambda v, a: r.free_cash_flow(v[("operating_cash_flow", 0)], v[("capex", 0)]),
        "Operating cash flow or capital expenditure is not reported",
    ),
    MetricDef(
        "fcf_margin",
        "Free-cash-flow margin",
        "ratio",
        "(operating_cash_flow − |capex|) / revenue",
        (("operating_cash_flow", 0), ("capex", 0), ("revenue", 0)),
        lambda v, a: r.margin(r.free_cash_flow(v[("operating_cash_flow", 0)], v[("capex", 0)]), v[("revenue", 0)]),
        "Free-cash-flow inputs are missing or revenue is not positive",
    ),
    MetricDef(
        "effective_tax_rate",
        "Effective tax rate",
        "ratio",
        "income_tax / pretax_income",
        (("income_tax", 0), ("pretax_income", 0)),
        lambda v, a: r.effective_tax_rate(v[("income_tax", 0)], v[("pretax_income", 0)]),
        "Pre-tax income is not positive, or the rate falls outside 0–100%",
    ),
    MetricDef(
        "roe",
        "Return on equity",
        "ratio",
        "net_income / average(equity_{t−1}, equity_t)",
        (("net_income", 0), ("equity", 0), ("equity", -1)),
        lambda v, a: r.roe(v[("net_income", 0)], v[("equity", -1)], v[("equity", 0)]),
        "Opening or closing equity is missing, or average equity is not positive",
    ),
    MetricDef(
        "roic",
        "Return on invested capital",
        "ratio",
        "operating_income × (1 − tax rate) / average(total_debt + equity − cash)",
        (
            ("operating_income", 0),
            ("income_tax", 0),
            ("pretax_income", 0),
            ("total_debt", 0),
            ("equity", 0),
            ("cash", 0),
            ("total_debt", -1),
            ("equity", -1),
            ("cash", -1),
        ),
        lambda v, a: r.roic(v[("operating_income", 0)], _tax_rate(v, a), _ic(v, -1), _ic(v, 0)),
        "Operating income or invested-capital inputs (debt, equity, cash at both period ends) are missing",
    ),
    MetricDef(
        "current_ratio",
        "Current ratio",
        "multiple",
        "current_assets / current_liabilities",
        (("current_assets", 0), ("current_liabilities", 0)),
        lambda v, a: r.current_ratio(v[("current_assets", 0)], v[("current_liabilities", 0)]),
        "Classified balance sheet not reported (banks and insurers do not split current items)",
    ),
    MetricDef(
        "quick_ratio",
        "Quick ratio",
        "multiple",
        "(cash + short_term_investments + receivables) / current_liabilities",
        (("cash", 0), ("short_term_investments", 0), ("receivables", 0), ("current_liabilities", 0)),
        lambda v, a: r.quick_ratio(v[("cash", 0)], _sti(v, a), v[("receivables", 0)], v[("current_liabilities", 0)]),
        "Cash, receivables or current liabilities are not reported",
    ),
    MetricDef(
        "debt_to_equity",
        "Debt / equity",
        "multiple",
        "total_debt / equity",
        (("total_debt", 0), ("equity", 0)),
        lambda v, a: r.debt_to_equity(v[("total_debt", 0)], v[("equity", 0)]),
        "Total debt is missing or equity is not positive",
    ),
    MetricDef(
        "debt_to_ebitda",
        "Debt / EBITDA",
        "multiple",
        "total_debt / EBITDA",
        (("total_debt", 0), ("operating_income", 0), ("depreciation_amortization", 0)),
        lambda v, a: r.debt_to_ebitda(v[("total_debt", 0)], r.ebitda(v[("operating_income", 0)], v[("depreciation_amortization", 0)])),
        "Total debt or EBITDA inputs are missing, or EBITDA is not positive",
    ),
    MetricDef(
        "net_debt_to_ebitda",
        "Net debt / EBITDA",
        "multiple",
        "(total_debt − cash − short_term_investments) / EBITDA",
        (("total_debt", 0), ("cash", 0), ("short_term_investments", 0), ("operating_income", 0), ("depreciation_amortization", 0)),
        lambda v, a: r.net_debt_to_ebitda(
            r.net_debt(v[("total_debt", 0)], v[("cash", 0)], _sti(v, a)),
            r.ebitda(v[("operating_income", 0)], v[("depreciation_amortization", 0)]),
        ),
        "Debt, cash or EBITDA inputs are missing, or EBITDA is not positive",
    ),
    MetricDef(
        "interest_coverage",
        "Interest coverage",
        "multiple",
        "operating_income / interest_expense",
        (("operating_income", 0), ("interest_expense", 0)),
        lambda v, a: r.interest_coverage(v[("operating_income", 0)], v[("interest_expense", 0)]),
        "Interest expense is not reported (or zero), or operating income is missing",
    ),
)

BY_KEY = {m.key: m for m in METRICS}


def compute_metrics(periods: list[PeriodLines]) -> list[MetricResult]:
    """Metrics for every period. `periods` must be in chronological order (oldest first)."""
    out: list[MetricResult] = []
    for i, p in enumerate(periods):
        prior = periods[i - 1] if i > 0 and periods[i - 1].fiscal_year == p.fiscal_year - 1 else None
        for m in METRICS:
            values: dict[tuple[str, int], Decimal | None] = {}
            refs: list[InputRef] = []
            for key, off in m.needs:
                src = p if off == 0 else prior
                li = src.lines.get(key) if src else None
                values[(key, off)] = li.value if li else None
                refs.append(
                    InputRef(src.label if src else f"FY{p.fiscal_year - 1}", key, li.value if li else None, li.status if li else "missing")
                )
            assumptions: list[str] = []
            value = m.compute(values, assumptions)
            if value is None:
                assumptions = []  # caveats only matter for a value that exists
            else:
                for key, off in m.needs:  # carry data-quality caveats from the statement lines into the metric
                    src = p if off == 0 else prior
                    li = src.lines.get(key) if src else None
                    for note in li.notes if li else ():
                        if note.startswith(("Partial", "Integrity check failed")):
                            assumptions.append(f"{key} ({src.label if src else ''}): {note}")
            out.append(
                MetricResult(
                    key=m.key,
                    label=m.label,
                    unit=m.unit,
                    formula=m.formula,
                    period=p.label,
                    value=value,
                    inputs=refs,
                    assumptions=assumptions,
                    reason=None if value is not None else m.undefined_reason,
                )
            )
    return out
