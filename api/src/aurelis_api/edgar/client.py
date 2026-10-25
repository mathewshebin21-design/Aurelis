"""HTTP client for SEC EDGAR that follows the SEC fair-access policy.

- Declares a User-Agent with contact details (required by the SEC).
- Limits request rate (default 8/s, below the SEC's stated 10/s ceiling).
- Retries 429/5xx and transport errors with exponential backoff, honouring Retry-After.
- Supports conditional GET (If-Modified-Since) so unchanged data is not re-downloaded.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Any, Self

import httpx

from .ratelimit import RateLimiter

log = logging.getLogger(__name__)

TICKERS_URL = "https://www.sec.gov/files/company_tickers_exchange.json"
SUBMISSIONS_URL = "https://data.sec.gov/submissions/CIK{cik:010d}.json"
COMPANYFACTS_URL = "https://data.sec.gov/api/xbrl/companyfacts/CIK{cik:010d}.json"
FILING_INDEX_URL = "https://www.sec.gov/Archives/edgar/data/{cik}/{accession_nodash}/{document}"


class EdgarError(RuntimeError):
    pass


class UserAgentMissing(EdgarError):
    pass


@dataclass(frozen=True)
class Fetched:
    data: Any | None
    last_modified: str | None
    not_modified: bool = False

    def json(self) -> Any:
        if self.data is None:
            raise EdgarError("No body: resource was not modified")
        return self.data


class EdgarClient:
    def __init__(
        self,
        user_agent: str | None,
        *,
        max_rps: float = 8.0,
        timeout: float = 30.0,
        max_retries: int = 4,
        transport: httpx.BaseTransport | None = None,
        sleep=time.sleep,
    ):
        if not user_agent or "@" not in user_agent:
            raise UserAgentMissing("Set AURELIS_SEC_USER_AGENT to 'Name contact@email' as required by SEC fair-access rules")
        self._http = httpx.Client(
            headers={"User-Agent": user_agent, "Accept-Encoding": "gzip, deflate"},
            timeout=timeout,
            transport=transport,
            follow_redirects=True,
        )
        self._limiter = RateLimiter(max_rps, sleep=sleep)
        self._max_retries = max_retries
        self._sleep = sleep

    def close(self) -> None:
        self._http.close()

    def __enter__(self) -> Self:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    def _get(self, url: str, headers: dict[str, str]) -> httpx.Response:
        """GET with rate limiting and retries. Returns the response for 2xx and 304."""
        attempt = 0
        while True:
            self._limiter.acquire()
            try:
                resp = self._http.get(url, headers=headers)
            except httpx.TransportError as e:
                if attempt >= self._max_retries:
                    raise EdgarError(f"GET {url} failed after {attempt + 1} attempts: {e}") from e
                self._backoff(attempt, None)
                attempt += 1
                continue
            if resp.status_code == 404:
                raise EdgarError(f"Not found: {url}")
            if resp.status_code == 429 or resp.status_code >= 500:
                if attempt >= self._max_retries:
                    raise EdgarError(f"GET {url} returned {resp.status_code} after {attempt + 1} attempts")
                self._backoff(attempt, resp.headers.get("Retry-After"))
                attempt += 1
                continue
            if resp.status_code >= 400:
                raise EdgarError(f"GET {url} returned {resp.status_code}")
            return resp

    def get_json(self, url: str, *, if_modified_since: str | None = None) -> Fetched:
        headers = {"If-Modified-Since": if_modified_since} if if_modified_since else {}
        resp = self._get(url, headers)
        if resp.status_code == 304:
            return Fetched(None, if_modified_since, not_modified=True)
        return Fetched(resp.json(), resp.headers.get("Last-Modified"))

    def get_text(self, url: str) -> str:
        """A filing document (HTML). Only sec.gov URLs are fetched."""
        if not url.startswith("https://www.sec.gov/Archives/edgar/data/"):
            raise EdgarError(f"Refusing to fetch non-EDGAR URL: {url}")
        return self._get(url, {}).text

    def _backoff(self, attempt: int, retry_after: str | None) -> None:
        delay = min(60.0, 2.0**attempt)
        if retry_after and retry_after.isdigit():
            delay = max(delay, float(retry_after))
        log.warning("SEC request throttled or failed; retrying in %.1fs", delay)
        self._sleep(delay)

    def tickers(self) -> Fetched:
        return self.get_json(TICKERS_URL)

    def submissions(self, cik: int) -> Fetched:
        return self.get_json(SUBMISSIONS_URL.format(cik=cik))

    def company_facts(self, cik: int, *, if_modified_since: str | None = None) -> Fetched:
        return self.get_json(COMPANYFACTS_URL.format(cik=cik), if_modified_since=if_modified_since)
