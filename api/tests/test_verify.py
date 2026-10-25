"""Citation-verifier evaluation set.

Each case is a claim with a hand-assigned expected verdict and issue code. The
set doubles as the verifier's accuracy benchmark (`test_verifier_accuracy`).
Passages and facts are SYNTHETIC; they describe no real company.
"""

from decimal import Decimal

import pytest

from aurelis_api.research.facts import Fact, fmt
from aurelis_api.research.verify import ClaimIn, extract_numbers, run_metrics, verify_claim

EVIDENCE = {
    "E1": "Data Center revenue increased 34% year over year, driven by accelerator shipments to cloud customers.",
    "E2": "Our three largest customers accounted for approximately 46% of net revenue in fiscal 2025.",
    "E3": "Non-cancellable purchase commitments totalled $9.1 billion at fiscal year end.",
    "E4": "We expect gross margin in the low-to-mid 60s for the remainder of the year.",
}
FACTS = {
    "F1": Fact("F1", "Revenue", "FY2025", Decimal("391035000000"), fmt(Decimal("391035000000"), "currency"), "currency", "statement"),
    "F2": Fact("F2", "Gross margin", "FY2025", Decimal("0.46206"), fmt(Decimal("0.46206"), "ratio"), "ratio", "engine"),
    "F3": Fact("F3", "Gross margin", "FY2024", Decimal("0.45628"), fmt(Decimal("0.45628"), "ratio"), "ratio", "engine"),
    "F4": Fact("F4", "Debt / equity", "FY2025", Decimal("1.338"), fmt(Decimal("1.338"), "multiple"), "multiple", "engine"),
    "F5": Fact("F5", "EPS — diluted", "FY2025", Decimal("7.46"), fmt(Decimal("7.46"), "per_share"), "per_share", "statement"),
}


def C(kind, text, ev=(), facts=(), quotes=()):
    return ClaimIn("summary", kind, text, "high", list(ev), list(facts), list(quotes))


CASES = [
    # (claim, expected verdict, expected issue prefix or None)
    (C("fact", "Gross margin was 46.2% in FY2025.", facts=["F2"]), "verified", None),
    (C("fact", "Gross margin was about 46% in FY2025.", facts=["F2"]), "verified", None),  # coarser rounding is consistent
    (C("fact", "Revenue was $391.0 billion in fiscal 2025.", facts=["F1"]), "verified", None),
    (C("fact", "Revenue reached USD 391,035 million.", facts=["F1"]), "verified", None),
    (C("fact", "Diluted EPS was $7.46.", facts=["F5"]), "verified", None),
    (C("fact", "Debt to equity stood at 1.34x.", facts=["F4"]), "verified", None),
    (C("fact", "Three customers were about 46% of revenue in fiscal 2025.", ev=["E2"]), "verified", None),
    (
        C("fact", "Purchase commitments were $9.1 billion.", ev=["E3"], quotes=["purchase commitments totalled $9.1 billion"]),
        "verified",
        None,
    ),
    (C("interpretation", "Concentration in a few customers raises bargaining-power risk.", ev=["E2"]), "verified", None),
    (
        C("assumption", "If accelerator demand persists through the next fiscal year, the margin guidance is achievable.", ev=["E4"]),
        "verified",
        None,
    ),
    # ── failures ──
    (C("fact", "Revenue was $412 billion in fiscal 2025.", facts=["F1"]), "rejected", "unverified_number"),  # fabricated
    (
        C("fact", "Gross margin expanded 0.6 percentage points year over year.", facts=["F2", "F3"]),
        "rejected",
        "unverified_number",
    ),  # arithmetic
    (C("fact", "Data Center revenue grew 34%.", ev=[]), "rejected", "unsupported_fact"),
    (C("fact", "Customers were 46% of revenue.", ev=["E9"]), "rejected", "unknown_reference"),
    (C("fact", "Commitments were large.", ev=["E3"], quotes=["commitments exceeded $20 billion"]), "rejected", "quote_not_found"),
    (C("interpretation", "Data Center growth of 41% shows pricing power.", ev=["E1"]), "rejected", "unverified_number"),
    (C("interpretation", "The franchise looks durable.", ev=[]), "flagged", "unsupported_interpretation"),
    (C("assumption", "Assume revenue grows 15% a year.", ev=[]), "flagged", "assumed_figure"),
    (C("interpretation", "Returns are guaranteed to outpace peers.", ev=["E1"]), "rejected", "guarantee_language"),
    (C("interpretation", "We recommend investors buy; our price target is above the market.", ev=["E1"]), "flagged", "advisory_language"),
    (C("fact", "Gross margin was 46.2% in fiscal 2023.", facts=["F2"]), "flagged", "unverified_year"),
]


@pytest.mark.parametrize(("claim", "verdict", "issue"), CASES, ids=[c[0].text[:40] for c in CASES])
def test_case(claim, verdict, issue):
    check = verify_claim(claim, EVIDENCE, FACTS)
    assert check.verdict == verdict, check.issues
    if issue:
        assert any(i.startswith(issue) for i in check.issues), check.issues
    else:
        assert check.issues == []


def test_verifier_accuracy():
    """Benchmark summary: every labelled case must be classified correctly (precision and recall of rejections = 1.0)."""
    results = [(verify_claim(c, EVIDENCE, FACTS).verdict, v) for c, v, _ in CASES]
    rejected_pred = {i for i, (p, _) in enumerate(results) if p == "rejected"}
    rejected_true = {i for i, (_, t) in enumerate(results) if t == "rejected"}
    assert rejected_pred == rejected_true
    assert sum(p == t for p, t in results) == len(CASES)


def test_number_extraction():
    nums = {
        n.text: (n.kind, n.value)
        for n in extract_numbers("Revenue of $1,234.5 million rose 12.5% to 2.1x in 2024; Item 7A and Form 10-K had 3 parts")
    }
    assert nums["$1,234.5 million"] == ("money", Decimal("1234500000.0"))
    assert nums["12.5%"] == ("ratio", Decimal("0.125"))
    assert nums["2.1x"] == ("multiple", Decimal("2.1"))
    assert nums["2024"][0] == "year"
    assert not any("10" in t or t in ("7", "3") for t in nums)  # form names, item numbers, small counts ignored


def test_run_metrics():
    checks = [verify_claim(c, EVIDENCE, FACTS) for c, _, _ in CASES]
    m = run_metrics(checks)
    assert m["claims"] == len(CASES) and m["verified"] + m["flagged"] + m["rejected"] == len(CASES)
    assert m["unsupported_claims"] == 3  # incl. the claim citing a non-existent source
    assert 0 < m["number_verification_rate"] < 1
