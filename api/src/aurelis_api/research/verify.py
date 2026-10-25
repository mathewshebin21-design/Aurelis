"""Deterministic claim verification: the gate between model output and anything shown to users.

Rules (docs/09-research-methodology.md):
  • Every reference must exist (evidence chunk ids and fact ids supplied in the prompt).
  • A `fact` claim needs at least one reference; otherwise it is rejected.
  • Every number in a `fact` or `interpretation` claim must match a cited computed fact within
    its stated precision, or appear in a cited filing passage. An unmatched number rejects the claim:
    the model may not introduce figures or do arithmetic.
  • Quotations must appear verbatim (whitespace-insensitive) in a cited passage.
  • Interpretations without any reference are flagged as unsupported; assumptions may contain
    figures but are flagged so they are never mistaken for reported data.
  • Promotional or advisory language ("buy", "guaranteed", price targets) is flagged or rejected.
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from typing import Literal

from .facts import Fact

Kind = Literal["fact", "assumption", "interpretation"]
Verdict = Literal["verified", "flagged", "rejected"]

_NUM = re.compile(
    r"(?<![\w.])(?P<neg>[-−])?(?P<cur>\$|USD\s?)?(?P<num>\d{1,3}(?:,\d{3})+|\d+)(?P<dec>\.\d+)?"
    r"\s*(?P<unit>%|percent\b|per cent\b|x\b|×|times\b|trillion\b|billion\b|million\b|thousand\b|bn\b|mn\b|[bm]\b|bps\b|basis points\b)?",
    re.IGNORECASE,
)
_SCALE = {
    "trillion": Decimal("1e12"),
    "billion": Decimal("1e9"),
    "bn": Decimal("1e9"),
    "b": Decimal("1e9"),
    "million": Decimal("1e6"),
    "mn": Decimal("1e6"),
    "m": Decimal("1e6"),
    "thousand": Decimal("1e3"),
}
_ADVISORY = re.compile(r"\b(strong buy|buy rating|sell rating|we recommend|you should (buy|sell)|price target|outperform rating)\b", re.I)
_GUARANTEE = re.compile(r"\b(guarantee[ds]?|risk[- ]free return|certain to (rise|increase|outperform)|cannot lose)\b", re.I)


@dataclass(frozen=True)
class Number:
    text: str
    value: Decimal  # ratios as fractions (46.2% → 0.462); money in units
    kind: Literal["ratio", "money", "multiple", "plain", "year", "bps"]
    tolerance: Decimal


def extract_numbers(text: str) -> list[Number]:
    """Numbers worth checking. Ignored: small bare integers (< 13: counts, quarters, items) and form names."""
    out = []
    for m in _NUM.finditer(text):
        raw, dec, unit, cur = m.group("num"), m.group("dec") or "", (m.group("unit") or "").lower().strip(), m.group("cur")
        after = text[m.end() : m.end() + 3]
        before = text[max(0, m.start() - 6) : m.start()].lower()
        if after.startswith(("-K", "-Q", "-F")) or before.endswith(("item ", "form ", "fy", "q")):
            continue
        try:
            base = Decimal(raw.replace(",", "") + dec)
        except InvalidOperation:
            continue
        if m.group("neg"):
            base = -base
        places = len(dec) - 1 if dec else 0
        half_unit = Decimal(5) * Decimal(10) ** (-(places + 1))
        if unit in ("%", "percent", "per cent"):
            out.append(Number(m.group(0).strip(), base / 100, "ratio", half_unit / 100))
        elif unit in ("bps", "basis points"):
            out.append(Number(m.group(0).strip(), base / 10000, "bps", half_unit / 10000))
        elif unit in ("x", "×", "times"):
            out.append(Number(m.group(0).strip(), base, "multiple", half_unit))
        elif unit in _SCALE:
            out.append(Number(m.group(0).strip(), base * _SCALE[unit], "money", half_unit * _SCALE[unit]))
        elif cur:
            out.append(Number(m.group(0).strip(), base, "money", half_unit))
        elif not dec and "," not in raw and 1900 <= base <= 2100:
            out.append(Number(m.group(0).strip(), base, "year", Decimal(0)))
        elif dec or base >= 13:
            out.append(Number(m.group(0).strip(), base, "plain", half_unit))
    return out


def _matches_fact(n: Number, f: Fact) -> bool:
    if n.kind == "year":
        return str(int(n.value)) in f.period
    if n.kind in ("ratio", "bps"):
        return f.unit == "ratio" and abs(n.value - f.value) <= n.tolerance + Decimal("1e-9")
    if n.kind == "multiple":
        return f.unit == "multiple" and abs(n.value - f.value) <= n.tolerance + Decimal("1e-9")
    if n.kind == "money" or n.kind == "plain":
        if f.unit in ("currency", "per_share"):
            if abs(n.value - f.value) <= n.tolerance + abs(f.value) * Decimal("1e-9"):
                return True
            # "$391,035" alongside a fact displayed in millions
            return f.unit == "currency" and abs(n.value * Decimal(1_000_000) - f.value) <= n.tolerance * Decimal(1_000_000)
        if f.unit in ("multiple",) and n.kind == "plain":
            return abs(n.value - f.value) <= n.tolerance
    return False


def _matches_text(n: Number, passage_numbers: list[Number]) -> bool:
    for p in passage_numbers:
        if n.kind == "year" or p.kind == "year":
            if n.kind == p.kind == "year" and n.value == p.value:
                return True
            continue
        same_family = (n.kind == p.kind) or {n.kind, p.kind} <= {"money", "plain"}
        if same_family and abs(n.value - p.value) <= max(n.tolerance, p.tolerance) + abs(p.value) * Decimal("1e-9"):
            return True
    return False


def _normalise(s: str) -> str:
    s = s.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    return re.sub(r"\s+", " ", s).strip().lower()


@dataclass
class ClaimIn:
    section: str
    kind: Kind
    text: str
    confidence: str
    evidence_ids: list[str] = field(default_factory=list)  # "E<chunk id>"
    fact_ids: list[str] = field(default_factory=list)
    quotes: list[str] = field(default_factory=list)


@dataclass
class ClaimCheck:
    claim: ClaimIn
    verdict: Verdict
    issues: list[str]
    numbers_checked: int
    numbers_verified: int


def verify_claim(c: ClaimIn, evidence: dict[str, str], facts: dict[str, Fact]) -> ClaimCheck:
    """`evidence` maps prompt ids ("E123") to passage text; `facts` maps fact ids to facts."""
    rejects: list[str] = []
    flags: list[str] = []
    unknown_ev = [e for e in c.evidence_ids if e not in evidence]
    unknown_f = [f for f in c.fact_ids if f not in facts]
    if unknown_ev or unknown_f:
        rejects.append(f"unknown_reference: {', '.join([*unknown_ev, *unknown_f])}")
    cited_ev = [evidence[e] for e in c.evidence_ids if e in evidence]
    cited_f = [facts[f] for f in c.fact_ids if f in facts]
    has_ref = bool(cited_ev or cited_f)

    if c.kind == "fact" and not has_ref:
        rejects.append("unsupported_fact: a factual claim must cite a filing passage or a computed fact")
    if c.kind == "interpretation" and not has_ref:
        flags.append("unsupported_interpretation: no evidence cited")

    passage_numbers = [n for t in cited_ev for n in extract_numbers(t)]
    nums = extract_numbers(c.text)
    verified = 0
    for n in nums:
        ok = any(_matches_fact(n, f) for f in cited_f) or _matches_text(n, passage_numbers)
        if ok:
            verified += 1
        elif c.kind == "assumption":
            if n.kind != "year":
                flags.append(f"assumed_figure: '{n.text}' is an assumption, not reported data")
        elif n.kind == "year":
            flags.append(f"unverified_year: '{n.text}' not found in cited sources")
        else:
            rejects.append(f"unverified_number: '{n.text}' matches no cited fact or passage")

    norm_ev = [_normalise(t) for t in cited_ev]
    for q in c.quotes:
        if not any(_normalise(q) in t for t in norm_ev):
            (rejects if c.kind == "fact" else flags).append(f"quote_not_found: '{q[:60]}'")

    if _GUARANTEE.search(c.text):
        rejects.append("guarantee_language: outcomes cannot be guaranteed")
    if _ADVISORY.search(c.text):
        flags.append("advisory_language: AURELIS does not make recommendations")

    verdict: Verdict = "rejected" if rejects else "flagged" if flags else "verified"
    return ClaimCheck(c, verdict, rejects + flags, len(nums), verified)


def run_metrics(checks: Iterable[ClaimCheck]) -> dict[str, object]:
    cs = list(checks)
    n = len(cs)
    cited = sum(1 for c in cs if c.claim.evidence_ids or c.claim.fact_ids)
    nums = sum(c.numbers_checked for c in cs)
    ok = sum(c.numbers_verified for c in cs)
    by = {v: sum(1 for c in cs if c.verdict == v) for v in ("verified", "flagged", "rejected")}
    return {
        "claims": n,
        **by,
        "citation_coverage": round(cited / n, 4) if n else None,
        "numbers_checked": nums,
        "numbers_verified": ok,
        "number_verification_rate": round(ok / nums, 4) if nums else None,
        "unsupported_claims": sum(1 for c in cs if any(i.startswith("unsupported") for i in c.issues)),
    }
