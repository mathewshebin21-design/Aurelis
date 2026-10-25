"""Evaluation of stored research runs.

Every claim is re-verified from the stored facts and evidence (the verifier is
deterministic, so this reproduces the run-time verdict) and scored on six
dimensions. Rejected claims are always included with their reasons.

Interpretation quality is only partly automatable. The deterministic checks
cover direction consistency, citation discipline, bull/bear balance and
advisory language; the report adds a rubric for human review of insight and
clarity rather than pretending a script can judge them.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import AiUsage, FilingChunk, ResearchClaim, ResearchRun
from .facts import Fact
from .prompt import SECTIONS
from .verify import ClaimIn, _normalise, verify_claim

REQUIRED_SECTIONS = ("summary", "bull", "bear", "risk")
_STOP = frozenset(
    [
        "the",
        "a",
        "an",
        "and",
        "or",
        "of",
        "to",
        "in",
        "on",
        "for",
        "with",
        "by",
        "as",
        "at",
        "from",
        "that",
        "this",
        "these",
        "those",
        "is",
        "are",
        "was",
        "were",
        "be",
        "been",
        "its",
        "it",
        "their",
        "our",
        "we",
        "which",
        "while",
        "than",
        "into",
        "over",
        "under",
        "more",
        "less",
        "also",
        "has",
        "have",
        "had",
        "not",
        "no",
        "can",
        "could",
        "may",
        "might",
        "will",
        "would",
        "should",
        "company",
    ]
)
_UP = re.compile(r"\b(increase[ds]?|grew|grow(s|th)?|rose|rise[sn]?|higher|expand(ed|s)?|improv(ed|es|ement)|up)\b", re.I)
_DOWN = re.compile(r"\b(decrease[ds]?|declin(ed|es|e)|fell|fall(s|en)?|lower|contract(ed|s)?|shr[ai]nk|down|drop(ped|s)?)\b", re.I)


def _terms(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-z][a-z\-]{2,}", text.lower()) if w not in _STOP}


@dataclass
class ClaimEval:
    id: int
    section: str
    kind: str
    text: str
    confidence: str
    verdict: str
    issues: list[str]
    evidence_ids: list[str]
    fact_ids: list[str]
    numbers_checked: int
    numbers_verified: int
    quotes: int
    quotes_found: int
    source_overlap: int
    weak_source: bool
    direction_mismatch: str | None
    excerpts: list[dict[str, Any]] = field(default_factory=list)


def _ratio(n: float, d: float) -> float | None:
    return round(n / d, 4) if d else None


def evaluate_run(session: Session, run_id: int) -> dict[str, Any]:
    run = session.get(ResearchRun, run_id)
    if run is None:
        raise LookupError(f"Unknown research run {run_id}")
    claims = session.scalars(select(ResearchClaim).where(ResearchClaim.run_id == run_id).order_by(ResearchClaim.id)).all()
    chunk_rows = session.scalars(select(FilingChunk).where(FilingChunk.id.in_(run.evidence_ids or [-1]))).all()
    evidence = {f"E{c.id}": c.text for c in chunk_rows}
    chunk_meta = {f"E{c.id}": c for c in chunk_rows}
    facts = {
        str(f["id"]): Fact(
            str(f["id"]),
            str(f["label"]),
            str(f["period"]),
            Decimal(str(f["value"])),
            str(f["display"]),
            _unit(str(f["display"])),
            str(f["source"]),
        )
        for f in run.facts
    }

    evals: list[ClaimEval] = []
    for c in claims:
        ev_ids = [f"E{i}" for i in c.evidence_chunk_ids]
        claim = ClaimIn(c.section, c.kind, c.text, c.confidence, ev_ids, list(c.fact_ids), list(c.quotes))  # type: ignore[arg-type]
        check = verify_claim(claim, evidence, facts)
        cited_text = " ".join(evidence.get(e, "") for e in ev_ids) + " " + " ".join(facts[f].label for f in c.fact_ids if f in facts)
        overlap = len(_terms(c.text) & _terms(cited_text))
        number_hit = check.numbers_verified > 0
        cited_norm = [_normalise(evidence[e]) for e in ev_ids if e in evidence]
        quotes_found = sum(1 for q in c.quotes if any(_normalise(q) in t for t in cited_norm))
        evals.append(
            ClaimEval(
                id=c.id,
                section=c.section,
                kind=c.kind,
                text=c.text,
                confidence=c.confidence,
                verdict=check.verdict,
                issues=check.issues,
                evidence_ids=ev_ids,
                fact_ids=list(c.fact_ids),
                numbers_checked=check.numbers_checked,
                numbers_verified=check.numbers_verified,
                quotes=len(c.quotes),
                quotes_found=quotes_found,
                source_overlap=overlap,
                weak_source=bool(ev_ids or c.fact_ids) and overlap < 2 and not number_hit,
                direction_mismatch=_direction(c.text, [facts[f] for f in c.fact_ids if f in facts]),
                excerpts=[
                    {"id": e, "section": chunk_meta[e].section_title, "text": chunk_meta[e].text[:400]} for e in ev_ids if e in chunk_meta
                ],
            )
        )

    n = len(evals)
    sections = {e.section for e in evals if e.verdict != "rejected"}
    interp = [e for e in evals if e.kind == "interpretation"]
    usage = session.scalars(select(AiUsage).where(AiUsage.research_run_id == run_id)).all()
    dimensions = {
        "source_validity": {
            "claims_with_valid_references": _ratio(
                sum(1 for e in evals if not any(i.startswith("unknown_reference") for i in e.issues)), n
            ),
            "claims_with_relevant_sources": _ratio(sum(1 for e in evals if (e.evidence_ids or e.fact_ids) and not e.weak_source), n),
            "weak_source_claims": [e.id for e in evals if e.weak_source],
        },
        "numerical_accuracy": {
            "numbers_checked": sum(e.numbers_checked for e in evals),
            "numbers_verified": sum(e.numbers_verified for e in evals),
            "rate": _ratio(sum(e.numbers_verified for e in evals), sum(e.numbers_checked for e in evals)),
        },
        "quotation_accuracy": {
            "quotes": sum(e.quotes for e in evals),
            "found_verbatim": sum(e.quotes_found for e in evals),
            "rate": _ratio(sum(e.quotes_found for e in evals), sum(e.quotes for e in evals)),
        },
        "completeness": {
            "sections_covered": sorted(sections),
            "required_missing": [s for s in REQUIRED_SECTIONS if s not in sections],
            "optional_missing": [s for s in SECTIONS if s not in sections and s not in REQUIRED_SECTIONS],
            "coverage": _ratio(len(sections & set(SECTIONS)), len(SECTIONS)),
            "open_questions": len(run.open_questions or []),
        },
        "unsupported_assertions": {
            "count": sum(1 for e in evals if any(i.startswith(("unsupported", "unverified_number")) for i in e.issues)),
            "rate": _ratio(sum(1 for e in evals if any(i.startswith(("unsupported", "unverified_number")) for i in e.issues)), n),
        },
        "interpretation_quality": {
            "interpretations": len(interp),
            "cited_share": _ratio(sum(1 for e in interp if e.evidence_ids or e.fact_ids), len(interp)),
            "direction_mismatches": [{"claim": e.id, "detail": e.direction_mismatch} for e in evals if e.direction_mismatch],
            "balanced_bull_and_bear": "bull" in sections and "bear" in sections,
            "advisory_or_guarantee_language": sum(1 for e in evals if any(i.startswith(("advisory", "guarantee")) for i in e.issues)),
            "human_review": {"accuracy": None, "insight": None, "balance": None, "clarity": None, "scale": "1–5, filled by a reviewer"},
        },
    }
    return {
        "run_id": run.id,
        "cik": run.cik,
        "status": run.status,
        "error": run.error,
        "model": run.model,
        "prompt_version": run.prompt_version,
        "engine_version": run.engine_version,
        "created_at": run.created_at.isoformat(),
        "claims_total": n,
        "verdicts": {v: sum(1 for e in evals if e.verdict == v) for v in ("verified", "flagged", "rejected")},
        "verdicts_match_stored": all(e.verdict == c.verdict for e, c in zip(evals, claims, strict=True)),
        "dimensions": dimensions,
        "cost": {
            "usd": str(sum((u.cost_usd for u in usage), Decimal(0))),
            "latency_ms": [u.latency_ms for u in usage],
            "input_tokens": sum(u.input_tokens for u in usage),
            "output_tokens": sum(u.output_tokens for u in usage),
            "served_models": sorted({u.served_model or "" for u in usage}),
        },
        "claims": [e.__dict__ for e in evals],
        "open_questions": run.open_questions,
    }


def _unit(display: str) -> str:
    if display.endswith("%"):
        return "ratio"
    if display.endswith("x"):
        return "multiple"
    if display.endswith("per share"):
        return "per_share"
    return "currency"


def _direction(text: str, cited: list[Fact]) -> str | None:
    """A claim saying 'grew' while citing a negative growth fact (or vice versa) is an interpretation error."""
    growth = [f for f in cited if "growth" in f.label.lower()]
    if not growth:
        return None
    up, down = bool(_UP.search(text)), bool(_DOWN.search(text))
    for f in growth:
        if f.value < 0 and up and not down:
            return f"says increase but {f.id} ({f.label}) is {f.display}"
        if f.value > 0 and down and not up:
            return f"says decrease but {f.id} ({f.label}) is {f.display}"
    return None
