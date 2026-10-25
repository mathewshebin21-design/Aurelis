"""Command-line entry points: `aurelis-api serve | ingest TICKER… | sync-tickers`."""

from __future__ import annotations

import argparse
import logging

from .config import get_settings
from .db import session_factory
from .edgar.client import EdgarClient
from .ingest.service import ingest_issuer, resolve_cik, sync_tickers


def main() -> None:
    parser = argparse.ArgumentParser(prog="aurelis-api")
    sub = parser.add_subparsers(dest="cmd", required=True)
    serve = sub.add_parser("serve", help="Run the HTTP API")
    serve.add_argument("--host", default="127.0.0.1")
    serve.add_argument("--port", type=int, default=8000)
    ing = sub.add_parser("ingest", help="Ingest one or more issuers from SEC EDGAR")
    ing.add_argument("refs", nargs="+", help="Tickers or CIKs")
    ing.add_argument("--force", action="store_true", help="Ignore Last-Modified and re-download")
    sub.add_parser("sync-tickers", help="Refresh the SEC ticker ↔ CIK map")
    txt = sub.add_parser("ingest-text", help="Download and index the latest 10-K/10-Q text for issuers")
    txt.add_argument("refs", nargs="+")
    txt.add_argument("--kind", choices=["annual", "quarterly", "both"], default="both")
    res = sub.add_parser("research", help="Generate verified AI research (needs ANTHROPIC_API_KEY)")
    res.add_argument("ref")
    res.add_argument("--peers", nargs="*", default=[])
    sub.add_parser("eval-citations", help="Citation-verification metrics across stored research runs")
    acc = sub.add_parser("acceptance-test", help="AI research acceptance test with a hard spending limit (dry run by default)")
    acc.add_argument("--tickers", nargs="+", default=["AAPL", "MSFT", "JPM"])
    acc.add_argument("--budget-usd", default="2", help="Hard limit on total model spend for this test (default 2)")
    acc.add_argument("--live", action="store_true", help="Make real model calls (also requires --approve-spend)")
    acc.add_argument("--approve-spend", action="store_true", help="Explicit approval to spend up to --budget-usd")
    acc.add_argument("--out", default="../docs/evaluations", help="Directory for the evaluation report")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

    if args.cmd == "serve":
        import uvicorn

        uvicorn.run("aurelis_api.web.app:app", host=args.host, port=args.port)
        return
    if args.cmd == "acceptance-test":
        _acceptance(args)
        return
    if args.cmd in ("research", "eval-citations"):
        _research_commands(args)
        return
    s = get_settings()
    with (
        EdgarClient(
            s.sec_user_agent, max_rps=s.sec_max_requests_per_second, timeout=s.sec_timeout_seconds, max_retries=s.sec_max_retries
        ) as client,
        session_factory()() as session,
    ):
        if args.cmd == "sync-tickers":
            print(f"{sync_tickers(session, client)} tickers synced")
        elif args.cmd == "ingest-text":
            from .research.documents import ANNUAL_FORMS, QUARTERLY_FORMS, ingest_document, latest_filing

            choices: dict[str, list[tuple[str, ...]]] = {
                "annual": [ANNUAL_FORMS],
                "quarterly": [QUARTERLY_FORMS],
                "both": [ANNUAL_FORMS, QUARTERLY_FORMS],
            }
            kinds = choices[args.kind]
            for ref in args.refs:
                cik = resolve_cik(session, client, ref)
                for forms in kinds:
                    doc = ingest_document(session, client, latest_filing(session, cik, forms))
                    keys = [str(x["key"]) for x in doc.sections]
                    print(f"{ref}: {doc.form} filed {doc.filing_date} · {len(doc.text):,} chars · sections {keys}")
        else:
            for ref in args.refs:
                run = ingest_issuer(session, client, ref, force=args.force)
                print(f"{ref}: {run.status} · facts seen {run.facts_seen}, new {run.facts_inserted}, lines {run.lines_written}")


def _research_commands(args: argparse.Namespace) -> None:
    from sqlalchemy import select

    from .models import ResearchRun
    from .research.llm import ClaudeModel
    from .research.service import run_research

    s = get_settings()
    with session_factory()() as session:
        if args.cmd == "research":
            cik = resolve_cik(session, None, args.ref)
            result = run_research(
                session, cik, ClaudeModel(s.research_model, s.research_effort), [resolve_cik(session, None, p) for p in args.peers]
            )
            print(f"run {result.run.id}: {result.run.status} · {result.run.metrics}")
            for c in result.checks:
                print(f"  [{c.verdict:8}] {c.claim.kind:14} {c.claim.text[:100]}" + (f"  ← {'; '.join(c.issues)}" if c.issues else ""))
            return
        runs = session.scalars(select(ResearchRun).where(ResearchRun.status == "ok")).all()
        totals: dict[str, float] = {}
        for r in runs:
            for k in ("claims", "verified", "flagged", "rejected", "numbers_checked", "numbers_verified", "unsupported_claims"):
                totals[k] = totals.get(k, 0) + float(str(r.metrics.get(k) or 0))
        claims = totals.get("claims", 0)
        print(f"{len(runs)} research runs · {int(claims)} claims")
        if claims:
            share = {k: totals[k] / claims for k in ("verified", "flagged", "rejected")}
            print(f"  verified {share['verified']:.1%} · flagged {share['flagged']:.1%} · rejected {share['rejected']:.1%}")
            print(f"  unsupported claims {totals['unsupported_claims'] / claims:.1%}")
        if totals.get("numbers_checked"):
            print(f"  numbers verified against sources {totals['numbers_verified'] / totals['numbers_checked']:.1%}")


def _acceptance(args: argparse.Namespace) -> None:
    import os
    from decimal import Decimal
    from pathlib import Path

    from sqlalchemy.orm import Session

    from .db import get_engine
    from .research import acceptance as acc
    from .research.budget import BudgetGuard

    s = get_settings()
    budget = Decimal(args.budget_usd)
    tickers = [t.upper() for t in args.tickers]
    engine = get_engine()
    with Session(engine, expire_on_commit=False) as session, Session(engine, expire_on_commit=False) as ledger:
        with EdgarClient(
            s.sec_user_agent, max_rps=s.sec_max_requests_per_second, timeout=s.sec_timeout_seconds, max_retries=s.sec_max_retries
        ) as client:
            prepared = acc.prepare(session, client, tickers, s.research_model)
        guard = BudgetGuard(ledger, acc.BUDGET_KEY, budget)
        print(f"Model {s.research_model} · effort {s.research_effort} · max_tokens {acc.ACCEPTANCE_MAX_TOKENS:,}")
        print(f"Budget ${budget:.2f} · already spent under '{acc.BUDGET_KEY}': ${guard.spent():.4f}")
        for p in prepared:
            print(
                f"  {p.ticker:5} CIK {p.cik}: {p.facts} facts, {p.passages} passages, ~{p.est_input_tokens:,} input tokens (estimate), "
                f"worst-case reservation ${p.worst_case_usd:.4f}" + (f"  [{'; '.join(p.notes)}]" if p.notes else "")
            )
        total = sum((p.worst_case_usd for p in prepared), Decimal(0))
        print(
            f"Worst-case total ${total:.4f} vs limit ${budget:.2f}: "
            + ("fits" if total <= guard.remaining() else "later calls may be stopped")
        )
        if not args.live:
            print("Dry run: no model calls made, nothing spent. Re-run with --live --approve-spend once ANTHROPIC_API_KEY is set.")
            return
        if not args.approve_spend:
            raise SystemExit("--live requires --approve-spend: refusing to make paid model calls")
        if not os.environ.get("ANTHROPIC_API_KEY"):
            raise SystemExit("ANTHROPIC_API_KEY is not set: refusing to run the live test")
        from .research.llm import ClaudeModel

        inner = ClaudeModel(s.research_model, s.research_effort, max_tokens=acc.ACCEPTANCE_MAX_TOKENS)
        results = acc.run_live(session, ledger, tickers, budget, inner, count_tokens=inner.count_tokens)
        for r in results:
            print(f"  {r.ticker}: {r.status} run={r.run_id} {r.detail}")
        report = acc.write_report(session, ledger, results, budget, Path(args.out))
        print(f"Report: {report} · spent ${guard.spent():.4f} of ${budget:.2f}")
