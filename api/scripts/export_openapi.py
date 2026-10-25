"""Write the API contract to shared/openapi.json (the source for the web client's generated types).

Usage: uv run python scripts/export_openapi.py [--check]
--check exits non-zero if the committed file is stale (used in CI).
"""

import json
import sys
from pathlib import Path

from aurelis_api.web.app import app

OUT = Path(__file__).resolve().parents[2] / "shared" / "openapi.json"


def main() -> int:
    spec = json.dumps(app.openapi(), indent=2, sort_keys=True) + "\n"
    if "--check" in sys.argv:
        if not OUT.exists() or OUT.read_text() != spec:
            print(f"{OUT} is stale: run `uv run python scripts/export_openapi.py`", file=sys.stderr)
            return 1
        print("OpenAPI contract up to date")
        return 0
    OUT.write_text(spec)
    print(f"Wrote {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
