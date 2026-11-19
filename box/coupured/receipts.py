"""Which stall accepted these coins?

When a vendor's wallet swaps a payment at the mint, it registers the proofs' Y values (hash_to_curve of
each secret; public, not PII) with its stall ID. When someone later tries to spend the same coins, the
refusing wallet asks who registered them first, so the "DÉJÀ DÉPENSÉ" screen can name the stall.

A registration is only accepted if the mint already reports every Y as SPENT, so nobody can pre-claim
coins that are still in circulation. Attribution is informational: the double-spend itself is refused
by the mint, not by this table.
"""

from __future__ import annotations

import sqlite3
import threading
import time

import httpx


class Receipts:
    def __init__(self, path: str, mint_url: str) -> None:
        self._db = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        self._db.execute("PRAGMA journal_mode=WAL")
        self._db.execute("CREATE TABLE IF NOT EXISTS receipts (y TEXT PRIMARY KEY, stall TEXT NOT NULL, ts REAL)")
        self._lock = threading.Lock()
        self.mint_url = mint_url.rstrip("/")

    async def all_spent(self, ys: list[str]) -> bool:
        async with httpx.AsyncClient(timeout=5.0) as c:
            r = await c.post(f"{self.mint_url}/v1/checkstate", json={"Ys": ys})
            r.raise_for_status()
            states = r.json().get("states", [])
        return len(states) == len(ys) and all(s.get("state") == "SPENT" for s in states)

    def register(self, stall: str, ys: list[str]) -> int:
        """Insert first-seen Ys. Returns how many were new."""
        now = time.time()
        with self._lock:
            before = self._db.total_changes
            self._db.executemany(
                "INSERT OR IGNORE INTO receipts (y, stall, ts) VALUES (?,?,?)", [(y, stall, now) for y in ys]
            )
            return self._db.total_changes - before

    def lookup(self, ys: list[str]) -> dict[str, dict[str, object]]:
        with self._lock:
            q = ",".join("?" * len(ys))
            rows = self._db.execute(f"SELECT y, stall, ts FROM receipts WHERE y IN ({q})", ys).fetchall()  # noqa: S608
        return {y: {"stall": stall, "ts": ts} for y, stall, ts in rows}
