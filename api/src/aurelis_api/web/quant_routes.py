"""Quant endpoints: metrics from filed statements and deterministic valuation calculators.

Facts (from filings) and assumptions (from the caller) are kept apart in every
response: inputs read from statements carry provenance; caller-supplied inputs
are echoed back under `assumptions`.
"""

from __future__ import annotations

from dataclasses import asdict
from decimal import Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_session
from ..ingest.service import IssuerNotFound, resolve_cik
from ..models import Issuer, NormalizedLine
from ..quant import ENGINE_VERSION
from ..quant import ratios as r
from ..quant.dcf import DcfAssumptions, DcfInputError, Scenario, cost_of_equity, grid, probability_weighted, run_dcf, sensitivity, wacc
from ..quant.metrics import LineInput, PeriodLines, compute_metrics
from ..quant.valuation import CompanyFundamentals, implied_per_share, multiples, peer_stats

router = APIRouter(prefix="/v1", tags=["quant"])
DB = Annotated[Session, Depends(get_session)]

Rate = Annotated[Decimal, Field(ge=Decimal("-0.5"), le=Decimal("2"))]
Positive = Annotated[Decimal, Field(gt=0)]


def _cik(session: Session, ref: str) -> int:
    try:
        cik = resolve_cik(session, None, ref)
    except IssuerNotFound:
        raise HTTPException(404, f"Unknown issuer '{ref}'. Ingest it first.") from None
    if session.get(Issuer, cik) is None:
        raise HTTPException(404, f"Unknown issuer '{ref}'. Ingest it first.")
    return cik


def _abs(x: Decimal | None) -> Decimal | None:
    return None if x is None else abs(x)


def load_periods(session: Session, cik: int, period_type: str = "FY") -> list[PeriodLines]:
    rows = session.scalars(
        select(NormalizedLine)
        .where(NormalizedLine.cik == cik, NormalizedLine.period_type == period_type)
        .order_by(NormalizedLine.period_end)
    ).all()
    by: dict[tuple[int, str], dict[str, LineInput]] = {}
    for x in rows:
        by.setdefault((x.fiscal_year, x.fiscal_period), {})[x.line_key] = LineInput(x.line_key, x.value, x.status, tuple(x.notes or ()))
    return [
        PeriodLines(f"FY{fy}" if fp == "FY" else f"{fp} {fy}", fy, lines)
        for (fy, fp), lines in sorted(by.items())
        if any(li.status != "missing" for li in lines.values())
    ]


# ── Metrics ─────────────────────────────────────────────────────────────────


class InputRefOut(BaseModel):
    period: str
    line_key: str
    value: Decimal | None
    status: str


class MetricOut(BaseModel):
    key: str
    label: str
    unit: str
    formula: str
    period: str
    value: Decimal | None
    inputs: list[InputRefOut]
    assumptions: list[str]
    reason: str | None


class MetricsResponse(BaseModel):
    cik: int
    engine_version: str
    periods: list[str]
    metrics: list[MetricOut]


@router.get("/companies/{ref}/metrics", response_model=MetricsResponse)
def company_metrics(session: DB, ref: str, limit: Annotated[int, Query(ge=1, le=20)] = 5):
    """Annual metrics computed by the deterministic engine from normalised statements."""
    cik = _cik(session, ref)
    periods = load_periods(session, cik, "FY")
    shown = {p.label for p in periods[-limit:]}
    results = [m for m in compute_metrics(periods) if m.period in shown]
    return MetricsResponse(
        cik=cik,
        engine_version=ENGINE_VERSION,
        periods=[p.label for p in periods[-limit:]],
        metrics=[MetricOut(**asdict(m)) for m in results],
    )


# ── DCF inputs from filings ─────────────────────────────────────────────────


class SourcedValue(BaseModel):
    value: Decimal | None
    basis: str
    inputs: list[InputRefOut]


class DcfInputsResponse(BaseModel):
    cik: int
    period: str
    facts: dict[str, SourcedValue]
    required_assumptions: list[str]


@router.get("/companies/{ref}/dcf-inputs", response_model=DcfInputsResponse)
def dcf_inputs(session: DB, ref: str):
    """Starting values for a DCF taken from the latest annual statements.

    Market inputs (price, beta, risk-free rate, ERP) and forecasts are not in SEC
    filings; they are listed under `required_assumptions` for the caller to supply.
    """
    cik = _cik(session, ref)
    periods = load_periods(session, cik, "FY")
    if not periods:
        raise HTTPException(409, "No annual statements available for this issuer")
    p = periods[-1]

    def v(key: str) -> Decimal | None:
        li = p.lines.get(key)
        return li.value if li else None

    def ref_(*keys: str) -> list[InputRefOut]:
        return [InputRefOut(period=p.label, line_key=k, value=v(k), status=p.lines[k].status if k in p.lines else "missing") for k in keys]

    tax = r.effective_tax_rate(v("income_tax"), v("pretax_income"))
    shares_key = "shares_outstanding" if v("shares_outstanding") else "diluted_shares"
    facts = {
        "base_revenue": SourcedValue(value=v("revenue"), basis="Latest fiscal-year revenue", inputs=ref_("revenue")),
        "margin_start": SourcedValue(
            value=r.margin(v("operating_income"), v("revenue")),
            basis="Operating income / revenue",
            inputs=ref_("operating_income", "revenue"),
        ),
        "tax_rate": SourcedValue(
            value=tax, basis="Effective tax rate (income tax / pre-tax income)", inputs=ref_("income_tax", "pretax_income")
        ),
        "da_pct_revenue": SourcedValue(
            value=r.margin(v("depreciation_amortization"), v("revenue")),
            basis="D&A / revenue",
            inputs=ref_("depreciation_amortization", "revenue"),
        ),
        "capex_pct_revenue": SourcedValue(
            value=r.margin(_abs(v("capex")), v("revenue")),
            basis="|Capex| / revenue",
            inputs=ref_("capex", "revenue"),
        ),
        "net_debt": SourcedValue(
            value=r.net_debt(v("total_debt"), v("cash"), v("short_term_investments")),
            basis="Total debt − cash − short-term investments",
            inputs=ref_("total_debt", "cash", "short_term_investments"),
        ),
        "diluted_shares": SourcedValue(value=v(shares_key), basis=f"Latest {shares_key.replace('_', ' ')}", inputs=ref_(shares_key)),
    }
    return DcfInputsResponse(
        cik=cik,
        period=p.label,
        facts=facts,
        required_assumptions=[
            "growth_start",
            "growth_final",
            "margin_target",
            "wacc (or CAPM inputs)",
            "terminal_growth",
            "nwc_pct_incremental_revenue",
            "share price (for comparison only)",
        ],
    )


# ── Calculators ─────────────────────────────────────────────────────────────


class DcfIn(BaseModel):
    base_revenue: Positive
    years: Annotated[int, Field(ge=1, le=30)] = 5
    growth_start: Rate
    growth_final: Rate
    margin_start: Rate
    margin_target: Rate
    tax_rate: Annotated[Decimal, Field(ge=0, lt=1)]
    da_pct_revenue: Annotated[Decimal, Field(ge=0, le=1)]
    capex_pct_revenue: Annotated[Decimal, Field(ge=0, le=1)]
    nwc_pct_incremental_revenue: Annotated[Decimal, Field(ge=-1, le=1)] = Decimal("0.1")
    wacc: Annotated[Decimal, Field(gt=0, le=Decimal("0.5"))]
    terminal_growth: Annotated[Decimal, Field(ge=Decimal("-0.05"), le=Decimal("0.1"))] = Decimal("0.025")
    net_debt: Decimal = Decimal(0)
    diluted_shares: Positive
    terminal_method: Literal["gordon", "exit_multiple"] = "gordon"
    exit_multiple: Annotated[Decimal, Field(gt=0, le=200)] | None = None
    minority_interest: Annotated[Decimal, Field(ge=0)] = Decimal(0)
    preferred_equity: Annotated[Decimal, Field(ge=0)] = Decimal(0)
    non_operating_assets: Annotated[Decimal, Field(ge=0)] = Decimal(0)
    mid_year: bool = False

    def to_engine(self) -> DcfAssumptions:
        return DcfAssumptions(**self.model_dump())


class SensitivityIn(BaseModel):
    wacc_step: Annotated[Decimal, Field(gt=0, le=Decimal("0.05"))] = Decimal("0.005")
    growth_step: Annotated[Decimal, Field(gt=0, le=Decimal("0.02"))] = Decimal("0.005")
    each_side: Annotated[int, Field(ge=1, le=4)] = 2


class DcfRequest(BaseModel):
    assumptions: DcfIn
    sensitivity: SensitivityIn | None = None


class DcfYearOut(BaseModel):
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


class SensitivityOut(BaseModel):
    waccs: list[Decimal]
    growths: list[Decimal]
    per_share: list[list[Decimal | None]]


class DcfResponse(BaseModel):
    engine_version: str
    assumptions: DcfIn
    rows: list[DcfYearOut]
    sum_pv_fcff: Decimal
    terminal_value: Decimal
    pv_terminal_value: Decimal
    enterprise_value: Decimal
    equity_value: Decimal
    per_share: Decimal
    terminal_share: Decimal | None
    implied_exit_multiple: Decimal | None
    implied_perpetual_growth: Decimal | None
    warnings: list[str]
    sensitivity: SensitivityOut | None = None
    disclaimer: str = "Model output under the stated assumptions. Not a forecast, rating or recommendation."


@router.post("/valuation/dcf", response_model=DcfResponse)
def dcf(req: DcfRequest):
    a = req.assumptions.to_engine()
    try:
        res = run_dcf(a)
        sens = None
        if req.sensitivity:
            s = req.sensitivity
            waccs = grid(a.wacc, s.wacc_step, s.each_side)
            gs = grid(a.terminal_growth, s.growth_step, s.each_side)
            sens = SensitivityOut(waccs=waccs, growths=gs, per_share=sensitivity(a, waccs, gs))
    except DcfInputError as e:
        raise HTTPException(422, str(e)) from None
    body = asdict(res)
    body["rows"] = [DcfYearOut(**row) for row in body["rows"]]
    return DcfResponse(engine_version=ENGINE_VERSION, assumptions=req.assumptions, sensitivity=sens, **body)


class WaccIn(BaseModel):
    risk_free: Annotated[Decimal, Field(ge=-0.05, le=0.25)]
    beta: Annotated[Decimal, Field(ge=-1, le=5)]
    equity_risk_premium: Annotated[Decimal, Field(ge=0, le=0.25)]
    equity_value: Annotated[Decimal, Field(ge=0)]
    debt_value: Annotated[Decimal, Field(ge=0)]
    pre_tax_cost_of_debt: Annotated[Decimal, Field(ge=0, le=0.5)]
    tax_rate: Annotated[Decimal, Field(ge=0, lt=1)]


@router.post("/valuation/wacc")
def wacc_endpoint(body: WaccIn) -> dict[str, Decimal | str]:
    ke = cost_of_equity(body.risk_free, body.beta, body.equity_risk_premium)
    try:
        w = wacc(body.equity_value, body.debt_value, ke, body.pre_tax_cost_of_debt, body.tax_rate)
    except DcfInputError as e:
        raise HTTPException(422, str(e)) from None
    return {"cost_of_equity": ke, "wacc": w, "engine_version": ENGINE_VERSION}


class ScenarioIn(BaseModel):
    name: Annotated[str, Field(min_length=1, max_length=40)]
    probability: Annotated[Decimal, Field(ge=0, le=1)]
    assumptions: DcfIn


class ScenariosIn(BaseModel):
    scenarios: Annotated[list[ScenarioIn], Field(min_length=1, max_length=10)]


@router.post("/valuation/scenarios")
def scenarios(body: ScenariosIn) -> dict[str, object]:
    try:
        weighted, results = probability_weighted([Scenario(s.name, s.probability, s.assumptions.to_engine()) for s in body.scenarios])
    except DcfInputError as e:
        raise HTTPException(422, str(e)) from None
    return {
        "engine_version": ENGINE_VERSION,
        "probability_weighted_per_share": weighted,
        "scenarios": [
            {
                "name": s.name,
                "probability": s.probability,
                "per_share": res.per_share,
                "enterprise_value": res.enterprise_value,
                "warnings": res.warnings,
            }
            for s, res in results
        ],
        "disclaimer": "Probabilities are analyst judgement; outputs are not expected returns.",
    }


class CompsIn(BaseModel):
    target: Annotated[str, Field(min_length=1, max_length=16)]
    peers: Annotated[list[str], Field(min_length=1, max_length=25)]
    market_caps: dict[str, Positive] = Field(description="Market capitalisation per ticker/CIK, same currency as statements (market input)")

    @model_validator(mode="after")
    def _caps(self) -> CompsIn:
        missing = [t for t in [self.target, *self.peers] if t.upper() not in {k.upper() for k in self.market_caps}]
        if missing:
            raise ValueError(f"market_caps missing for: {', '.join(missing)}")
        return self


def _fundamentals(session: Session, ref: str, mcap: Decimal) -> tuple[CompanyFundamentals, Decimal | None, str]:
    cik = _cik(session, ref)
    periods = load_periods(session, cik, "FY")
    if not periods:
        raise HTTPException(409, f"No annual statements for '{ref}'")
    p = periods[-1]

    def v(k: str) -> Decimal | None:
        li = p.lines.get(k)
        return li.value if li else None

    sti = v("short_term_investments") or Decimal(0)
    fundamentals = CompanyFundamentals(
        name=ref.upper(),
        market_cap=mcap,
        total_debt=v("total_debt") or Decimal(0),
        cash=(v("cash") or Decimal(0)) + sti,
        revenue=v("revenue"),
        ebitda=r.ebitda(v("operating_income"), v("depreciation_amortization")),
        ebit=v("operating_income"),
        net_income=v("net_income"),
        book_equity=v("equity"),
        free_cash_flow=r.free_cash_flow(v("operating_cash_flow"), v("capex")),
    )
    return fundamentals, v("shares_outstanding") or v("diluted_shares"), p.label


@router.post("/valuation/comps")
def comps(session: DB, body: CompsIn) -> dict[str, object]:
    caps = {k.upper(): val for k, val in body.market_caps.items()}
    target, shares, t_period = _fundamentals(session, body.target, caps[body.target.upper()])
    peers = [_fundamentals(session, p, caps[p.upper()]) for p in body.peers]
    peer_multiples = [multiples(f) for f, _, _ in peers]
    stats = peer_stats(peer_multiples)
    implied = implied_per_share(target, stats, shares) if shares else []
    return {
        "engine_version": ENGINE_VERSION,
        "target": {"multiples": asdict(multiples(target)), "period": t_period, "shares": shares},
        "peers": [{"multiples": asdict(m), "period": per} for m, (_, _, per) in zip(peer_multiples, peers, strict=True)],
        "peer_stats": {k: asdict(s) for k, s in stats.items()},
        "implied_per_share": [asdict(i) for i in implied],
        "notes": [
            "Fundamentals: latest fiscal year from SEC filings. Market capitalisations are caller-supplied market inputs.",
            "Debt and cash at fiscal year end; cash includes short-term investments. Missing debt or cash is treated as zero.",
        ],
    }
