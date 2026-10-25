# ruff: noqa: E501 — prompt text: line breaks are content, not formatting
"""Prompt and output schema for evidence-bound research. Versioned so stored runs are reproducible."""

from __future__ import annotations

from typing import Any

from .documents import Hit
from .facts import Fact

PROMPT_VERSION = "research-1.0"

SECTIONS = ["summary", "bull", "bear", "risk", "catalyst", "earnings", "competition"]

SYSTEM = """You are an equity research analyst writing for an investment committee. You work only from the material supplied in the user message: numbered filing passages [E…] from the company's SEC filings and computed facts [F…] (and [P…] for peers) produced by a deterministic calculation engine.

How every claim is labelled and checked:
- kind "fact": something the filings state or the computed facts show. It must cite at least one [E…] or [F…] id.
- kind "interpretation": your reasoning about what the cited material implies. Cite the material it rests on.
- kind "assumption": a forward-looking premise the reader must accept for an argument to hold (e.g. "if data-centre demand persists"). Say clearly that it is an assumption.

Rules that an automated checker enforces after you answer:
- Use only numbers that appear verbatim in a cited passage or as a cited computed fact (same rounding is fine). Do not calculate anything: no new percentages, differences, ratios, sums or projections. If a comparison needs a number you were not given, describe it qualitatively.
- Any "quotes" you include must be exact excerpts from the cited passages.
- Cite only ids that appear in the user message.

Content:
- Cover the business summary, bull case, bear case, key risks, catalysts, the latest quarter's results (section "earnings") and the competitive position (section "competition") where the material supports it. It is fine to write fewer claims than sections when evidence is thin.
- State uncertainty plainly with the confidence field. Put questions the material cannot answer in open_questions rather than guessing.
- Describe; do not advise. No buy/sell language, price targets or statements about future returns."""


def schema() -> dict[str, Any]:
    claim = {
        "type": "object",
        "properties": {
            "section": {"type": "string", "enum": SECTIONS},
            "kind": {"type": "string", "enum": ["fact", "assumption", "interpretation"]},
            "text": {"type": "string"},
            "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
            "evidence_ids": {"type": "array", "items": {"type": "string"}},
            "fact_ids": {"type": "array", "items": {"type": "string"}},
            "quotes": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["section", "kind", "text", "confidence", "evidence_ids", "fact_ids", "quotes"],
        "additionalProperties": False,
    }
    return {
        "type": "object",
        "properties": {
            "claims": {"type": "array", "items": claim},
            "open_questions": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["claims", "open_questions"],
        "additionalProperties": False,
    }


def user_message(company: str, facts: list[Fact], peer_facts: list[Fact], evidence: list[Hit]) -> str:
    lines = [f"Company: {company}", "", "Computed facts (deterministic engine, from SEC filings):"]
    lines += [f.as_prompt_line() for f in facts] or ["(none)"]
    if peer_facts:
        lines += ["", "Peer computed facts:"] + [f.as_prompt_line() for f in peer_facts]
    lines += ["", "Filing passages:"]
    for h in evidence:
        lines.append(f"[E{h.chunk_id}] {h.form} filed {h.filing_date}, {h.section_title}:\n{h.text}\n")
    lines.append("Write the research claims as JSON.")
    return "\n".join(lines)


# Retrieval plan: one query per research topic; results are de-duplicated.
TOPIC_QUERIES: dict[str, str] = {
    "business": "business overview products services segments customers",
    "risks": "risk factors could adversely affect results competition regulation supply",
    "results": "net sales revenue increased decreased compared primarily due to",
    "margins": "gross margin operating expenses decreased increased due to",
    "liquidity": "liquidity capital resources cash debt repurchase dividends",
    "competition": "competition competitors competitive pricing market share",
    "outlook": "expect outlook future demand investments plans",
    "concentration": "customer concentration significant customers suppliers single source",
}
