"""Temporary admin guard (shared secret). Phase 6 replaces it with user authentication."""

from __future__ import annotations

import hmac
from typing import Annotated

from fastapi import Header, HTTPException

from ..config import get_settings


def require_admin(x_admin_token: Annotated[str | None, Header()] = None) -> None:
    expected = get_settings().admin_token
    if not expected:
        raise HTTPException(503, "Admin endpoints are disabled: AURELIS_ADMIN_TOKEN is not set")
    if not x_admin_token or not hmac.compare_digest(x_admin_token, expected):
        raise HTTPException(401, "Invalid admin token")
