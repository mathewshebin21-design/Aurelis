"""Enterprise value, equity value and comparable-company multiples."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from .ratios import ZERO, Num, _positive_div, median, percentile
from .ratios import D as _D


def enterprise_value(
    market_cap: Decimal, total_debt: Decimal, cash: Decimal, minority_interest: Decimal = ZERO, preferred: Decimal = ZERO
) -> Decimal:
    """Market cap + debt + minority interest + preferred − cash."""
    return market_cap + total_debt + minority_interest + preferred - cash


def equity_value_from_ev(ev: Decimal, net_debt: Decimal, minority_interest: Decimal = ZERO, preferred: Decimal = ZERO) -> Decimal:
    return ev - net_debt - minority_interest - preferred


def market_cap(price: Decimal, shares: Decimal) -> Decimal:
    return price * shares


@dataclass(frozen=True)
class CompanyFundamentals:
    """One company's inputs for comparables. Market cap is a market input, not a filing fact."""

    name: str
    market_cap: Decimal
    total_debt: Decimal
    cash: Decimal
    revenue: Num
    ebitda: Num
    ebit: Num
    net_income: Num
    book_equity: Num
    free_cash_flow: Num


@dataclass(frozen=True)
class Multiples:
    name: str
    enterprise_value: Decimal
    ev_to_revenue: Num
    ev_to_ebitda: Num
    ev_to_ebit: Num
    price_to_earnings: Num
    price_to_book: Num
    fcf_yield: Num


MULTIPLE_KEYS = ("ev_to_revenue", "ev_to_ebitda", "ev_to_ebit", "price_to_earnings", "price_to_book")


def multiples(c: CompanyFundamentals) -> Multiples:
    ev = enterprise_value(c.market_cap, c.total_debt, c.cash)
    return Multiples(
        name=c.name,
        enterprise_value=ev,
        ev_to_revenue=_positive_div(ev, c.revenue),
        ev_to_ebitda=_positive_div(ev, c.ebitda),
        ev_to_ebit=_positive_div(ev, c.ebit),
        price_to_earnings=_positive_div(c.market_cap, c.net_income),
        price_to_book=_positive_div(c.market_cap, c.book_equity),
        fcf_yield=_positive_div(c.free_cash_flow, c.market_cap),
    )


@dataclass(frozen=True)
class PeerStats:
    key: str
    n: int
    low: Num  # 25th percentile
    median: Num
    high: Num  # 75th percentile


@dataclass(frozen=True)
class ImpliedValue:
    key: str
    low: Num
    median: Num
    high: Num


def peer_stats(peers: list[Multiples]) -> dict[str, PeerStats]:
    out = {}
    for k in MULTIPLE_KEYS:
        vals = [getattr(p, k) for p in peers]
        present = [v for v in vals if v is not None]
        out[k] = PeerStats(k, len(present), percentile(present, _D("0.25")), median(present), percentile(present, _D("0.75")))
    return out


def implied_per_share(target: CompanyFundamentals, stats: dict[str, PeerStats], diluted_shares: Decimal) -> list[ImpliedValue]:
    """Value per share for the target implied by applying peer multiples to its own metrics."""
    if diluted_shares <= 0:
        raise ValueError("Diluted shares must be positive")
    nd = target.total_debt - target.cash
    base = {
        "ev_to_revenue": (target.revenue, True),
        "ev_to_ebitda": (target.ebitda, True),
        "ev_to_ebit": (target.ebit, True),
        "price_to_earnings": (target.net_income, False),
        "price_to_book": (target.book_equity, False),
    }
    out = []
    for k, (metric, is_ev) in base.items():
        s = stats[k]
        if metric is None or metric <= 0 or s.median is None:
            out.append(ImpliedValue(k, None, None, None))
            continue

        def per_share(mult: Num, metric: Decimal = metric, is_ev: bool = is_ev) -> Num:
            if mult is None:
                return None
            value = mult * metric
            return ((value - nd) if is_ev else value) / diluted_shares

        out.append(ImpliedValue(k, per_share(s.low), per_share(s.median), per_share(s.high)))
    return out
