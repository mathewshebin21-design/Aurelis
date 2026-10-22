"""FastAPI application: read-only data endpoints plus a guarded ingest trigger."""

from __future__ import annotations

import hmac
from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException, Path, Query
from sqlalchemy import func, or_, select, text
from sqlalchemy.orm import Session, selectinload

from ..config import get_settings
from ..db import get_session
from ..edgar.client import EdgarClient, EdgarError, UserAgentMissing
from ..freshness import assess
from ..ingest.service import IssuerNotFound, ingest_issuer, resolve_cik
from ..models import Fact, Filing, IngestRun, Issuer, IssuerTicker, NormalizedLine
from ..normalize.concepts import BY_KEY, LINES
from ..normalize.periods import parse_fye
from .schemas import (
    FactOut,
    FreshnessOut,
    IngestRunOut,
    IssuerOut,
    IssuerSearchHit,
    LineOut,
    Provenance,
    StatementOut,
)

app = FastAPI(
    title="AURELIS API",
    version="0.2.0",
    description="SEC-sourced financial data with provenance. Values are as reported by issuers; nothing is estimated.",
)

DB = Annotated[Session, Depends(get_session)]
IssuerRef = Annotated[str, Path(min_length=1, max_length=16, pattern=r"^[A-Za-z0-9.\-]+$", description="Ticker or CIK")]


def _issuer(session: Session, ref: str) -> Issuer:
    try:
        cik = resolve_cik(session, None, ref)
    except IssuerNotFound:
        raise HTTPException(404, f"Unknown issuer '{ref}'. Ingest it first.") from None
    issuer = session.get(Issuer, cik, options=[selectinload(Issuer.tickers)])
    if issuer is None:
        raise HTTPException(404, f"Unknown issuer '{ref}'. Ingest it first.")
    return issuer


@app.get("/v1/health")
def health(session: DB) -> dict[str, str]:
    session.execute(text("select 1"))
    return {"status": "ok"}


@app.get("/v1/companies", response_model=list[IssuerSearchHit])
def search(session: DB, q: Annotated[str, Query(min_length=1, max_length=64)], limit: Annotated[int, Query(ge=1, le=50)] = 10):
    """Ranked: exact ticker, ticker prefix, name prefix, then any substring match."""
    term = q.strip()
    up = term.upper()
    like = "%" + term.replace("\\", "").replace("%", "").replace("_", "") + "%"
    candidates = (
        session.scalars(
            select(Issuer)
            .outerjoin(IssuerTicker)
            .where(or_(IssuerTicker.ticker == up, Issuer.name.ilike(like), IssuerTicker.ticker.ilike(like)))
            .options(selectinload(Issuer.tickers))
            .limit(200)
        )
        .unique()
        .all()
    )

    def rank(i: Issuer) -> tuple[int, str]:
        tickers = [t.ticker for t in i.tickers]
        score = 0 if up in tickers else 1 if any(t.startswith(up) for t in tickers) else 2 if i.name.upper().startswith(up) else 3
        return score, i.name

    return [
        IssuerSearchHit(cik=i.cik, name=i.name, tickers=[t.ticker for t in i.tickers if t.is_current])
        for i in sorted(candidates, key=rank)[:limit]
    ]


@app.get("/v1/companies/{ref}", response_model=IssuerOut)
def company(session: DB, ref: IssuerRef):
    return _issuer(session, ref)


@app.get("/v1/companies/{ref}/statements/{statement}", response_model=StatementOut)
def statement(
    session: DB,
    ref: IssuerRef,
    statement: Annotated[str, Path(pattern="^(income|balance|cashflow)$")],
    period: Annotated[str, Query(pattern="^(FY|Q)$")] = "FY",
    limit: Annotated[int, Query(ge=1, le=40)] = 5,
):
    issuer = _issuer(session, ref)
    ends = session.scalars(
        select(NormalizedLine.period_end)
        .where(
            NormalizedLine.cik == issuer.cik,
            NormalizedLine.statement == statement,
            NormalizedLine.period_type == period,
            NormalizedLine.status != "missing",
        )
        .group_by(NormalizedLine.period_end)
        .order_by(NormalizedLine.period_end.desc())
        .limit(limit)
    ).all()
    rows = session.scalars(
        select(NormalizedLine).where(
            NormalizedLine.cik == issuer.cik,
            NormalizedLine.statement == statement,
            NormalizedLine.period_type == period,
            NormalizedLine.period_end.in_(ends) if ends else text("false"),
        )
    ).all()
    # Missing rows carry an anchor date of their period; keep those whose fiscal period matches a kept period.
    order = {line.key: i for i, line in enumerate(LINES)}
    accession_urls = {f.accession: f.url for f in session.scalars(select(Filing).where(Filing.cik == issuer.cik))}
    lines = [
        LineOut(
            line_key=r.line_key,
            label=BY_KEY[r.line_key].label,
            fiscal_year=r.fiscal_year,
            fiscal_period=r.fiscal_period,
            period_start=r.period_start,
            period_end=r.period_end,
            value=r.value,
            unit=r.unit,
            currency=r.currency,
            provenance=Provenance(
                status=r.status,
                source_concept=r.source_concept,
                source_accession=r.source_accession,
                source_form=r.source_form,
                source_filed=r.source_filed,
                source_url=accession_urls.get(r.source_accession or ""),
                rule_id=r.rule_id,
                restated=r.restated,
                original_value=r.original_value,
                split_factor=r.split_factor,
                notes=r.notes or [],
            ),
        )
        for r in sorted(rows, key=lambda r: (order.get(r.line_key, 999), r.period_end))
    ]
    periods = sorted({f"{r.fiscal_period} {r.fiscal_year}" if period == "Q" else f"FY{r.fiscal_year}" for r in rows})
    return StatementOut(
        cik=issuer.cik, statement=statement, period_type=period, currency=issuer.reporting_currency, periods=periods, lines=lines
    )


@app.get("/v1/companies/{ref}/facts/{concept}", response_model=list[FactOut])
def facts(session: DB, ref: IssuerRef, concept: Annotated[str, Path(pattern=r"^[A-Za-z0-9_\-]+:?[A-Za-z0-9_]*$")]):
    """Every as-reported value for one concept, across all filings (shows restatement history)."""
    issuer = _issuer(session, ref)
    taxonomy, _, name = concept.rpartition(":")
    q = select(Fact).where(Fact.cik == issuer.cik, Fact.concept == name)
    if taxonomy:
        q = q.where(Fact.taxonomy == taxonomy)
    return session.scalars(q.order_by(Fact.period_end.desc(), Fact.filed)).all()


@app.get("/v1/companies/{ref}/freshness", response_model=FreshnessOut)
def freshness(session: DB, ref: IssuerRef):
    issuer = _issuer(session, ref)
    latest = session.scalar(
        select(func.max(NormalizedLine.period_end)).where(NormalizedLine.cik == issuer.cik, NormalizedLine.status == "reported")
    )
    f = assess(
        latest_period_end=latest,
        fye=parse_fye(issuer.fiscal_year_end),
        last_checked_at=issuer.last_checked_at,
        now=datetime.now(UTC),
        sync_max_age_hours=get_settings().sync_max_age_hours,
    )
    return FreshnessOut(**f.__dict__)


def require_admin(x_admin_token: Annotated[str | None, Header()] = None) -> None:
    expected = get_settings().admin_token
    if not expected:
        raise HTTPException(503, "Admin endpoints are disabled: AURELIS_ADMIN_TOKEN is not set")
    if not x_admin_token or not hmac.compare_digest(x_admin_token, expected):
        raise HTTPException(401, "Invalid admin token")


@app.post("/v1/admin/ingest/{ref}", response_model=IngestRunOut, dependencies=[Depends(require_admin)])
def trigger_ingest(session: DB, ref: IssuerRef, force: bool = False):
    s = get_settings()
    try:
        with EdgarClient(
            s.sec_user_agent, max_rps=s.sec_max_requests_per_second, timeout=s.sec_timeout_seconds, max_retries=s.sec_max_retries
        ) as client:
            return ingest_issuer(session, client, ref, force=force)
    except UserAgentMissing as e:
        raise HTTPException(503, str(e)) from None
    except IssuerNotFound:
        raise HTTPException(404, f"No SEC issuer found for '{ref}'") from None
    except EdgarError as e:
        raise HTTPException(502, f"SEC EDGAR request failed: {e}") from None


@app.get("/v1/admin/ingest-runs", response_model=list[IngestRunOut], dependencies=[Depends(require_admin)])
def ingest_runs(session: DB, limit: Annotated[int, Query(ge=1, le=200)] = 20):
    return session.scalars(select(IngestRun).order_by(IngestRun.id.desc()).limit(limit)).all()
