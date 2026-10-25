"""Hard spending limit for paid model calls.

Before every call the guard reserves the *worst-case* cost (full `max_tokens` of
output, a possible refusal-fallback second attempt, at the highest price either
model could bill) and refuses to make the call if that reservation could take
total spend past the limit. After the call it records the actual cost computed
from the token usage the API returns. Spend is persisted in the `ai_usage`
ledger, so the limit holds across processes and restarts.
"""

from __future__ import annotations

import time
from collections.abc import Callable
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import AiUsage
from .llm import ModelError, ModelNotConfigured, ModelResponse, ResearchModel

M = Decimal(1_000_000)


@dataclass(frozen=True)
class Price:
    """USD per million tokens. Source: Anthropic list prices (cached model table dated 2026-10-06)."""

    input: Decimal
    output: Decimal

    @property
    def cache_write(self) -> Decimal:
        return self.input * Decimal("1.25")

    @property
    def cache_read(self) -> Decimal:
        return self.input * Decimal("0.1")


PRICES: dict[str, Price] = {
    "claude-opus-5-5": Price(Decimal(4), Decimal(20)),
    "claude-opus-5": Price(Decimal(5), Decimal(25)),
    "claude-opus-4-8": Price(Decimal(5), Decimal(25)),
    "claude-sonnet-5-5": Price(Decimal(2), Decimal(10)),
    "claude-haiku-5-5": Price(Decimal("0.10"), Decimal("0.50")),
    "claude-fable-5-1": Price(Decimal(10), Decimal(50)),
}
# Unknown model ids are billed in the ledger at the most expensive known rate, never at zero.
CEILING = max(PRICES.values(), key=lambda p: p.output)
# Refusal fallback may hand a request to another model; reserve at the dearer of the two.
FALLBACK_CEILING = PRICES["claude-opus-4-8"]


class BudgetExceeded(RuntimeError):
    pass


def price_for(model: str) -> tuple[Price, bool]:
    for key, p in PRICES.items():
        if model == key or model.startswith(key + "-"):
            return p, True
    return CEILING, False


def cost_of(usage: dict[str, Any], served_model: str) -> tuple[Decimal, list[str]]:
    """Actual cost from an API `usage` object. Uses per-attempt `iterations` when present (fallback hops)."""
    notes: list[str] = []
    parts = usage.get("iterations") or [dict(usage, model=served_model)]
    total = Decimal(0)
    for it in parts:
        model = it.get("model") or served_model
        p, known = price_for(model)
        if not known:
            notes.append(f"No list price for '{model}'; charged at the highest known rate")
        total += (
            Decimal(it.get("input_tokens") or 0) * p.input
            + Decimal(it.get("output_tokens") or 0) * p.output
            + Decimal(it.get("cache_creation_input_tokens") or 0) * p.cache_write
            + Decimal(it.get("cache_read_input_tokens") or 0) * p.cache_read
        ) / M
    return total, notes


def worst_case(input_tokens: int, max_tokens: int, model: str) -> Decimal:
    p, _ = price_for(model)
    rate_in, rate_out = max(p.input, FALLBACK_CEILING.input), max(p.output, FALLBACK_CEILING.output)
    one_attempt = (Decimal(input_tokens) * rate_in + Decimal(max_tokens) * rate_out) / M
    return 2 * one_attempt  # a declined attempt plus its fallback


class BudgetGuard:
    """`session` should be dedicated to the ledger so recording spend never commits or rolls back other work."""

    def __init__(self, session: Session, budget_key: str, limit_usd: Decimal):
        if limit_usd <= 0:
            raise ValueError("Budget must be positive")
        self.session, self.key, self.limit = session, budget_key, limit_usd

    def spent(self) -> Decimal:
        return Decimal(self.session.scalar(select(func.coalesce(func.sum(AiUsage.cost_usd), 0)).where(AiUsage.budget_key == self.key)) or 0)

    def remaining(self) -> Decimal:
        return self.limit - self.spent()

    def check(self, reservation: Decimal) -> None:
        if self.spent() + reservation > self.limit:
            spent = self.spent()
            raise BudgetExceeded(
                f"Budget '{self.key}' would be exceeded: spent ${spent:.4f} + worst case ${reservation:.4f} > limit ${self.limit:.2f}"
            )


class BudgetedModel:
    """Wraps a ResearchModel: reserve worst case → call → record actual cost and latency."""

    def __init__(
        self,
        inner: ResearchModel,
        guard: BudgetGuard,
        *,
        max_tokens: int,
        count_tokens: Callable[[str, str, dict[str, Any]], int] | None = None,
        purpose: str = "research",
        clock: Callable[[], float] = time.perf_counter,
    ):
        self.inner, self.guard, self.max_tokens, self.purpose = inner, guard, max_tokens, purpose
        self.name = inner.name
        self._count = count_tokens or (lambda system, user, schema: (len(system) + len(user) + len(str(schema))) // 3)
        self._clock = clock
        self.records: list[AiUsage] = []

    def generate(self, system: str, user: str, schema: dict[str, Any]) -> ModelResponse:
        est = self._count(system, user, schema)
        reservation = worst_case(int(est * 1.1) + 200, self.max_tokens, self.name)
        self.guard.check(reservation)
        start = self._clock()
        status, usage, served, err = "ok", {}, None, None
        try:
            resp = self.inner.generate(system, user, schema)
            usage, served = resp.usage, resp.model
            return resp
        except ModelNotConfigured:  # no request was made: nothing to bill or record
            status = "not_configured"
            raise
        except ModelError as e:  # the API answered (refusal, truncation): its usage is billed
            status, usage, served, err = e.status, e.usage, e.model, str(e)
            raise
        except Exception as e:  # outcome unknown (e.g. network): assume the full reservation was billed
            status, err = "error", f"{type(e).__name__}: {e}"
            usage = {}
            raise
        finally:
            if status != "not_configured":
                self._record(status, usage, served, err, reservation, est, int((self._clock() - start) * 1000))

    def _record(
        self, status: str, usage: dict[str, Any], served: str | None, err: str | None, reservation: Decimal, est: int, latency: int
    ) -> None:
        if usage:
            cost, notes = cost_of(usage, served or self.name)
        else:
            cost, notes = (
                (reservation, ["Cost unknown; recorded the full worst-case reservation"]) if status == "error" else (Decimal(0), [])
            )
        rec = AiUsage(
            budget_key=self.guard.key,
            purpose=self.purpose,
            requested_model=self.name,
            served_model=served,
            input_tokens=int(usage.get("input_tokens") or 0),
            output_tokens=int(usage.get("output_tokens") or 0),
            cache_creation_input_tokens=int(usage.get("cache_creation_input_tokens") or 0),
            cache_read_input_tokens=int(usage.get("cache_read_input_tokens") or 0),
            cost_usd=cost,
            reserved_usd=reservation,
            latency_ms=latency,
            status=status,
            detail={"estimated_input_tokens": est, "notes": notes, **({"error": err} if err else {})},
        )
        self.guard.session.add(rec)
        self.guard.session.commit()  # the ledger survives even if the caller's later work fails
        self.records.append(rec)
