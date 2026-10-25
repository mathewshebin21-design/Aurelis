import httpx
import pytest
import respx

from aurelis_api.edgar.client import COMPANYFACTS_URL, SUBMISSIONS_URL, TICKERS_URL, EdgarClient, EdgarError, UserAgentMissing
from aurelis_api.edgar.parse import PayloadError, iter_company_facts, parse_submissions, parse_tickers
from aurelis_api.edgar.ratelimit import RateLimiter

from .fixtures import synthetic as fx

UA = "AURELIS tests test@example.com"


class FakeClock:
    def __init__(self):
        self.t = 0.0
        self.sleeps: list[float] = []

    def now(self):
        return self.t

    def sleep(self, s):
        self.sleeps.append(s)
        self.t += s


def test_user_agent_is_required():
    with pytest.raises(UserAgentMissing):
        EdgarClient(None)
    with pytest.raises(UserAgentMissing):
        EdgarClient("no contact")


def test_rate_limiter_spaces_requests():
    c = FakeClock()
    rl = RateLimiter(8, clock=c.now, sleep=c.sleep)
    for _ in range(9):
        rl.acquire()
    assert len(c.sleeps) == 8 and all(abs(s - 0.125) < 1e-9 for s in c.sleeps)
    assert c.t == pytest.approx(1.0)  # 9 requests take ≥ 1 s at 8 req/s


@respx.mock
def test_declares_user_agent_and_parses():
    route = respx.get(TICKERS_URL).mock(return_value=httpx.Response(200, json=fx.tickers()))
    with EdgarClient(UA, max_rps=1000) as c:
        rows = parse_tickers(c.tickers().json())
    assert route.calls[0].request.headers["User-Agent"] == UA
    assert rows[0].ticker == "FXTR" and rows[0].cik == fx.CIK and rows[1].exchange is None


@respx.mock
def test_retries_429_honouring_retry_after():
    url = SUBMISSIONS_URL.format(cik=fx.CIK)
    respx.get(url).mock(
        side_effect=[httpx.Response(429, headers={"Retry-After": "3"}), httpx.Response(503), httpx.Response(200, json=fx.submissions())]
    )
    clock = FakeClock()
    with EdgarClient(UA, max_rps=1000, sleep=clock.sleep) as c:
        profile = parse_submissions(c.submissions(fx.CIK).json())
    assert [s for s in clock.sleeps if s >= 1] == [3.0, 2.0]  # rate-limiter waits are sub-second
    assert profile.fiscal_year_end == "0928" and profile.tickers == ["FXTR"]
    assert profile.filings[0].url.endswith(f"/{fx.K24.replace('-', '')}/fxtr-000010.htm")
    assert any(f.is_amendment for f in profile.filings)


@respx.mock
def test_gives_up_after_max_retries():
    respx.get(TICKERS_URL).mock(return_value=httpx.Response(500))
    with EdgarClient(UA, max_rps=1000, max_retries=2, sleep=lambda s: None) as c, pytest.raises(EdgarError, match="after 3 attempts"):
        c.tickers()


@respx.mock
def test_conditional_get_and_404():
    url = COMPANYFACTS_URL.format(cik=fx.CIK)
    route = respx.get(url).mock(return_value=httpx.Response(304))
    with EdgarClient(UA, max_rps=1000) as c:
        got = c.company_facts(fx.CIK, if_modified_since="Wed, 01 Jan 2025 00:00:00 GMT")
        assert got.not_modified and route.calls[0].request.headers["If-Modified-Since"].startswith("Wed")
        with pytest.raises(EdgarError):
            got.json()
    respx.get(COMPANYFACTS_URL.format(cik=1)).mock(return_value=httpx.Response(404))
    with EdgarClient(UA, max_rps=1000) as c, pytest.raises(EdgarError, match="Not found"):
        c.company_facts(1)


def test_parsers_reject_malformed_payloads():
    with pytest.raises(PayloadError):
        parse_tickers({"data": []})
    with pytest.raises(PayloadError):
        parse_submissions({"cik": "1"})
    with pytest.raises(PayloadError):
        list(iter_company_facts({}))
    facts = list(iter_company_facts(fx.company_facts()))
    instants = [f for f in facts if f.concept == "Assets"]
    assert all(f.start is None for f in instants) and len(facts) > 40
