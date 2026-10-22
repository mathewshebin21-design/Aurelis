"""Command-line entry points: `aurelis-api serve | ingest TICKER… | sync-tickers`."""

from __future__ import annotations

import argparse
import logging

from .config import get_settings
from .db import session_factory
from .edgar.client import EdgarClient
from .ingest.service import ingest_issuer, sync_tickers


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
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

    if args.cmd == "serve":
        import uvicorn

        uvicorn.run("aurelis_api.web.app:app", host=args.host, port=args.port)
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
        else:
            for ref in args.refs:
                run = ingest_issuer(session, client, ref, force=args.force)
                print(f"{ref}: {run.status} · facts seen {run.facts_seen}, new {run.facts_inserted}, lines {run.lines_written}")
