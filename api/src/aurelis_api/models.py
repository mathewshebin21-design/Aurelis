"""Relational schema.

Raw SEC facts are stored as reported and never overwritten. Normalised
statement lines are a derived, reproducible view that always points back to
the fact (concept + accession) it came from, or to the rule that derived it.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base

# SEC values can exceed 10^12 and carry decimals for per-share data.
Money = Numeric(38, 6)


class Issuer(Base):
    __tablename__ = "issuer"

    cik: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=False)
    name: Mapped[str] = mapped_column(String(300))
    sic: Mapped[str | None] = mapped_column(String(8))
    sic_description: Mapped[str | None] = mapped_column(String(300))
    entity_type: Mapped[str | None] = mapped_column(String(64))
    fiscal_year_end: Mapped[str | None] = mapped_column(String(4), comment="MMDD, from SEC submissions")
    state_of_incorporation: Mapped[str | None] = mapped_column(String(8))
    reporting_currency: Mapped[str | None] = mapped_column(String(3))
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_ingested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    facts_last_modified: Mapped[str | None] = mapped_column(String(64), comment="HTTP Last-Modified of companyfacts")

    tickers: Mapped[list[IssuerTicker]] = relationship(back_populates="issuer", cascade="all, delete-orphan")


class IssuerTicker(Base):
    """Ticker history: tickers change, the CIK does not."""

    __tablename__ = "issuer_ticker"
    __table_args__ = (UniqueConstraint("cik", "ticker"), Index("ix_issuer_ticker_ticker", "ticker"))

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    cik: Mapped[int] = mapped_column(ForeignKey("issuer.cik", ondelete="CASCADE"))
    ticker: Mapped[str] = mapped_column(String(16))
    exchange: Mapped[str | None] = mapped_column(String(32))
    is_current: Mapped[bool] = mapped_column(Boolean, default=True)
    first_seen: Mapped[date] = mapped_column(Date, server_default=func.current_date())
    last_seen: Mapped[date] = mapped_column(Date, server_default=func.current_date())

    issuer: Mapped[Issuer] = relationship(back_populates="tickers")


class Filing(Base):
    __tablename__ = "filing"
    __table_args__ = (Index("ix_filing_cik_date", "cik", "filing_date"),)

    accession: Mapped[str] = mapped_column(String(20), primary_key=True)
    cik: Mapped[int] = mapped_column(ForeignKey("issuer.cik", ondelete="CASCADE"))
    form: Mapped[str] = mapped_column(String(16))
    filing_date: Mapped[date] = mapped_column(Date)
    report_date: Mapped[date | None] = mapped_column(Date)
    primary_document: Mapped[str | None] = mapped_column(String(200))
    is_amendment: Mapped[bool] = mapped_column(Boolean, default=False)
    url: Mapped[str | None] = mapped_column(Text)


class Fact(Base):
    """One XBRL fact exactly as reported in one filing."""

    __tablename__ = "fact"
    __table_args__ = (
        # Instant facts have no start date; NULLS NOT DISTINCT keeps them unique too (PostgreSQL 15+).
        UniqueConstraint(
            "cik",
            "taxonomy",
            "concept",
            "unit",
            "period_start",
            "period_end",
            "accession",
            name="uq_fact_identity",
            postgresql_nulls_not_distinct=True,
        ),
        Index("ix_fact_lookup", "cik", "concept", "period_end"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    cik: Mapped[int] = mapped_column(ForeignKey("issuer.cik", ondelete="CASCADE"))
    taxonomy: Mapped[str] = mapped_column(String(32))
    concept: Mapped[str] = mapped_column(String(200))
    unit: Mapped[str] = mapped_column(String(64))
    period_start: Mapped[date | None] = mapped_column(Date, comment="NULL for instant facts")
    period_end: Mapped[date] = mapped_column(Date)
    value: Mapped[Decimal] = mapped_column(Money)
    accession: Mapped[str] = mapped_column(String(20))
    fy: Mapped[int | None] = mapped_column(Integer, comment="Fiscal year of the *filing*, not necessarily of the fact")
    fp: Mapped[str | None] = mapped_column(String(4))
    form: Mapped[str] = mapped_column(String(16))
    filed: Mapped[date] = mapped_column(Date)
    frame: Mapped[str | None] = mapped_column(String(16))


class CorporateAction(Base):
    __tablename__ = "corporate_action"
    __table_args__ = (UniqueConstraint("cik", "action_type", "effective_date"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    cik: Mapped[int] = mapped_column(ForeignKey("issuer.cik", ondelete="CASCADE"))
    action_type: Mapped[str] = mapped_column(String(32), comment="split | reverse_split")
    ratio: Mapped[Decimal] = mapped_column(Numeric(20, 8), comment="New shares per old share")
    effective_date: Mapped[date] = mapped_column(Date)
    source: Mapped[str] = mapped_column(String(32), comment="xbrl | manual")
    source_accession: Mapped[str | None] = mapped_column(String(20))
    note: Mapped[str | None] = mapped_column(Text)


class FxRate(Base):
    """FX rates used to convert non-USD filers. Never inferred; each row names its source."""

    __tablename__ = "fx_rate"
    __table_args__ = (UniqueConstraint("currency", "rate_date", "source"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    currency: Mapped[str] = mapped_column(String(3))
    rate_date: Mapped[date] = mapped_column(Date)
    usd_per_unit: Mapped[Decimal] = mapped_column(Numeric(20, 10))
    source: Mapped[str] = mapped_column(String(64))


class NormalizedLine(Base):
    """One statement line for one period, with full provenance."""

    __tablename__ = "normalized_line"
    __table_args__ = (
        UniqueConstraint("cik", "line_key", "period_type", "period_end", name="uq_normalized_line"),
        Index("ix_normalized_cik_stmt", "cik", "statement", "period_type"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    cik: Mapped[int] = mapped_column(ForeignKey("issuer.cik", ondelete="CASCADE"))
    statement: Mapped[str] = mapped_column(String(16), comment="income | balance | cashflow")
    line_key: Mapped[str] = mapped_column(String(64))
    period_type: Mapped[str] = mapped_column(String(2), comment="FY | Q")
    fiscal_year: Mapped[int] = mapped_column(Integer)
    fiscal_period: Mapped[str] = mapped_column(String(4), comment="FY | Q1..Q4")
    period_start: Mapped[date | None] = mapped_column(Date)
    period_end: Mapped[date] = mapped_column(Date)
    value: Mapped[Decimal | None] = mapped_column(Money)
    unit: Mapped[str | None] = mapped_column(String(64))
    currency: Mapped[str | None] = mapped_column(String(3))
    status: Mapped[str] = mapped_column(String(16), comment="reported | derived | missing")
    source_concept: Mapped[str | None] = mapped_column(String(200))
    source_accession: Mapped[str | None] = mapped_column(String(20))
    source_form: Mapped[str | None] = mapped_column(String(16))
    source_filed: Mapped[date | None] = mapped_column(Date)
    rule_id: Mapped[str | None] = mapped_column(String(64))
    restated: Mapped[bool] = mapped_column(Boolean, default=False)
    original_value: Mapped[Decimal | None] = mapped_column(Money)
    split_factor: Mapped[Decimal | None] = mapped_column(Numeric(20, 8))
    notes: Mapped[list[str]] = mapped_column(JSON, default=list)
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class IngestRun(Base):
    __tablename__ = "ingest_run"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    cik: Mapped[int | None] = mapped_column(BigInteger)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(16), default="running", comment="running | ok | not_modified | error")
    facts_seen: Mapped[int] = mapped_column(Integer, default=0)
    facts_inserted: Mapped[int] = mapped_column(Integer, default=0)
    lines_written: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(Text)
