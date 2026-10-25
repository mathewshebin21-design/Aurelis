"""Response models. Decimal values are serialised as strings to keep full precision."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_serializer


class _Out(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class TickerOut(_Out):
    ticker: str
    exchange: str | None
    is_current: bool


class IssuerOut(_Out):
    cik: int
    name: str
    sic: str | None
    sic_description: str | None
    fiscal_year_end: str | None
    reporting_currency: str | None
    last_checked_at: datetime | None
    last_ingested_at: datetime | None
    tickers: list[TickerOut]


class IssuerSearchHit(_Out):
    cik: int
    name: str
    tickers: list[str]
    has_data: bool = Field(description="Statements have been ingested; issuers known only from the SEC ticker map have none yet")
    last_ingested_at: datetime | None


class Provenance(_Out):
    status: str
    source_concept: str | None
    source_accession: str | None
    source_form: str | None
    source_filed: date | None
    source_url: str | None = None
    rule_id: str | None
    restated: bool
    original_value: Decimal | None
    split_factor: Decimal | None
    notes: list[str]

    @field_serializer("original_value", "split_factor")
    def _dec(self, v: Decimal | None) -> str | None:
        return None if v is None else format(v.normalize(), "f")


class LineOut(_Out):
    line_key: str
    label: str
    fiscal_year: int
    fiscal_period: str
    period_start: date | None
    period_end: date
    value: Decimal | None
    unit: str | None
    currency: str | None
    provenance: Provenance

    @field_serializer("value")
    def _dec(self, v: Decimal | None) -> str | None:
        return None if v is None else format(v.normalize(), "f")


class StatementOut(BaseModel):
    cik: int
    statement: str
    period_type: str
    currency: str | None
    periods: list[str]
    lines: list[LineOut]


class FactOut(_Out):
    concept: str
    unit: str
    period_start: date | None
    period_end: date
    value: Decimal
    accession: str
    form: str
    filed: date

    @field_serializer("value")
    def _dec(self, v: Decimal) -> str:
        return format(v.normalize(), "f")


class FreshnessOut(BaseModel):
    status: str
    sync_status: str
    latest_period_end: date | None
    next_period_end: date | None
    next_filing_expected_by: date | None
    last_checked_at: datetime | None
    explanation: str


class IngestRunOut(_Out):
    id: int
    cik: int | None
    started_at: datetime
    finished_at: datetime | None
    status: str
    facts_seen: int
    facts_inserted: int
    lines_written: int
    error: str | None
