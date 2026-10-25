"""Unlevered free-cash-flow (FCFF) discounted cash flow valuation.

Conventions (docs/08-quant-methodology.md):
  FCFF_t       = EBIT_t × (1 − tax) + D&A_t − CapEx_t − ΔNWC_t
  ΔNWC_t       = NWC% × (Revenue_t − Revenue_{t−1})
  growth, margin fade linearly from year 1 to year N
  discounting  end-of-year by default; mid-year optional (t − 0.5)
  terminal     Gordon growth on FCFF_N, or exit multiple on EBITDA_N,
               discounted N full years in both conventions
  equity       EV − net debt − minority interest − preferred + non-operating assets
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from decimal import Decimal, localcontext
from typing import Literal

from .ratios import ONE, PRECISION, ZERO, D


class DcfInputError(ValueError):
    pass


def cost_of_equity(risk_free: Decimal, beta: Decimal, equity_risk_premium: Decimal) -> Decimal:
    """CAPM: rf + β × ERP."""
    return risk_free + beta * equity_risk_premium


def wacc(equity_value: Decimal, debt_value: Decimal, cost_of_equity_: Decimal, pre_tax_cost_of_debt: Decimal, tax_rate: Decimal) -> Decimal:
    """Market-value-weighted average cost of capital."""
    if equity_value < 0 or debt_value < 0 or equity_value + debt_value <= 0:
        raise DcfInputError("Capital weights must be non-negative and not both zero")
    with localcontext() as ctx:
        ctx.prec = PRECISION
        v = equity_value + debt_value
        return equity_value / v * cost_of_equity_ + debt_value / v * pre_tax_cost_of_debt * (ONE - tax_rate)


def present_value(value: Decimal, rate: Decimal, periods: Decimal) -> Decimal:
    with localcontext() as ctx:
        ctx.prec = PRECISION
        return value / (ONE + rate) ** periods


def gordon_terminal_value(final_cash_flow: Decimal, discount_rate: Decimal, growth: Decimal) -> Decimal:
    if discount_rate <= growth:
        raise DcfInputError("Discount rate must exceed terminal growth")
    with localcontext() as ctx:
        ctx.prec = PRECISION
        return final_cash_flow * (ONE + growth) / (discount_rate - growth)


def exit_multiple_terminal_value(final_ebitda: Decimal, multiple: Decimal) -> Decimal:
    if multiple <= 0:
        raise DcfInputError("Exit multiple must be positive")
    return final_ebitda * multiple


@dataclass(frozen=True)
class DcfAssumptions:
    base_revenue: Decimal
    years: int
    growth_start: Decimal
    growth_final: Decimal
    margin_start: Decimal
    margin_target: Decimal
    tax_rate: Decimal
    da_pct_revenue: Decimal
    capex_pct_revenue: Decimal
    nwc_pct_incremental_revenue: Decimal
    wacc: Decimal
    terminal_growth: Decimal
    net_debt: Decimal
    diluted_shares: Decimal
    terminal_method: Literal["gordon", "exit_multiple"] = "gordon"
    exit_multiple: Decimal | None = None
    minority_interest: Decimal = ZERO
    preferred_equity: Decimal = ZERO
    non_operating_assets: Decimal = ZERO
    mid_year: bool = False


@dataclass(frozen=True)
class DcfYear:
    year: int
    revenue: Decimal
    growth: Decimal
    margin: Decimal
    ebit: Decimal
    nopat: Decimal
    da: Decimal
    ebitda: Decimal
    capex: Decimal
    delta_nwc: Decimal
    fcff: Decimal
    discount_factor: Decimal
    present_value: Decimal


@dataclass(frozen=True)
class DcfResult:
    rows: list[DcfYear]
    sum_pv_fcff: Decimal
    terminal_value: Decimal
    pv_terminal_value: Decimal
    enterprise_value: Decimal
    equity_value: Decimal
    per_share: Decimal
    terminal_share: Decimal | None
    implied_exit_multiple: Decimal | None
    implied_perpetual_growth: Decimal | None
    warnings: list[str] = field(default_factory=list)


def _lerp(a: Decimal, b: Decimal, t: Decimal) -> Decimal:
    return a + (b - a) * t


def validate(a: DcfAssumptions) -> None:
    if a.years < 1 or a.years > 30:
        raise DcfInputError("Explicit forecast must be 1–30 years")
    if a.base_revenue <= 0:
        raise DcfInputError("Base revenue must be positive")
    if a.diluted_shares <= 0:
        raise DcfInputError("Diluted shares must be positive")
    if not ZERO <= a.tax_rate < ONE:
        raise DcfInputError("Tax rate must be in [0, 1)")
    if a.wacc <= 0:
        raise DcfInputError("WACC must be positive")
    if a.terminal_method == "gordon" and a.wacc <= a.terminal_growth:
        raise DcfInputError("WACC must exceed terminal growth")
    if a.terminal_method == "exit_multiple" and (a.exit_multiple is None or a.exit_multiple <= 0):
        raise DcfInputError("Exit-multiple method needs a positive exit multiple")


def run_dcf(a: DcfAssumptions) -> DcfResult:
    validate(a)
    with localcontext() as ctx:
        ctx.prec = PRECISION
        rows: list[DcfYear] = []
        prev = a.base_revenue
        n = a.years
        for i in range(1, n + 1):
            t = ONE if n == 1 else D(i - 1) / D(n - 1)
            g = _lerp(a.growth_start, a.growth_final, t)
            m = _lerp(a.margin_start, a.margin_target, t)
            revenue = prev * (ONE + g)
            ebit = revenue * m
            nopat = ebit * (ONE - a.tax_rate)
            da = revenue * a.da_pct_revenue
            capex = revenue * a.capex_pct_revenue
            delta_nwc = (revenue - prev) * a.nwc_pct_incremental_revenue
            fcff = nopat + da - capex - delta_nwc
            period = D(i) - D("0.5") if a.mid_year else D(i)
            df = ONE / (ONE + a.wacc) ** period
            rows.append(DcfYear(i, revenue, g, m, ebit, nopat, da, ebit + da, capex, delta_nwc, fcff, df, fcff * df))
            prev = revenue

        last = rows[-1]
        if a.terminal_method == "gordon":
            tv = gordon_terminal_value(last.fcff, a.wacc, a.terminal_growth)
        else:
            assert a.exit_multiple is not None
            tv = exit_multiple_terminal_value(last.ebitda, a.exit_multiple)
        pv_tv = present_value(tv, a.wacc, D(n))
        sum_pv = sum((r.present_value for r in rows), ZERO)
        ev = sum_pv + pv_tv
        equity = ev - a.net_debt - a.minority_interest - a.preferred_equity + a.non_operating_assets

        # Cross-checks between the two terminal methods, as analysts do.
        implied_multiple = tv / last.ebitda if last.ebitda > 0 else None
        implied_growth = (tv * a.wacc - last.fcff) / (tv + last.fcff) if tv + last.fcff != 0 else None

        warnings = []
        share = pv_tv / ev if ev > 0 else None
        if share is not None and share > D("0.75"):
            warnings.append(f"Terminal value is {share:.1%} of enterprise value; the result is dominated by long-run assumptions")
        if last.fcff <= 0:
            warnings.append("Final-year FCFF is not positive; a Gordon terminal value is not meaningful")
        if equity <= 0:
            warnings.append("Equity value is not positive: net claims exceed enterprise value")
        if a.terminal_method == "gordon" and a.terminal_growth > D("0.04"):
            warnings.append("Terminal growth above 4% exceeds typical long-run nominal GDP growth")

        return DcfResult(
            rows=rows,
            sum_pv_fcff=sum_pv,
            terminal_value=tv,
            pv_terminal_value=pv_tv,
            enterprise_value=ev,
            equity_value=equity,
            per_share=equity / a.diluted_shares,
            terminal_share=share,
            implied_exit_multiple=implied_multiple,
            implied_perpetual_growth=implied_growth,
            warnings=warnings,
        )


def sensitivity(base: DcfAssumptions, waccs: list[Decimal], growths: list[Decimal]) -> list[list[Decimal | None]]:
    """Value per share for each (WACC row, terminal-growth column). Invalid cells are None."""
    out: list[list[Decimal | None]] = []
    for w in waccs:
        row: list[Decimal | None] = []
        for g in growths:
            try:
                row.append(run_dcf(replace(base, wacc=w, terminal_growth=g)).per_share)
            except DcfInputError:
                row.append(None)
        out.append(row)
    return out


def grid(centre: Decimal, step: Decimal, each_side: int) -> list[Decimal]:
    return [centre + step * D(i - each_side) for i in range(2 * each_side + 1)]


@dataclass(frozen=True)
class Scenario:
    name: str
    probability: Decimal
    assumptions: DcfAssumptions


def probability_weighted(scenarios: list[Scenario]) -> tuple[Decimal, list[tuple[Scenario, DcfResult]]]:
    if not scenarios:
        raise DcfInputError("At least one scenario is required")
    if any(s.probability < 0 for s in scenarios):
        raise DcfInputError("Probabilities cannot be negative")
    total = sum((s.probability for s in scenarios), ZERO)
    if abs(total - ONE) > D("0.000001"):
        raise DcfInputError(f"Scenario probabilities must sum to 1 (got {total})")
    results = [(s, run_dcf(s.assumptions)) for s in scenarios]
    return sum((s.probability * r.per_share for s, r in results), ZERO), results
