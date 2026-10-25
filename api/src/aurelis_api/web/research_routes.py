"""Research endpoints: filing text, retrieval, the facts the model sees, and verified research runs."""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_session
from ..edgar.client import EdgarClient, EdgarError, UserAgentMissing
from ..ingest.service import IssuerNotFound, resolve_cik
from ..models import FilingChunk, FilingDocument, Issuer, ResearchClaim, ResearchRun
from ..research.documents import ANNUAL_FORMS, QUARTERLY_FORMS, NoFilingAvailable, ingest_document, latest_filing, search
from ..research.facts import build_facts
from ..research.llm import ClaudeModel, ModelNotConfigured
from ..research.service import NoFilingText, run_research
from .security import require_admin

router = APIRouter(prefix="/v1", tags=["research"])
DB = Annotated[Session, Depends(get_session)]
Ref = Annotated[str, Field(min_length=1, max_length=16, pattern=r"^[A-Za-z0-9.\-]+$")]
PathRef = Annotated[str, Path(min_length=1, max_length=16, pattern=r"^[A-Za-z0-9.\-]+$", description="Ticker or CIK")]


class ComputedFactOut(BaseModel):
    id: str
    label: str
    period: str
    value: str
    display: str
    source: str


class ResearchFactsOut(BaseModel):
    cik: int
    facts: list[ComputedFactOut]


class EvidenceOut(BaseModel):
    id: str
    form: str
    filed: date
    section: str
    excerpt: str
    url: str
    char_start: int
    char_end: int


class ClaimOut(BaseModel):
    id: int
    section: str
    kind: str
    text: str
    confidence: str
    verdict: Literal["verified", "flagged", "rejected"]
    issues: list[str]
    quotes: list[str]
    evidence: list[EvidenceOut]
    facts: list[ComputedFactOut]


class RunOut(BaseModel):
    id: int
    cik: int
    created_at: datetime
    status: str
    error: str | None
    model: str
    engine_version: str
    prompt_version: str
    metrics: dict[str, Any]
    open_questions: list[str]
    claims: list[ClaimOut]
    rejected_hidden: int
    disclaimer: str


DISCLAIMER = (
    "AI-written research, checked by a deterministic citation verifier. Facts are cited to SEC filings or computed figures; "
    "interpretations and assumptions are labelled. Not investment advice."
)


def _cik(session: Session, ref: str) -> int:
    try:
        cik = resolve_cik(session, None, ref)
    except IssuerNotFound:
        raise HTTPException(404, f"Unknown issuer '{ref}'. Ingest it first.") from None
    if session.get(Issuer, cik) is None:
        raise HTTPException(404, f"Unknown issuer '{ref}'. Ingest it first.")
    return cik


@router.post("/admin/filings/{ref}/text", dependencies=[Depends(require_admin)])
def ingest_text(session: DB, ref: PathRef, kind: Literal["annual", "quarterly"] = "annual") -> dict[str, object]:
    cik = _cik(session, ref)
    s = get_settings()
    try:
        filing = latest_filing(session, cik, ANNUAL_FORMS if kind == "annual" else QUARTERLY_FORMS)
        with EdgarClient(s.sec_user_agent, max_rps=s.sec_max_requests_per_second, timeout=s.sec_timeout_seconds) as client:
            doc = ingest_document(session, client, filing)
    except NoFilingAvailable as e:
        raise HTTPException(404, str(e)) from None
    except UserAgentMissing as e:
        raise HTTPException(503, str(e)) from None
    except EdgarError as e:
        raise HTTPException(502, f"SEC EDGAR request failed: {e}") from None
    chunks = session.scalar(select(FilingChunk.id).where(FilingChunk.accession == doc.accession).limit(1))
    return {
        "accession": doc.accession,
        "form": doc.form,
        "filing_date": doc.filing_date,
        "characters": len(doc.text),
        "sections": [x["key"] for x in doc.sections],
        "chunked": chunks is not None,
    }


class HitOut(BaseModel):
    id: str
    form: str
    filing_date: str
    section: str
    section_title: str
    char_start: int
    char_end: int
    text: str
    rank: float
    url: str


@router.get("/companies/{ref}/filings/search", response_model=list[HitOut])
def filing_search(
    session: DB, ref: str, q: Annotated[str, Query(min_length=2, max_length=200)], limit: Annotated[int, Query(ge=1, le=20)] = 8
):
    cik = _cik(session, ref)
    return [
        HitOut(id=f"E{h.chunk_id}", **{k: v for k, v in h.__dict__.items() if k != "chunk_id"})
        for h in search(session, cik, q, limit=limit)
    ]


@router.get("/companies/{ref}/research/facts", response_model=ResearchFactsOut)
def research_facts(session: DB, ref: PathRef) -> dict[str, object]:
    """Exactly the computed facts a research run would give the model (the only numbers it may quote)."""
    cik = _cik(session, ref)
    issuer = session.get(Issuer, cik)
    facts = build_facts(session, cik, currency=(issuer.reporting_currency if issuer else None) or "USD")
    return {
        "cik": cik,
        "facts": [
            {"id": f.id, "label": f.label, "period": f.period, "value": str(f.value), "display": f.display, "source": f.source}
            for f in facts
        ],
    }


class ResearchIn(BaseModel):
    peers: Annotated[list[Ref], Field(max_length=5)] = []


@router.post("/admin/research/{ref}", response_model=RunOut, dependencies=[Depends(require_admin)])
def create_research(session: DB, ref: PathRef, body: ResearchIn) -> dict[str, object]:
    cik = _cik(session, ref)
    peers = [_cik(session, p) for p in body.peers]
    s = get_settings()
    try:
        model = ClaudeModel(s.research_model, s.research_effort)
        result = run_research(session, cik, model, peers)
    except ModelNotConfigured as e:
        raise HTTPException(503, str(e)) from None
    except NoFilingText as e:
        raise HTTPException(409, str(e)) from None
    return run_detail(session, result.run.id)


@router.get("/research/runs/{run_id}", response_model=RunOut)
def run_detail(session: DB, run_id: int, include_rejected: bool = False) -> dict[str, object]:
    run = session.get(ResearchRun, run_id)
    if run is None:
        raise HTTPException(404, "Unknown research run")
    claims = session.scalars(select(ResearchClaim).where(ResearchClaim.run_id == run_id).order_by(ResearchClaim.id)).all()
    chunk_ids = {i for c in claims for i in c.evidence_chunk_ids}
    chunks = {c.id: c for c in session.scalars(select(FilingChunk).where(FilingChunk.id.in_(chunk_ids)))} if chunk_ids else {}
    docs = {
        d.accession: d
        for d in session.scalars(select(FilingDocument).where(FilingDocument.accession.in_({c.accession for c in chunks.values()})))
    }
    facts = {f["id"]: f for f in run.facts}

    def claim_out(c: ResearchClaim) -> dict[str, object]:
        return {
            "id": c.id,
            "section": c.section,
            "kind": c.kind,
            "text": c.text,
            "confidence": c.confidence,
            "verdict": c.verdict,
            "issues": c.issues,
            "quotes": c.quotes,
            "evidence": [
                {
                    "id": f"E{i}",
                    "form": docs[chunks[i].accession].form,
                    "filed": docs[chunks[i].accession].filing_date,
                    "section": chunks[i].section_title,
                    "excerpt": chunks[i].text,
                    "url": docs[chunks[i].accession].url,
                    "char_start": chunks[i].char_start,
                    "char_end": chunks[i].char_end,
                }
                for i in c.evidence_chunk_ids
                if i in chunks
            ],
            "facts": [facts[f] for f in c.fact_ids if f in facts],
        }

    shown = [c for c in claims if include_rejected or c.verdict != "rejected"]
    return {
        "id": run.id,
        "cik": run.cik,
        "created_at": run.created_at,
        "status": run.status,
        "error": run.error,
        "model": run.model,
        "engine_version": run.engine_version,
        "prompt_version": run.prompt_version,
        "metrics": run.metrics,
        "open_questions": run.open_questions,
        "claims": [claim_out(c) for c in shown],
        "rejected_hidden": sum(1 for c in claims if c.verdict == "rejected") if not include_rejected else 0,
        "disclaimer": DISCLAIMER,
    }


@router.get("/companies/{ref}/research", response_model=RunOut)
def latest_research(session: DB, ref: PathRef) -> dict[str, object]:
    cik = _cik(session, ref)
    run = session.scalars(
        select(ResearchRun).where(ResearchRun.cik == cik, ResearchRun.status == "ok").order_by(ResearchRun.id.desc())
    ).first()
    if run is None:
        raise HTTPException(404, "No research has been generated for this issuer yet")
    return run_detail(session, run.id)
