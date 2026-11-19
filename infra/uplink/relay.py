"""Coupure uplink: the box's only path to the outside world.

This container sits on both the `box` network (internal, no default route) and the `wan` network.
Box services reach the world only through the TCP relays declared in ROUTES. Cutting the uplink:

  1. stops accepting new relayed connections,
  2. aborts every relayed connection in flight (RST on both sides, like a router losing its link),
  3. installs an nftables drop rule on the relay ports (defence in depth, best effort).

The control API (cut / restore) is only served when DEMO_MODE=1 and needs a bearer token.
Stdlib only, so the image stays small and auditable.
"""

from __future__ import annotations

import asyncio
import hmac
import json
import logging
import os
import subprocess
import sys
import time

logging.basicConfig(
    level=logging.INFO,
    format='{"ts":"%(asctime)s","lvl":"%(levelname)s","msg":%(message)s}',
    stream=sys.stdout,
)
log = logging.getLogger("uplink")


def jlog(msg: str, **kw: object) -> None:
    log.info(json.dumps({"event": msg, **kw}))


def parse_routes(spec: str) -> dict[int, tuple[str, int]]:
    """"18443=bitcoind:18443,9735=lnd-world:9735" -> {18443: ("bitcoind", 18443), ...}"""
    routes: dict[int, tuple[str, int]] = {}
    for item in filter(None, (s.strip() for s in spec.split(","))):
        listen, target = item.split("=", 1)
        host, port = target.rsplit(":", 1)
        routes[int(listen)] = (host, int(port))
    return routes


class Uplink:
    def __init__(self, routes: dict[int, tuple[str, int]]) -> None:
        self.routes = routes
        self.linked = os.environ.get("UPLINK_START_LINKED", "1") == "1"
        self.flows: set[asyncio.StreamWriter] = set()
        self.changed_at = time.time()
        self.last_toggle = 0.0

    # ---- relaying -------------------------------------------------------------------------
    async def handle(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter, port: int) -> None:
        if not self.linked:
            self._abort(writer)
            return
        host, tport = self.routes[port]
        try:
            up_reader, up_writer = await asyncio.wait_for(asyncio.open_connection(host, tport), 5)
        except (OSError, asyncio.TimeoutError):
            self._abort(writer)
            return
        if not self.linked:  # cut while we were dialling
            self._abort(writer)
            self._abort(up_writer)
            return
        self.flows.update((writer, up_writer))
        try:
            await asyncio.gather(self._pipe(reader, up_writer), self._pipe(up_reader, writer))
        finally:
            for w in (writer, up_writer):
                self.flows.discard(w)
                if not w.is_closing():
                    w.close()

    @staticmethod
    async def _pipe(src: asyncio.StreamReader, dst: asyncio.StreamWriter) -> None:
        try:
            while data := await src.read(65536):
                dst.write(data)
                await dst.drain()
        except (OSError, asyncio.IncompleteReadError):
            pass
        finally:
            if dst.can_write_eof() and not dst.is_closing():
                try:
                    dst.write_eof()
                except OSError:
                    pass

    @staticmethod
    def _abort(w: asyncio.StreamWriter) -> None:
        transport = w.transport
        if transport is not None and not transport.is_closing():
            transport.abort()  # SO_LINGER 0 semantics: peer sees a reset, not a polite close

    # ---- the switch -----------------------------------------------------------------------
    def cut(self) -> None:
        self.linked = False
        self.changed_at = time.time()
        n = len(self.flows)
        for w in list(self.flows):
            self._abort(w)
        self.flows.clear()
        nft_ok = self._nft(drop=True)
        jlog("uplink_cut", flows_aborted=n, nft=nft_ok)

    def restore(self) -> None:
        nft_ok = self._nft(drop=False)
        self.linked = True
        self.changed_at = time.time()
        jlog("uplink_restored", nft=nft_ok)

    def _nft(self, drop: bool) -> bool:
        ports = ", ".join(str(p) for p in self.routes)
        if drop:
            script = (
                "table inet coupure_uplink {\n"
                " chain input { type filter hook input priority -10; policy accept;\n"
                f"  iifname != \"lo\" tcp dport {{ {ports} }} reject with icmpx type host-unreachable\n"
                " }\n"
                "}\n"
            )
        else:
            script = "delete table inet coupure_uplink\n"
        try:
            r = subprocess.run(["nft", "-f", "-"], input=script.encode(), capture_output=True, timeout=5)
            return r.returncode == 0 or (not drop and b"No such file" in r.stderr)
        except (OSError, subprocess.TimeoutExpired):
            return False

    def state(self) -> dict[str, object]:
        return {
            "linked": self.linked,
            "changed_at": self.changed_at,
            "flows": len(self.flows),
            "routes": {str(k): f"{h}:{p}" for k, (h, p) in self.routes.items()},
        }


# ---- control API (tiny HTTP/1.1, DEMO_MODE only) --------------------------------------------
MAX_REQ = 4096
MIN_TOGGLE_INTERVAL_S = 2.0


async def control(uplink: Uplink, token: str, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    status, body = 400, {"error": "bad_request"}
    try:
        head = await asyncio.wait_for(reader.readuntil(b"\r\n\r\n"), 5)
        if len(head) > MAX_REQ:
            raise ValueError("too large")
        lines = head.decode("latin-1").split("\r\n")
        method, path, _ = lines[0].split(" ", 2)
        headers = {k.strip().lower(): v.strip() for k, v in (ln.split(":", 1) for ln in lines[1:] if ":" in ln)}
        if method == "GET" and path == "/state":
            status, body = 200, uplink.state()
        elif method == "POST" and path in ("/cut", "/restore"):
            given = headers.get("authorization", "").removeprefix("Bearer ").strip()
            if not token or not hmac.compare_digest(given.encode(), token.encode()):
                status, body = 401, {"error": "unauthorized"}
            elif time.time() - uplink.last_toggle < MIN_TOGGLE_INTERVAL_S:
                status, body = 429, {"error": "too_many_toggles"}
            else:
                uplink.last_toggle = time.time()
                uplink.cut() if path == "/cut" else uplink.restore()
                status, body = 200, uplink.state()
        else:
            status, body = 404, {"error": "not_found"}
    except (ValueError, asyncio.TimeoutError, asyncio.IncompleteReadError, asyncio.LimitOverrunError):
        pass
    payload = json.dumps(body).encode()
    reason = {200: "OK", 400: "Bad Request", 401: "Unauthorized", 404: "Not Found", 429: "Too Many Requests"}[status]
    writer.write(
        f"HTTP/1.1 {status} {reason}\r\nContent-Type: application/json\r\n"
        f"Content-Length: {len(payload)}\r\nConnection: close\r\n\r\n".encode()
        + payload
    )
    try:
        await writer.drain()
    finally:
        writer.close()


async def main() -> None:
    routes = parse_routes(os.environ["UPLINK_ROUTES"])
    uplink = Uplink(routes)
    if not uplink.linked:
        uplink._nft(drop=True)
    for port in routes:
        await asyncio.start_server(lambda r, w, p=port: uplink.handle(r, w, p), "0.0.0.0", port)
    jlog("uplink_up", routes=uplink.state()["routes"], linked=uplink.linked)

    if os.environ.get("DEMO_MODE") == "1":
        token = os.environ.get("UPLINK_TOKEN", "")
        if len(token) < 24:
            jlog("control_disabled", reason="UPLINK_TOKEN missing or shorter than 24 chars")
        else:
            cport = int(os.environ.get("UPLINK_CONTROL_PORT", "8099"))
            await asyncio.start_server(lambda r, w: control(uplink, token, r, w), "0.0.0.0", cport)
            jlog("control_up", port=cport)
    await asyncio.Event().wait()


if __name__ == "__main__":
    asyncio.run(main())
