import os

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError

TEST_DB = os.environ.get("AURELIS_TEST_DATABASE_URL", "postgresql+psycopg://postgres@127.0.0.1:5433/aurelis_test")


@pytest.fixture(scope="session")
def engine():
    """Fresh schema built by the real Alembic migrations (so migrations are tested too)."""
    from alembic import command
    from alembic.config import Config

    eng = create_engine(TEST_DB)
    try:
        with eng.connect() as c:
            c.execute(text("select 1"))
    except OperationalError:
        pytest.skip(f"PostgreSQL not reachable at {TEST_DB}")
    os.environ["AURELIS_DATABASE_URL"] = TEST_DB
    from aurelis_api.config import get_settings

    get_settings.cache_clear()
    cfg = Config(os.path.join(os.path.dirname(__file__), "..", "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(os.path.dirname(__file__), "..", "migrations"))
    with eng.begin() as c:  # start from an empty schema, then apply every migration
        c.execute(text("drop schema public cascade; create schema public"))
    command.upgrade(cfg, "head")
    command.downgrade(cfg, "base")  # migrations must also reverse cleanly
    command.upgrade(cfg, "head")
    yield eng
    eng.dispose()


@pytest.fixture
def session(engine):
    from sqlalchemy.orm import Session

    with engine.begin() as c:
        c.execute(
            text(
                "truncate issuer, filing, fact, normalized_line, corporate_action, fx_rate, ingest_run, issuer_ticker "
                "restart identity cascade"
            )
        )
    with Session(engine, expire_on_commit=False) as s:
        yield s
