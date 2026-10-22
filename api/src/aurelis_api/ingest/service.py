"""Ingestion orchestration.

Idempotent: raw facts are upserted on their natural key, so re-running an
ingest never duplicates data; normalised lines for the issuer are rebuilt in
one transaction so readers never see a half-written statement.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from ..edgar.client import EdgarClient
from ..edgar.parse import (
    IssuerProfile,
    RawFact,
    iter_company_facts,
    parse_submissions,
    parse_tickers,
)
from ..models import (
    CorporateAction,
    Fact,
    Filing,
    IngestRun,
    Issuer,
    IssuerTicker,
    NormalizedLine,
)
from ..normalize.pipeline import normalize
from ..normalize.restatements import FactRecord
from ..normalize.splits import SplitAction, detect_splits, merge_actions

log = logging.getLogger(__name__)

BATCH = 2000


class IssuerNotFound(LookupError):
    pass


def resolve_cik(session: Session, client: EdgarClient | None, ticker_or_cik: str) -> int:
    """Map a ticker or CIK string to a CIK, refreshing the SEC ticker file if needed."""
    s = ticker_or_cik.strip().upper()
    if s.isdigit():
        return int(s)
    cik = session.scalar(select(IssuerTicker.cik).where(IssuerTicker.ticker == s).order_by(IssuerTicker.is_current.desc()))
    if cik is not None:
        return cik
    if client is None:
        raise IssuerNotFound(s)
    sync_tickers(session, client)
    cik = session.scalar(select(IssuerTicker.cik).where(IssuerTicker.ticker == s))
    if cik is None:
        raise IssuerNotFound(s)
    return cik


def sync_tickers(session: Session, client: EdgarClient) -> int:
    rows = parse_tickers(client.tickers().json())
    today = datetime.now(UTC).date()
    for r in rows:
        _upsert_issuer_stub(session, r.cik, r.name)
    session.flush()
    current = {(r.cik, r.ticker) for r in rows}
    for r in rows:
        stmt = pg_insert(IssuerTicker).values(
            cik=r.cik, ticker=r.ticker, exchange=r.exchange, is_current=True, first_seen=today, last_seen=today
        )
        session.execute(
            stmt.on_conflict_do_update(
                index_elements=["cik", "ticker"], set_={"exchange": r.exchange, "is_current": True, "last_seen": today}
            )
        )
    for t in session.scalars(select(IssuerTicker).where(IssuerTicker.is_current.is_(True))):
        if (t.cik, t.ticker) not in current:
            t.is_current = False  # keep history of retired tickers
    session.commit()
    return len(rows)


def _upsert_issuer_stub(session: Session, cik: int, name: str) -> None:
    session.execute(pg_insert(Issuer).values(cik=cik, name=name).on_conflict_do_nothing(index_elements=["cik"]))


def apply_profile(session: Session, p: IssuerProfile) -> None:
    _upsert_issuer_stub(session, p.cik, p.name)
    issuer = session.get(Issuer, p.cik)
    assert issuer is not None
    issuer.name, issuer.sic, issuer.sic_description = p.name, p.sic, p.sic_description
    issuer.entity_type, issuer.fiscal_year_end, issuer.state_of_incorporation = p.entity_type, p.fiscal_year_end, p.state_of_incorporation
    today = datetime.now(UTC).date()
    for i, t in enumerate(p.tickers):
        exch = p.exchanges[i] if i < len(p.exchanges) else None
        stmt = pg_insert(IssuerTicker).values(cik=p.cik, ticker=t, exchange=exch, is_current=True, first_seen=today, last_seen=today)
        session.execute(stmt.on_conflict_do_update(index_elements=["cik", "ticker"], set_={"is_current": True, "last_seen": today}))
    for f in p.filings:
        stmt = pg_insert(Filing).values(
            accession=f.accession,
            cik=p.cik,
            form=f.form,
            filing_date=f.filing_date,
            report_date=f.report_date,
            primary_document=f.primary_document,
            is_amendment=f.is_amendment,
            url=f.url,
        )
        session.execute(stmt.on_conflict_do_nothing(index_elements=["accession"]))


def store_facts(session: Session, cik: int, facts: list[RawFact]) -> int:
    inserted = 0
    for i in range(0, len(facts), BATCH):
        chunk = facts[i : i + BATCH]
        stmt = pg_insert(Fact).values(
            [
                {
                    "cik": cik,
                    "taxonomy": f.taxonomy,
                    "concept": f.concept,
                    "unit": f.unit,
                    "period_start": f.start,
                    "period_end": f.end,
                    "value": f.value,
                    "accession": f.accession,
                    "fy": f.fy,
                    "fp": f.fp,
                    "form": f.form,
                    "filed": f.filed,
                    "frame": f.frame,
                }
                for f in chunk
            ]
        )
        result = session.execute(stmt.on_conflict_do_nothing(constraint="uq_fact_identity").returning(Fact.id))
        inserted += len(result.all())
    return inserted


def rebuild_normalized(session: Session, cik: int) -> int:
    issuer = session.get(Issuer, cik)
    if issuer is None:
        raise IssuerNotFound(str(cik))
    records = [
        FactRecord(f.taxonomy, f.concept, f.unit, f.period_start, f.period_end, Decimal(f.value), f.accession, f.form, f.filed)
        for f in session.scalars(select(Fact).where(Fact.cik == cik))
    ]
    detected = detect_splits(records)
    manual = [
        SplitAction(Decimal(a.ratio), a.effective_date, a.source, a.source_accession, a.note)
        for a in session.scalars(select(CorporateAction).where(CorporateAction.cik == cik, CorporateAction.source == "manual"))
    ]
    actions = merge_actions(detected, manual)
    for a in detected:
        stmt = pg_insert(CorporateAction).values(
            cik=cik,
            action_type="split" if a.ratio > 1 else "reverse_split",
            ratio=a.ratio,
            effective_date=a.effective_date,
            source="xbrl",
            source_accession=a.source_accession,
            note=a.note,
        )
        session.execute(stmt.on_conflict_do_nothing(index_elements=["cik", "action_type", "effective_date"]))

    result = normalize(records, fiscal_year_end=issuer.fiscal_year_end, split_actions=actions)
    for w in result.warnings:
        log.warning("CIK %s: %s", cik, w)
    issuer.reporting_currency = result.reporting_currency
    session.execute(delete(NormalizedLine).where(NormalizedLine.cik == cik))
    rows = [
        {
            "cik": cik,
            "statement": v.statement,
            "line_key": v.line_key,
            "period_type": v.period_type,
            "fiscal_year": v.fiscal_year,
            "fiscal_period": v.fiscal_period,
            "period_start": v.period_start,
            "period_end": v.period_end,
            "value": v.value,
            "unit": v.unit,
            "currency": v.currency,
            "status": v.status,
            "source_concept": v.source_concept,
            "source_accession": v.source_accession,
            "source_form": v.source_form,
            "source_filed": v.source_filed,
            "rule_id": v.rule_id,
            "restated": v.restated,
            "original_value": v.original_value,
            "split_factor": v.split_factor,
            "notes": v.notes,
        }
        for v in result.lines
    ]
    for i in range(0, len(rows), BATCH):
        session.execute(pg_insert(NormalizedLine).values(rows[i : i + BATCH]))
    return len(rows)


def ingest_issuer(session: Session, client: EdgarClient, ticker_or_cik: str, *, force: bool = False) -> IngestRun:
    cik = resolve_cik(session, client, ticker_or_cik)
    run = IngestRun(cik=cik)
    session.add(run)
    session.commit()
    try:
        apply_profile(session, parse_submissions(client.submissions(cik).json()))
        issuer = session.get(Issuer, cik)
        assert issuer is not None
        fetched = client.company_facts(cik, if_modified_since=None if force else issuer.facts_last_modified)
        now = datetime.now(UTC)
        issuer.last_checked_at = now
        if fetched.not_modified:
            run.status = "not_modified"
        else:
            facts = list(iter_company_facts(fetched.json()))
            run.facts_seen = len(facts)
            run.facts_inserted = store_facts(session, cik, facts)
            run.lines_written = rebuild_normalized(session, cik)
            issuer.facts_last_modified = fetched.last_modified
            issuer.last_ingested_at = now
            run.status = "ok"
        run.finished_at = datetime.now(UTC)
        session.commit()
    except Exception as e:
        session.rollback()
        run = session.merge(run)
        run.status, run.error, run.finished_at = "error", f"{type(e).__name__}: {e}", datetime.now(UTC)
        session.commit()
        log.exception("Ingest failed for %s", ticker_or_cik)
        raise
    return run
