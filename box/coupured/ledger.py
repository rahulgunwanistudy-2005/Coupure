"""Append-only, hash-chained event log (SQLite, WAL).

Each row is {seq, ts, kind, payload, prev_hash, hash} with
    hash = sha256(prev_hash_bytes || canonical_json({seq, ts, kind, payload}))
so changing, dropping or reordering any past row breaks every hash after it. Payloads never carry PII:
no names, no phone numbers; vendors are pseudonymous stall IDs.
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
import threading
import time
from dataclasses import dataclass
from typing import Any

GENESIS = "00" * 32


def canonical_json(obj: Any) -> bytes:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()


def row_hash(prev_hash: str, seq: int, ts: float, kind: str, payload: dict[str, Any]) -> str:
    body = canonical_json({"seq": seq, "ts": ts, "kind": kind, "payload": payload})
    return hashlib.sha256(bytes.fromhex(prev_hash) + body).hexdigest()


@dataclass(frozen=True)
class Entry:
    seq: int
    ts: float
    kind: str
    payload: dict[str, Any]
    prev_hash: str
    hash: str

    def as_dict(self) -> dict[str, Any]:
        return self.__dict__.copy()


class Ledger:
    def __init__(self, path: str) -> None:
        self._db = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        self._lock = threading.Lock()
        self._db.execute("PRAGMA journal_mode=WAL")
        self._db.execute("PRAGMA synchronous=FULL")
        self._db.execute(
            "CREATE TABLE IF NOT EXISTS ledger ("
            " seq INTEGER PRIMARY KEY, ts REAL NOT NULL, kind TEXT NOT NULL,"
            " payload TEXT NOT NULL, prev_hash TEXT NOT NULL, hash TEXT NOT NULL)"
        )
        # append-only at the storage layer too
        self._db.execute(
            "CREATE TRIGGER IF NOT EXISTS ledger_no_update BEFORE UPDATE ON ledger"
            " BEGIN SELECT RAISE(ABORT, 'ledger is append-only'); END"
        )
        self._db.execute(
            "CREATE TRIGGER IF NOT EXISTS ledger_no_delete BEFORE DELETE ON ledger"
            " BEGIN SELECT RAISE(ABORT, 'ledger is append-only'); END"
        )

    def append(self, kind: str, payload: dict[str, Any], ts: float | None = None) -> Entry:
        with self._lock:
            head = self._db.execute("SELECT seq, hash FROM ledger ORDER BY seq DESC LIMIT 1").fetchone()
            seq, prev = (head[0] + 1, head[1]) if head else (1, GENESIS)
            ts = round(time.time() if ts is None else ts, 3)
            h = row_hash(prev, seq, ts, kind, payload)
            self._db.execute(
                "INSERT INTO ledger VALUES (?,?,?,?,?,?)",
                (seq, ts, kind, canonical_json(payload).decode(), prev, h),
            )
            return Entry(seq, ts, kind, payload, prev, h)

    def head(self) -> Entry | None:
        rows = self.tail(1)
        return rows[0] if rows else None

    def tail(self, n: int = 50) -> list[Entry]:
        with self._lock:
            rows = self._db.execute("SELECT * FROM ledger ORDER BY seq DESC LIMIT ?", (n,)).fetchall()
        return [Entry(r[0], r[1], r[2], json.loads(r[3]), r[4], r[5]) for r in rows]

    def verify(self) -> dict[str, Any]:
        """Recompute the whole chain. Returns {ok, length, head, first_bad_seq}."""
        prev, n = GENESIS, 0
        with self._lock:
            cur = self._db.execute("SELECT * FROM ledger ORDER BY seq ASC")
            for seq, ts, kind, payload, prev_hash, h in cur:
                n += 1
                if seq != n or prev_hash != prev or row_hash(prev, seq, ts, kind, json.loads(payload)) != h:
                    return {"ok": False, "length": n, "head": prev, "first_bad_seq": seq}
                prev = h
        return {"ok": True, "length": n, "head": prev, "first_bad_seq": None}
