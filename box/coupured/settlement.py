"""Authenticated client for the internal cashu-ts sweep wallet. No proofs are logged."""

from __future__ import annotations

from typing import Any

import httpx


class Settlement:
    def __init__(self, url: str, token: str) -> None:
        self.url, self.token = url.rstrip("/"), token

    async def call(self, path: str, body: dict[str, Any] | None = None) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=60.0, headers={"Authorization": f"Bearer {self.token}"}) as c:
            r = await c.request("POST" if body is not None else "GET", self.url + path, json=body)
            r.raise_for_status()
            return r.json()
