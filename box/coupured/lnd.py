"""Minimal LND REST client for the box node, using a baked macaroon with
info:read peers:read peers:write offchain:read only (scripts/bootstrap.sh). Paths verified against
lnrpc/lightning.yaml at v0.21.8-beta (docs/VERSIONS.md)."""

from __future__ import annotations

import logging
import os
from typing import Any

import httpx

log = logging.getLogger("coupured.lnd")


class LndBox:
    def __init__(self, rest: str, cert: str, macaroon_path: str, peer_host: str) -> None:
        self.rest = rest.rstrip("/")
        self.cert = cert
        self.macaroon_path = macaroon_path
        self.peer_host = peer_host  # how the box reaches the world's node: through the cable
        self._client: httpx.AsyncClient | None = None

    def _get_client(self) -> httpx.AsyncClient | None:
        if self._client is None:
            if not (os.path.exists(self.macaroon_path) and os.path.exists(self.cert)):
                return None  # bootstrap has not baked our macaroon yet
            with open(self.macaroon_path, "rb") as f:
                mac = f.read().hex()
            self._client = httpx.AsyncClient(
                base_url=self.rest, verify=self.cert, timeout=5.0, headers={"Grpc-Metadata-macaroon": mac}
            )
        return self._client

    async def _get(self, path: str) -> dict[str, Any]:
        c = self._get_client()
        if c is None:
            raise RuntimeError("lnd macaroon not available")
        r = await c.get(path)
        r.raise_for_status()
        return r.json()

    async def channels(self) -> list[dict[str, Any]]:
        return (await self._get("/v1/channels")).get("channels", [])

    async def peers(self) -> list[dict[str, Any]]:
        return (await self._get("/v1/peers")).get("peers", [])

    async def summary(self) -> dict[str, Any]:
        chans = await self.channels()
        return {
            "channels": len(chans),
            "active": sum(1 for c in chans if c.get("active")),
            "local_sat": sum(int(c.get("local_balance", 0)) for c in chans),
            "remote_sat": sum(int(c.get("remote_balance", 0)) for c in chans),
            "peers": len(await self.peers()),
        }

    async def reconnect_channel_peers(self) -> int:
        """Connect to every channel peer we are not connected to, through the uplink. Returns count."""
        c = self._get_client()
        if c is None:
            raise RuntimeError("lnd macaroon not available")
        connected = {p["pub_key"] for p in await self.peers()}
        wanted = {ch["remote_pubkey"] for ch in await self.channels()} - connected
        n = 0
        for pk in wanted:
            r = await c.post("/v1/peers", json={"addr": {"pubkey": pk, "host": self.peer_host}, "perm": False})
            if r.status_code == 200 or "already connected" in r.text:
                n += 1
            else:
                log.warning("connect peer %s…: %s %s", pk[:8], r.status_code, r.text[:200])
        return n
