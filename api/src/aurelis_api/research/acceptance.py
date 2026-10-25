"""Live AI research acceptance test: real filings, real metrics, hard spending limit.

Two modes:
  dry run (default)  — prepares data and prompts, reports prompt sizes and the worst-case
                       cost the guard would reserve. Makes no model calls and spends nothing.
  live               — requires --live, --approve-spend and an API key. Each call is gated by
                       the BudgetGuard; actual tokens, cost and latency go to the ai_usage ledger.

The report preserves every claim, including rejected ones with their reasons.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..edgar.client import EdgarClient
from ..ingest.service import ingest_issuer, resolve_cik
from ..models import AiUsage, ResearchRun
from .budget import BudgetedModel, BudgetExceeded, BudgetGuard, worst_case
from .documents import ANNUAL_FORMS, QUARTERLY_FORMS, NoFilingAvailable, ingest_document, latest_filing
from .evaluation import evaluate_run
from .facts import build_facts
from .llm import ModelNotConfigured, ResearchModel
from .prompt import SYSTEM, schema, user_message
from .service import gather_evidence, run_research

BUDGET_KEY = "acceptance-test"
DEFAULT_TICKERS = ("AAPL", "MSFT", "JPM")
ACCEPTANCE_MAX_TOKENS = 10_000


@dataclass
class Prepared:
    ticker: str
    cik: int
    facts: int
    passages: int
    prompt_chars: int
    est_input_tokens: int
    worst_case_usd: Decimal
    notes: list[str] = field(default_factory=list)


def prepare(session: Session, client: EdgarClient, tickers: list[str], model: str) -> list[Prepared]:
    """Ingest statements and filing text (free SEC data) and size each prompt. No model calls."""
    out = []
    for t in tickers:
        ingest_issuer(session, client, t)
        cik = resolve_cik(session, client, t)
        notes = []
        for forms in (ANNUAL_FORMS, QUARTERLY_FORMS):
            try:
                ingest_document(session, client, latest_filing(session, cik, forms))
            except NoFilingAvailable as e:
                notes.append(str(e))
        facts = build_facts(session, cik)
        evidence = gather_evidence(session, cik)
        msg = user_message(t, facts, [], evidence)
        chars = len(SYSTEM) + len(msg) + len(json.dumps(schema()))
        est = chars // 3  # conservative chars-per-token estimate; live mode uses the exact count_tokens endpoint
        out.append(
            Prepared(t, cik, len(facts), len(evidence), chars, est, worst_case(int(est * 1.1) + 200, ACCEPTANCE_MAX_TOKENS, model), notes)
        )
    return out


@dataclass
class LiveResult:
    ticker: str
    run_id: int | None
    status: str
    detail: str = ""


def run_live(
    session: Session,
    ledger: Session,
    tickers: list[str],
    budget_usd: Decimal,
    inner: ResearchModel,
    count_tokens: Callable[[str, str, dict[str, Any]], int] | None = None,
) -> list[LiveResult]:
    """One research call per ticker, each gated by the guard. Stops at the first call the budget cannot cover."""
    guard = BudgetGuard(ledger, BUDGET_KEY, budget_usd)
    results = []
    for t in tickers:
        cik = resolve_cik(session, None, t)
        before = session.scalar(select(func.max(ResearchRun.id))) or 0
        model = BudgetedModel(inner, guard, max_tokens=ACCEPTANCE_MAX_TOKENS, count_tokens=count_tokens, purpose=f"acceptance:{t}")
        try:
            res = run_research(session, cik, model)
            run_id: int | None = res.run.id
            results.append(LiveResult(t, run_id, res.run.status, res.run.error or ""))
        except BudgetExceeded as e:
            results.append(LiveResult(t, None, "stopped_budget", str(e)))
            break  # hard stop: no further calls
        except ModelNotConfigured as e:
            results.append(LiveResult(t, None, "not_configured", str(e)))
            break
        except Exception as e:  # truncation, network, malformed output: the run row records it
            session.rollback()
            run_id = session.scalar(select(func.max(ResearchRun.id)).where(ResearchRun.cik == cik, ResearchRun.id > before))
            results.append(LiveResult(t, run_id, "error", f"{type(e).__name__}: {e}"))
        for rec in model.records:
            rec.research_run_id = run_id
            rec.detail = {**rec.detail, "ticker": t}
        ledger.commit()
    return results


def write_report(session: Session, ledger: Session, results: list[LiveResult], budget_usd: Decimal, out_dir: Path) -> Path:
    evaluations = [evaluate_run(session, r.run_id) for r in results if r.run_id]
    ledger_rows = ledger.scalars(select(AiUsage).where(AiUsage.budget_key == BUDGET_KEY).order_by(AiUsage.id)).all()
    spent = sum((u.cost_usd for u in ledger_rows), Decimal(0))
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    out_dir.mkdir(parents=True, exist_ok=True)
    data = {
        "generated_at": stamp,
        "budget_usd": str(budget_usd),
        "spent_usd": str(spent),
        "calls": [
            {
                "id": u.id,
                "purpose": u.purpose,
                "requested_model": u.requested_model,
                "served_model": u.served_model,
                "status": u.status,
                "input_tokens": u.input_tokens,
                "output_tokens": u.output_tokens,
                "cost_usd": str(u.cost_usd),
                "reserved_usd": str(u.reserved_usd),
                "latency_ms": u.latency_ms,
                "research_run_id": u.research_run_id,
                "detail": u.detail,
            }
            for u in ledger_rows
        ],
        "results": [r.__dict__ for r in results],
        "evaluations": evaluations,
    }
    (out_dir / f"acceptance-{stamp}.json").write_text(json.dumps(data, indent=2, default=str))
    md = out_dir / f"acceptance-{stamp}.md"
    md.write_text(render_markdown(data))
    return md


def render_markdown(d: dict[str, Any]) -> str:
    budget, spent = Decimal(d["budget_usd"]), Decimal(d["spent_usd"])
    out = [
        f"# Live AI research acceptance test — {d['generated_at']}",
        "",
        f"Budget **${budget:.2f}** · actual spend **${spent:.4f}** (from API-reported token usage).",
        "",
        "## Model calls (actual)",
        "",
        "| # | Purpose | Model served | Status | Input tok | Output tok | Cost (USD) | Latency |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for c in d["calls"]:
        cost, secs = Decimal(c["cost_usd"]), c["latency_ms"] / 1000
        row = [str(c["id"]), c["purpose"], c["served_model"] or "—", c["status"], f"{c['input_tokens']:,}", f"{c['output_tokens']:,}"]
        out.append("| " + " | ".join([*row, f"{cost:.4f}", f"{secs:.1f} s"]) + " |")
    for r in d["results"]:
        if r["status"] != "ok":
            out += ["", f"**{r['ticker']}: {r['status']}** — {r['detail']}"]
    for e in d["evaluations"]:
        out += _render_run(e)
    return "\n".join(out) + "\n"


def _render_run(e: dict[str, Any]) -> list[str]:
    dm, v = e["dimensions"], e["verdicts"]
    sv, na, qa = dm["source_validity"], dm["numerical_accuracy"], dm["quotation_accuracy"]
    co, ua, iq = dm["completeness"], dm["unsupported_assertions"], dm["interpretation_quality"]
    rows = [
        (
            "Source validity",
            f"valid references {sv['claims_with_valid_references']}; relevant sources {sv['claims_with_relevant_sources']}; "
            f"weak-source claims {sv['weak_source_claims'] or 'none'}",
        ),
        ("Numerical accuracy", f"{na['numbers_verified']}/{na['numbers_checked']} numbers verified ({na['rate']})"),
        ("Quotation accuracy", f"{qa['found_verbatim']}/{qa['quotes']} quotes found verbatim"),
        (
            "Completeness",
            f"sections {', '.join(co['sections_covered']) or 'none'}; required missing {co['required_missing'] or 'none'}; "
            f"open questions {co['open_questions']}",
        ),
        ("Unsupported assertions", f"{ua['count']} ({ua['rate']})"),
        (
            "Interpretation quality",
            f"cited share {iq['cited_share']}; direction mismatches {len(iq['direction_mismatches'])}; "
            f"bull and bear present {iq['balanced_bull_and_bear']}; advisory/guarantee {iq['advisory_or_guarantee_language']}",
        ),
    ]
    out = [
        "",
        f"## Run {e['run_id']} · CIK {e['cik']} · {e['model']}",
        "",
        f"Claims {e['claims_total']}: verified {v['verified']}, flagged {v['flagged']}, rejected {v['rejected']}. "
        f"Re-verification matches stored verdicts: {e['verdicts_match_stored']}.",
        "",
        "| Dimension | Result |",
        "|---|---|",
        *[f"| {k} | {val} |" for k, val in rows],
        "",
        "Human review (1–5): accuracy ☐ · insight ☐ · balance ☐ · clarity ☐",
        "",
        "### Claims (all, including rejected)",
        "",
        "| # | Section | Kind | Verdict | Claim | Issues |",
        "|---|---|---|---|---|---|",
    ]
    for c in e["claims"]:
        text = c["text"].replace("|", "\\|")
        issues = "; ".join(c["issues"]).replace("|", "\\|") or "—"
        out.append(f"| {c['id']} | {c['section']} | {c['kind']} | **{c['verdict']}** | {text} | {issues} |")
    return out
