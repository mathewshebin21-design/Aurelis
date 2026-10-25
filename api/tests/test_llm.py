"""ClaudeModel request shape and failure handling, with a fake SDK client (no network)."""

import json
from types import SimpleNamespace

import pytest

from aurelis_api.research.llm import ClaudeModel, ModelNotConfigured, ModelRefused
from aurelis_api.research.prompt import SYSTEM, schema


class FakeMessages:
    def __init__(self, response=None, error=None):
        self.response, self.error, self.kwargs = response, error, None

    def create(self, **kwargs):
        self.kwargs = kwargs
        if self.error:
            raise self.error
        return self.response


def client(messages):
    return SimpleNamespace(beta=SimpleNamespace(messages=messages))


def response(stop_reason="end_turn", payload=None):
    return SimpleNamespace(
        stop_reason=stop_reason,
        stop_details=SimpleNamespace(category="cyber"),
        model="claude-opus-5-5",
        content=[
            SimpleNamespace(type="thinking"),
            SimpleNamespace(type="text", text=json.dumps(payload or {"claims": [], "open_questions": []})),
        ],
        usage=SimpleNamespace(model_dump=lambda: {"input_tokens": 10, "output_tokens": 5}),
    )


def test_request_uses_structured_output_effort_and_refusal_fallback():
    m = FakeMessages(response(payload={"claims": [{"x": 1}], "open_questions": []}))
    out = ClaudeModel(client=client(m)).generate(SYSTEM, "user text", schema())
    k = m.kwargs
    assert k["model"] == "claude-opus-5-5" and k["fallbacks"] == "default" and k["betas"] == ["server-side-fallback-2026-07-01"]
    assert k["output_config"]["effort"] == "medium" and k["output_config"]["format"]["schema"]["required"] == ["claims", "open_questions"]
    assert "thinking" not in k and "temperature" not in k  # adaptive thinking by default; sampling params are rejected by the API
    assert out.data == {"claims": [{"x": 1}], "open_questions": []} and out.usage["input_tokens"] == 10


def test_refusal_and_truncation_are_errors_not_data():
    with pytest.raises(ModelRefused, match="cyber"):
        ClaudeModel(client=client(FakeMessages(response("refusal")))).generate(SYSTEM, "u", schema())
    with pytest.raises(RuntimeError, match="truncated"):
        ClaudeModel(client=client(FakeMessages(response("max_tokens")))).generate(SYSTEM, "u", schema())


def test_missing_credentials_become_a_clear_configuration_error():
    err = TypeError('"Could not resolve authentication method. Expected one of api_key, auth_token, or credentials to be set."')
    with pytest.raises(ModelNotConfigured, match="ANTHROPIC_API_KEY"):
        ClaudeModel(client=client(FakeMessages(error=err))).generate(SYSTEM, "u", schema())
