"""Persisted same-origin display quote. Missing price never blocks a T1 payment."""

from __future__ import annotations

import json
import os
import time
from decimal import Decimal
from pathlib import Path
from typing import Any

import httpx


class PriceSnapshot:
    def __init__(self, path: str, world_url: str) -> None:
        self.path, self.world_url = Path(path), world_url
        self.value: dict[str, Any] = {"btc_eur_cents": None, "ts": 0, "stale": True}
        try:
            self.value = json.loads(self.path.read_text())
        except (OSError, ValueError):
            pass

    async def refresh(self) -> None:
        async with httpx.AsyncClient(timeout=5) as c:
            r = await c.get(self.world_url + "/price")
            r.raise_for_status()
            data = r.json()
        cents = int(Decimal(str(data["EUR"])) * 100)
        if not 100 <= cents <= 100_000_000_000:
            raise ValueError("invalid price")
        self.value = {"btc_eur_cents": str(cents), "ts": time.time(), "source": "mempool.space", "stale": False}
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.value))
        os.replace(tmp, self.path)

    def snapshot(self, online: bool) -> dict[str, Any]:
        return {**self.value, "stale": not online or time.time() - self.value.get("ts", 0) > 300}
