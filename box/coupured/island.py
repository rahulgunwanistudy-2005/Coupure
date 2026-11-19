"""IslandMonitor: is the box connected to the world?

States: ONLINE → ISLAND (after `hysteresis` consecutive failed probes) → RECONCILING (after `hysteresis`
consecutive successes) → ONLINE (once reconcile tasks finish). The box boots in RECONCILING so a fresh
start always runs the reconcile path once.

The probe is an HTTP request through the uplink to the world's bitcoind (an unauthenticated request gets a
401, which proves the path is up). It deliberately avoids `lnd getinfo`, which blocks for ~60 s when the
chain backend is unreachable (docs/VERSIONS.md).
"""

from __future__ import annotations

import asyncio
import contextlib
import time
from collections.abc import Awaitable, Callable
from enum import StrEnum
from typing import Any


class IslandState(StrEnum):
    ONLINE = "ONLINE"
    ISLAND = "ISLAND"
    RECONCILING = "RECONCILING"


Probe = Callable[[], Awaitable[bool]]
Hook = Callable[[], Awaitable[None]]
Listener = Callable[[IslandState, IslandState, dict[str, Any]], Awaitable[None] | None]


async def http_probe(host: str, port: int, timeout: float) -> bool:
    """True if something at host:port answers an HTTP request within `timeout` seconds."""
    writer = None
    try:
        reader, writer = await asyncio.wait_for(asyncio.open_connection(host, port), timeout)
        writer.write(b"POST / HTTP/1.1\r\nHost: probe\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
        await writer.drain()
        line = await asyncio.wait_for(reader.readline(), timeout)
        return line.startswith(b"HTTP/1.")
    except (OSError, TimeoutError):
        return False
    finally:
        if writer is not None:
            writer.close()
            with contextlib.suppress(OSError):
                await writer.wait_closed()


class IslandMonitor:
    def __init__(self, probe: Probe, reconcile: Hook, hysteresis: int = 3, interval_s: float = 2.0) -> None:
        self.probe = probe
        self.reconcile = reconcile
        self.hysteresis = hysteresis
        self.interval_s = interval_s
        self.state = IslandState.RECONCILING
        self.since = time.time()
        self.fails = 0
        self.oks = 0
        self.last_probe_ok: bool | None = None
        self.last_error: str | None = None
        self._listeners: list[Listener] = []
        self._wake = asyncio.Event()
        self._reconciling: asyncio.Task[None] | None = None

    def on_change(self, fn: Listener) -> None:
        self._listeners.append(fn)

    def snapshot(self) -> dict[str, Any]:
        return {
            "state": self.state.value,
            "since": round(self.since, 3),
            "last_probe_ok": self.last_probe_ok,
            "consecutive_fails": self.fails,
            "consecutive_oks": self.oks,
            "reconcile_error": self.last_error,
        }

    def poke(self) -> None:
        """Probe now instead of waiting for the next tick (after a demo cut/restore)."""
        self._wake.set()

    async def _set(self, new: IslandState, why: str) -> None:
        if new == self.state:
            return
        old, self.state, self.since = self.state, new, time.time()
        for fn in self._listeners:
            res = fn(old, new, {"why": why, **self.snapshot()})
            if asyncio.iscoroutine(res):
                await res

    async def step(self) -> None:
        """One probe and the transitions it causes. Public for tests."""
        ok = await self.probe()
        self.last_probe_ok = ok
        if ok:
            self.oks, self.fails = self.oks + 1, 0
        else:
            self.fails, self.oks = self.fails + 1, 0

        if self.state == IslandState.ONLINE and self.fails >= self.hysteresis:
            await self._set(IslandState.ISLAND, f"{self.fails} failed probes")
        elif self.state == IslandState.ISLAND and self.oks >= self.hysteresis:
            await self._set(IslandState.RECONCILING, f"{self.oks} good probes")
        elif self.state == IslandState.RECONCILING:
            if self.fails >= self.hysteresis:
                self._cancel_reconcile()
                await self._set(IslandState.ISLAND, "uplink lost while reconciling")
            elif ok and self._reconciling is None:
                self._reconciling = asyncio.create_task(self._run_reconcile())

    async def _run_reconcile(self) -> None:
        try:
            await self.reconcile()
            self.last_error = None
            if self.state == IslandState.RECONCILING:
                await self._set(IslandState.ONLINE, "reconciled")
        except asyncio.CancelledError:
            raise
        except Exception as e:  # stay in RECONCILING; retried on the next good probe
            self.last_error = type(e).__name__
        finally:
            self._reconciling = None

    def _cancel_reconcile(self) -> None:
        if self._reconciling is not None:
            self._reconciling.cancel()
            self._reconciling = None

    async def run(self) -> None:
        while True:
            await self.step()
            self._wake.clear()
            with contextlib.suppress(TimeoutError):
                await asyncio.wait_for(self._wake.wait(), self.interval_s)
