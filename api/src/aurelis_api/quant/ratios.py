"""Financial ratios. Each function returns `None` when the ratio is undefined."""

from __future__ import annotations

from collections.abc import Iterable
from decimal import Decimal, localcontext

PRECISION = 34  # IEEE 754 decimal128; far beyond any reported precision

ZERO = Decimal(0)
ONE = Decimal(1)
TWO = Decimal(2)

Num = Decimal | None


def D(x: int | str | Decimal) -> Decimal:  # noqa: N802 — conventional short constructor
    """Build a Decimal without going through binary floats."""
    if isinstance(x, float):
        raise TypeError("Use str or int, not float, to avoid binary rounding")
    return x if isinstance(x, Decimal) else Decimal(x)


def _div(n: Num, d: Num) -> Num:
    if n is None or d is None or d == 0:
        return None
    with localcontext() as ctx:
        ctx.prec = PRECISION
        return n / d


def _positive_div(n: Num, d: Num) -> Num:
    """Ratios whose denominator must be positive to be meaningful (e.g. margin on revenue)."""
    if d is None or d <= 0:
        return None
    return _div(n, d)


def growth(current: Num, prior: Num) -> Num:
    """Period-over-period growth: current / prior − 1. Undefined if prior ≤ 0."""
    r = _positive_div(current, prior)
    return None if r is None else r - ONE


def cagr(start: Num, end: Num, years: int) -> Num:
    if start is None or end is None or start <= 0 or end <= 0 or years <= 0:
        return None
    with localcontext() as ctx:
        ctx.prec = PRECISION
        return (end / start) ** (ONE / D(years)) - ONE


def margin(value: Num, revenue: Num) -> Num:
    return _positive_div(value, revenue)


def ebitda(ebit: Num, depreciation_amortization: Num) -> Num:
    return None if ebit is None or depreciation_amortization is None else ebit + depreciation_amortization


def free_cash_flow(operating_cash_flow: Num, capex: Num) -> Num:
    """CFO − |capex|. Issuers tag capex as a positive payment; abs() also accepts negative tagging."""
    return None if operating_cash_flow is None or capex is None else operating_cash_flow - abs(capex)


def average(begin: Num, end: Num) -> Num:
    if begin is None or end is None:
        return None
    return (begin + end) / TWO


def roe(net_income: Num, equity_begin: Num, equity_end: Num) -> Num:
    """Net income / average shareholders' equity. Undefined when average equity ≤ 0."""
    return _positive_div(net_income, average(equity_begin, equity_end))


def invested_capital(total_debt: Num, equity: Num, cash: Num) -> Num:
    """Debt + equity − cash (operating approach to invested capital)."""
    if total_debt is None or equity is None or cash is None:
        return None
    return total_debt + equity - cash


def nopat(ebit: Num, tax_rate: Num) -> Num:
    return None if ebit is None or tax_rate is None else ebit * (ONE - tax_rate)


def roic(ebit: Num, tax_rate: Num, ic_begin: Num, ic_end: Num) -> Num:
    """NOPAT / average invested capital. Undefined when average invested capital ≤ 0."""
    return _positive_div(nopat(ebit, tax_rate), average(ic_begin, ic_end))


def effective_tax_rate(income_tax: Num, pretax_income: Num) -> Num:
    """Income tax / pre-tax income, only when pre-tax income is positive and the rate lies in [0, 1]."""
    r = _positive_div(income_tax, pretax_income)
    return r if r is not None and ZERO <= r <= ONE else None


def current_ratio(current_assets: Num, current_liabilities: Num) -> Num:
    return _positive_div(current_assets, current_liabilities)


def quick_ratio(cash: Num, short_term_investments: Num, receivables: Num, current_liabilities: Num) -> Num:
    """(Cash + short-term investments + receivables) / current liabilities. Missing STI counts as zero."""
    if cash is None or receivables is None:
        return None
    return _positive_div(cash + (short_term_investments or ZERO) + receivables, current_liabilities)


def debt_to_equity(total_debt: Num, equity: Num) -> Num:
    return _positive_div(total_debt, equity)


def debt_to_ebitda(total_debt: Num, ebitda_value: Num) -> Num:
    return _positive_div(total_debt, ebitda_value)


def net_debt(total_debt: Num, cash: Num, short_term_investments: Num = None) -> Num:
    if total_debt is None or cash is None:
        return None
    return total_debt - cash - (short_term_investments or ZERO)


def net_debt_to_ebitda(net_debt_value: Num, ebitda_value: Num) -> Num:
    return _positive_div(net_debt_value, ebitda_value)


def interest_coverage(ebit: Num, interest_expense: Num) -> Num:
    """EBIT / interest expense. Undefined (not infinite) when there is no interest expense."""
    if interest_expense is None:
        return None
    return _positive_div(ebit, abs(interest_expense))


def median(values: Iterable[Num]) -> Num:
    xs = sorted(v for v in values if v is not None)
    if not xs:
        return None
    mid = len(xs) // 2
    return xs[mid] if len(xs) % 2 else (xs[mid - 1] + xs[mid]) / TWO


def percentile(values: Iterable[Num], p: Decimal) -> Num:
    """Linear-interpolation percentile (same definition as Excel PERCENTILE.INC), p in [0, 1]."""
    xs = sorted(v for v in values if v is not None)
    if not xs or not ZERO <= p <= ONE:
        return None
    pos = p * D(len(xs) - 1)
    lo = int(pos)
    hi = min(lo + 1, len(xs) - 1)
    return xs[lo] + (xs[hi] - xs[lo]) * (pos - D(lo))
