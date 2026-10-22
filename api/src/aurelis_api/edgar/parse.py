"""Parsers that turn SEC JSON payloads into typed records.

They validate shape strictly: an unexpected payload raises instead of
silently producing partial data.
"""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any

from .client import FILING_INDEX_URL


class PayloadError(ValueError):
    pass


@dataclass(frozen=True)
class TickerRow:
    cik: int
    name: str
    ticker: str
    exchange: str | None


@dataclass(frozen=True)
class FilingRow:
    accession: str
    form: str
    filing_date: date
    report_date: date | None
    primary_document: str | None
    url: str | None

    @property
    def is_amendment(self) -> bool:
        return self.form.endswith("/A")


@dataclass(frozen=True)
class IssuerProfile:
    cik: int
    name: str
    sic: str | None
    sic_description: str | None
    entity_type: str | None
    fiscal_year_end: str | None
    state_of_incorporation: str | None
    tickers: list[str]
    exchanges: list[str]
    filings: list[FilingRow]


@dataclass(frozen=True)
class RawFact:
    taxonomy: str
    concept: str
    unit: str
    start: date | None
    end: date
    value: Decimal
    accession: str
    fy: int | None
    fp: str | None
    form: str
    filed: date
    frame: str | None


def _date(s: str | None) -> date | None:
    return date.fromisoformat(s) if s else None


def parse_tickers(payload: dict[str, Any]) -> list[TickerRow]:
    """Parse company_tickers_exchange.json ({"fields": [...], "data": [[...]]})."""
    try:
        fields = payload["fields"]
        idx = {f: i for i, f in enumerate(fields)}
        return [
            TickerRow(
                cik=int(r[idx["cik"]]), name=str(r[idx["name"]]), ticker=str(r[idx["ticker"]]).upper(), exchange=r[idx["exchange"]] or None
            )
            for r in payload["data"]
        ]
    except (KeyError, TypeError, ValueError) as e:
        raise PayloadError(f"Unexpected tickers payload: {e}") from e


def parse_submissions(payload: dict[str, Any]) -> IssuerProfile:
    try:
        cik = int(payload["cik"])
        recent = payload["filings"]["recent"]
        n = len(recent["accessionNumber"])
        filings = []
        for i in range(n):
            acc = recent["accessionNumber"][i]
            doc = recent.get("primaryDocument", [None] * n)[i] or None
            filings.append(
                FilingRow(
                    accession=acc,
                    form=recent["form"][i],
                    filing_date=date.fromisoformat(recent["filingDate"][i]),
                    report_date=_date(recent.get("reportDate", [None] * n)[i] or None),
                    primary_document=doc,
                    url=FILING_INDEX_URL.format(cik=cik, accession_nodash=acc.replace("-", ""), document=doc) if doc else None,
                )
            )
        return IssuerProfile(
            cik=cik,
            name=payload["name"],
            sic=payload.get("sic") or None,
            sic_description=payload.get("sicDescription") or None,
            entity_type=payload.get("entityType") or None,
            fiscal_year_end=payload.get("fiscalYearEnd") or None,
            state_of_incorporation=payload.get("stateOfIncorporation") or None,
            tickers=[t.upper() for t in payload.get("tickers", [])],
            exchanges=list(payload.get("exchanges", [])),
            filings=filings,
        )
    except (KeyError, TypeError, ValueError) as e:
        raise PayloadError(f"Unexpected submissions payload: {e}") from e


def iter_company_facts(payload: dict[str, Any]) -> Iterator[RawFact]:
    """Yield every fact in a companyfacts payload (all taxonomies, all units)."""
    try:
        facts = payload["facts"]
    except (KeyError, TypeError) as e:
        raise PayloadError("companyfacts payload has no 'facts'") from e
    for taxonomy, concepts in facts.items():
        for concept, body in concepts.items():
            for unit, rows in body.get("units", {}).items():
                for r in rows:
                    try:
                        value = Decimal(str(r["val"]))
                    except (InvalidOperation, KeyError) as e:
                        raise PayloadError(f"Bad value in {taxonomy}:{concept}") from e
                    yield RawFact(
                        taxonomy=taxonomy,
                        concept=concept,
                        unit=unit,
                        start=_date(r.get("start")),
                        end=date.fromisoformat(r["end"]),
                        value=value,
                        accession=r["accn"],
                        fy=r.get("fy"),
                        fp=r.get("fp"),
                        form=r["form"],
                        filed=date.fromisoformat(r["filed"]),
                        frame=r.get("frame"),
                    )
