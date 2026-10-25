"""Ingest filing text and search it.

Retrieval uses PostgreSQL full-text search (any-term `tsquery` + `ts_rank_cd`)
over section-aware chunks: deterministic, explainable and free to run. A vector
index (pgvector) can be added alongside later without changing callers.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass

from sqlalchemy import Text, cast, delete, func, select, text
from sqlalchemy.orm import Session

from ..edgar.client import EdgarClient
from ..models import Filing, FilingChunk, FilingDocument
from .text import chunk_section, html_to_text, split_sections

ANNUAL_FORMS = ("10-K", "10-K/A", "20-F", "40-F")
QUARTERLY_FORMS = ("10-Q", "10-Q/A")


class NoFilingAvailable(LookupError):
    pass


def latest_filing(session: Session, cik: int, forms: tuple[str, ...]) -> Filing:
    f = session.scalars(
        select(Filing).where(Filing.cik == cik, Filing.form.in_(forms), Filing.url.is_not(None)).order_by(Filing.filing_date.desc())
    ).first()
    if f is None:
        raise NoFilingAvailable(f"No {'/'.join(forms)} filing with a document URL for CIK {cik}")
    return f


def ingest_document(session: Session, client: EdgarClient, filing: Filing) -> FilingDocument:
    """Fetch, extract and chunk one filing's primary document. Re-running replaces its chunks."""
    assert filing.url
    raw = client.get_text(filing.url)
    body = html_to_text(raw)
    sections = split_sections(body, filing.form)
    doc = session.get(FilingDocument, filing.accession) or FilingDocument(accession=filing.accession)
    doc.cik, doc.form, doc.filing_date, doc.report_date, doc.url = (
        filing.cik,
        filing.form,
        filing.filing_date,
        filing.report_date,
        filing.url,
    )
    doc.sha256 = hashlib.sha256(raw.encode()).hexdigest()
    doc.text = body
    doc.sections = [{"key": s.key, "title": s.title, "start": s.start, "end": s.end} for s in sections]
    session.add(doc)
    session.flush()
    session.execute(delete(FilingChunk).where(FilingChunk.accession == filing.accession))
    titles = {s.key: s.title for s in sections}
    for s in sections:
        for c in chunk_section(body, s):
            session.add(
                FilingChunk(
                    accession=filing.accession,
                    cik=filing.cik,
                    section=c.section,
                    section_title=titles[c.section][:120],
                    ordinal=c.ordinal,
                    char_start=c.start,
                    char_end=c.end,
                    text=c.text,
                )
            )
    session.commit()
    return doc


@dataclass(frozen=True)
class Hit:
    chunk_id: int
    accession: str
    form: str
    filing_date: str
    section: str
    section_title: str
    char_start: int
    char_end: int
    text: str
    rank: float
    url: str


def search(
    session: Session, cik: int, query: str, *, limit: int = 8, sections: list[str] | None = None, accessions: list[str] | None = None
) -> list[Hit]:
    # Any-term match (OR of stemmed terms); cover-density ranking rewards passages matching more terms, closer together.
    tsq = func.to_tsquery("english", func.replace(cast(func.plainto_tsquery("english", query), Text), "&", "|"))
    rank = func.ts_rank_cd(FilingChunk.tsv, tsq)
    q = (
        select(FilingChunk, FilingDocument, rank.label("rank"))
        .join(FilingDocument, FilingDocument.accession == FilingChunk.accession)
        .where(FilingChunk.cik == cik, FilingChunk.tsv.op("@@")(tsq))
    )
    if sections:
        q = q.where(FilingChunk.section.in_(sections))
    if accessions:
        q = q.where(FilingChunk.accession.in_(accessions))
    rows = session.execute(q.order_by(text("rank DESC"), FilingChunk.id).limit(limit * 4)).all()
    hits = [
        Hit(
            c.id,
            c.accession,
            d.form,
            d.filing_date.isoformat(),
            c.section,
            c.section_title,
            c.char_start,
            c.char_end,
            c.text,
            float(r) * prose_weight(c.text),
            d.url,
        )
        for c, d, r in rows
    ]
    return sorted(hits, key=lambda h: (-h.rank, h.chunk_id))[:limit]


def prose_weight(chunk: str) -> float:
    """Down-weight table-like chunks: research questions are answered by narrative text.
    1.0 for prose; approaches 0.25 as digits dominate the characters."""
    if not chunk:
        return 0.0
    digits = sum(ch.isdigit() for ch in chunk)
    return max(0.25, 1.0 - 3.0 * digits / len(chunk))
