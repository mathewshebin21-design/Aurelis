"""Research orchestration: retrieve evidence, compute facts, ask the model, verify, store."""

from __future__ import annotations

import logging
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import FilingDocument, Issuer, IssuerTicker, ResearchClaim, ResearchRun
from ..quant import ENGINE_VERSION
from .documents import Hit, search
from .facts import Fact, build_facts
from .llm import ModelNotConfigured, ModelRefused, ResearchModel
from .prompt import PROMPT_VERSION, SYSTEM, TOPIC_QUERIES, schema, user_message
from .verify import ClaimCheck, ClaimIn, run_metrics, verify_claim

log = logging.getLogger(__name__)

MAX_EVIDENCE = 24
PER_TOPIC = 3


class NoFilingText(LookupError):
    pass


@dataclass
class ResearchResult:
    run: ResearchRun
    checks: list[ClaimCheck]


def gather_evidence(session: Session, cik: int) -> list[Hit]:
    """Top passages per research topic from the latest annual and quarterly reports, de-duplicated."""
    docs = session.scalars(select(FilingDocument).where(FilingDocument.cik == cik).order_by(FilingDocument.filing_date.desc())).all()
    if not docs:
        raise NoFilingText("No filing text ingested for this issuer; ingest its latest 10-K/10-Q text first")
    latest_by_kind: dict[str, str] = {}
    for d in docs:
        latest_by_kind.setdefault("annual" if d.form.startswith(("10-K", "20-F", "40-F")) else "quarterly", d.accession)
    accessions = list(latest_by_kind.values())
    seen: dict[int, Hit] = {}
    for query in TOPIC_QUERIES.values():
        for h in search(session, cik, query, limit=PER_TOPIC, accessions=accessions):
            seen.setdefault(h.chunk_id, h)
    return sorted(seen.values(), key=lambda h: -h.rank)[:MAX_EVIDENCE]


def _ticker(session: Session, cik: int) -> str:
    return session.scalar(select(IssuerTicker.ticker).where(IssuerTicker.cik == cik, IssuerTicker.is_current.is_(True))) or str(cik)


def run_research(session: Session, cik: int, model: ResearchModel, peer_ciks: list[int] | None = None) -> ResearchResult:
    issuer = session.get(Issuer, cik)
    if issuer is None:
        raise LookupError(f"Unknown issuer {cik}")
    currency = issuer.reporting_currency or "USD"
    facts = build_facts(session, cik, currency=currency)
    peer_facts: list[Fact] = []
    for i, p in enumerate(peer_ciks or [], start=1):
        peer_facts += build_facts(session, p, years=1, prefix=f"P{i}-", label_prefix=f"{_ticker(session, p)}: ")
    evidence = gather_evidence(session, cik)

    run = ResearchRun(
        cik=cik,
        model=model.name,
        engine_version=ENGINE_VERSION,
        prompt_version=PROMPT_VERSION,
        status="running",
        facts=[
            {"id": f.id, "label": f.label, "period": f.period, "value": str(f.value), "display": f.display, "source": f.source}
            for f in [*facts, *peer_facts]
        ],
        evidence_ids=[h.chunk_id for h in evidence],
    )
    session.add(run)
    session.flush()
    try:
        response = model.generate(SYSTEM, user_message(f"{issuer.name} ({_ticker(session, cik)})", facts, peer_facts, evidence), schema())
    except ModelNotConfigured:
        session.rollback()  # configuration problem, not a research outcome: keep no run record
        raise
    except ModelRefused as e:
        run.status, run.error = "refused", str(e)
        session.commit()
        return ResearchResult(run, [])
    except Exception as e:
        run.status, run.error = "error", f"{type(e).__name__}: {e}"
        session.commit()
        raise

    ev_text = {f"E{h.chunk_id}": h.text for h in evidence}
    fact_map = {f.id: f for f in [*facts, *peer_facts]}
    checks = []
    for raw in response.data.get("claims", []):
        claim = ClaimIn(
            section=raw["section"],
            kind=raw["kind"],
            text=raw["text"],
            confidence=raw["confidence"],
            evidence_ids=list(raw.get("evidence_ids", [])),
            fact_ids=list(raw.get("fact_ids", [])),
            quotes=list(raw.get("quotes", [])),
        )
        check = verify_claim(claim, ev_text, fact_map)
        checks.append(check)
        session.add(
            ResearchClaim(
                run_id=run.id,
                section=claim.section,
                kind=claim.kind,
                text=claim.text,
                confidence=claim.confidence,
                evidence_chunk_ids=[int(e[1:]) for e in claim.evidence_ids if e.startswith("E") and e[1:].isdigit()],
                fact_ids=claim.fact_ids,
                quotes=claim.quotes,
                verdict=check.verdict,
                issues=check.issues,
            )
        )
    run.open_questions = list(response.data.get("open_questions", []))
    run.metrics = run_metrics(checks)
    run.usage = response.usage
    run.model = response.model
    run.status = "ok"
    session.commit()
    log.info("Research run %s for CIK %s: %s", run.id, cik, run.metrics)
    return ResearchResult(run, checks)
