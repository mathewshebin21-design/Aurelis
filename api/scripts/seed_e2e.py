"""Seed a database for browser end-to-end tests with the SYNTHETIC fixture issuer.

Runs the real migrations and the real ingest pipeline against mocked SEC responses
(no network). Fixture Corp (FXTR) gets full statements; Euro Fixture SE (EUFX) is only
in the ticker map, to exercise the "not ingested" state. This data exists only in the
e2e database and is never shown by the production terminal.

Usage: AURELIS_DATABASE_URL=postgresql+psycopg://.../aurelis_e2e uv run python scripts/seed_e2e.py
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import httpx  # noqa: E402
import respx  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from sqlalchemy import text  # noqa: E402
from tests.fixtures import synthetic as fx  # noqa: E402

from aurelis_api.config import get_settings  # noqa: E402
from aurelis_api.db import get_engine, session_factory  # noqa: E402
from aurelis_api.edgar.client import COMPANYFACTS_URL, SUBMISSIONS_URL, TICKERS_URL, EdgarClient  # noqa: E402
from aurelis_api.ingest.service import ingest_issuer, sync_tickers  # noqa: E402


def main() -> None:
    url = get_settings().database_url
    if not url.rstrip("/").endswith("_e2e"):
        raise SystemExit(f"Refusing to seed '{url}': the e2e database name must end in _e2e")
    with get_engine().begin() as c:
        c.execute(text("drop schema public cascade; create schema public"))
    cfg = Config(str(ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(ROOT / "migrations"))
    command.upgrade(cfg, "head")
    with respx.mock() as mock, session_factory()() as session:
        mock.get(TICKERS_URL).mock(return_value=httpx.Response(200, json=fx.tickers()))
        mock.get(SUBMISSIONS_URL.format(cik=fx.CIK)).mock(return_value=httpx.Response(200, json=fx.submissions()))
        mock.get(COMPANYFACTS_URL.format(cik=fx.CIK)).mock(return_value=httpx.Response(200, json=fx.company_facts()))
        with EdgarClient("AURELIS e2e test@example.com", max_rps=1000) as client:
            sync_tickers(session, client)
            run = ingest_issuer(session, client, "FXTR")
    print(f"Seeded e2e database: FXTR {run.status}, {run.lines_written} lines; EUFX listed without data")


if __name__ == "__main__":
    main()
