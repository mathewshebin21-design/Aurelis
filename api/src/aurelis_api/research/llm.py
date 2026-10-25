"""Model access behind a small interface, so research logic is testable without network calls."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Protocol


class ModelRefused(RuntimeError):
    pass


class ModelNotConfigured(RuntimeError):
    pass


@dataclass
class ModelResponse:
    data: dict[str, Any]
    model: str
    usage: dict[str, Any] = field(default_factory=dict)


class ResearchModel(Protocol):
    name: str

    def generate(self, system: str, user: str, schema: dict[str, Any]) -> ModelResponse: ...


class ClaudeModel:
    """Claude via the official Anthropic SDK with structured (JSON-schema) output.

    Uses server-side refusal fallback (`fallbacks="default"`) and checks
    `stop_reason` before reading content. Credentials come from the
    environment (ANTHROPIC_API_KEY); nothing is hard-coded.
    """

    def __init__(self, model: str = "claude-opus-5-5", effort: str = "medium", max_tokens: int = 16000, client: Any = None):
        self.name = model
        self.effort = effort
        self.max_tokens = max_tokens
        if client is None:
            import anthropic

            client = anthropic.Anthropic()  # credentials: ANTHROPIC_API_KEY (or an `ant auth login` profile)
        self._client = client

    def generate(self, system: str, user: str, schema: dict[str, Any]) -> ModelResponse:
        try:
            response = self._create(system, user, schema)
        except TypeError as e:  # SDK v2 resolves credentials lazily, on the first request
            if "authentication" in str(e).lower():
                raise ModelNotConfigured("Set ANTHROPIC_API_KEY to enable AI research") from e
            raise
        if response.stop_reason == "refusal":
            raise ModelRefused(f"Model declined the request ({getattr(response.stop_details, 'category', None)})")
        if response.stop_reason == "max_tokens":
            raise RuntimeError("Model output was truncated (max_tokens); no partial research is stored")
        text = next(b.text for b in response.content if b.type == "text")
        usage = response.usage.model_dump() if hasattr(response.usage, "model_dump") else {}
        return ModelResponse(json.loads(text), response.model, usage)

    def _create(self, system: str, user: str, schema: dict[str, Any]) -> Any:
        return self._client.beta.messages.create(
            model=self.name,
            max_tokens=self.max_tokens,
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            system=system,
            messages=[{"role": "user", "content": user}],
            output_config={"effort": self.effort, "format": {"type": "json_schema", "schema": schema}},
        )


class ScriptedModel:
    """Deterministic stand-in for tests and offline evaluation: returns a fixed payload."""

    def __init__(self, payload: dict[str, Any] | None = None, name: str = "scripted-test-model"):
        self.name = name
        self.payload = payload or {"claims": [], "open_questions": []}
        self.calls: list[tuple[str, str]] = []

    def generate(self, system: str, user: str, schema: dict[str, Any]) -> ModelResponse:
        self.calls.append((system, user))
        return ModelResponse(self.payload, self.name, {})
