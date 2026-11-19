"""SIMULATED sender for the demo: "the world" (a diaspora relative, an exchange) paying the box.

Runs on the WAN side next to lnd-world and is reachable from the box only through the cable. It pays a
regtest bolt11 invoice with real Lightning via lnd-world's REST API, using a macaroon baked with
offchain:read + offchain:write only. Amounts are capped. Not part of the box.

LND REST paths (verified at v0.21.8-beta): GET /v1/payreq/{pay_req}, POST /v2/router/send (streams JSON
lines; SendPaymentSync no longer exists in 0.21).
"""

from __future__ import annotations

import json
import os
from typing import Annotated, Any

import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, StringConstraints

from . import logs

MAX_SAT = int(os.environ.get("FAUCET_MAX_SAT", "200000"))
Bolt11 = Annotated[str, StringConstraints(pattern=r"^lnbcrt[0-9a-z]{20,1800}$")]


class PayIn(BaseModel):
    bolt11: Bolt11


class InvoiceIn(BaseModel):
    amount_sat: int = Field(ge=1, le=200000)


def create_app() -> FastAPI:
    logs.setup()
    app = FastAPI(title="world-faucet (SIMULATED sender)", docs_url=None, redoc_url=None, openapi_url=None)
    rest = os.environ.get("LND_REST", "https://lnd-world:8080").rstrip("/")
    cert = os.environ.get("LND_CERT", "/lnd/tls.cert")
    mac_path = os.environ.get("LND_MACAROON", "/lnd/faucet.macaroon")

    def client() -> httpx.AsyncClient:
        if not os.path.exists(mac_path):
            raise HTTPException(503, "faucet not bootstrapped yet")
        with open(mac_path, "rb") as f:
            mac = f.read().hex()
        return httpx.AsyncClient(base_url=rest, verify=cert, timeout=40.0, headers={"Grpc-Metadata-macaroon": mac})

    @app.get("/health")
    async def health() -> dict[str, bool]:
        return {"ok": os.path.exists(mac_path)}

    @app.get("/price")
    async def price() -> dict[str, Any]:
        # External fetching is deliberately WAN-side: the box can only reach it through the cable.
        async with httpx.AsyncClient(timeout=5) as c:
            r = await c.get("https://mempool.space/api/v1/prices")
            r.raise_for_status()
            return {"EUR": r.json()["EUR"]}

    @app.get("/ready")
    async def ready() -> dict[str, bool]:
        """Channel active flags can precede graph propagation; require an actual payable route."""
        async with client() as c:
            channels = await c.get("/v1/channels")
            channels.raise_for_status()
            active = [ch for ch in channels.json().get("channels", []) if ch.get("active")]
            if len(active) < 2:
                raise HTTPException(503, "channels not ready")
            pubkey = active[0]["remote_pubkey"]
            routes = await c.get(f"/v1/graph/routes/{pubkey}/1000")
            if routes.status_code != 200 or not routes.json().get("routes"):
                raise HTTPException(503, "routing graph not ready")
        return {"ready": True}

    @app.post("/pay")
    async def pay(body: PayIn) -> dict[str, Any]:
        async with client() as c:
            d = await c.get(f"/v1/payreq/{body.bolt11}")
            if d.status_code != 200:
                raise HTTPException(400, "facture illisible")
            amount = int(d.json().get("num_satoshis", 0))
            if not 0 < amount <= MAX_SAT:
                raise HTTPException(400, f"montant hors limites (1–{MAX_SAT} sat)")
            final: dict[str, Any] = {}
            async with c.stream(
                "POST",
                "/v2/router/send",
                json={"payment_request": body.bolt11, "timeout_seconds": 30, "fee_limit_sat": 1000},
            ) as r:
                async for line in r.aiter_lines():
                    if not line.strip():
                        continue
                    msg = json.loads(line)
                    if "error" in msg:
                        raise HTTPException(502, "paiement Lightning échoué")
                    final = msg.get("result", {})
                    if final.get("status") in ("SUCCEEDED", "FAILED"):
                        break
        if final.get("status") != "SUCCEEDED":
            raise HTTPException(502, f"paiement Lightning échoué ({final.get('failure_reason', 'inconnu')})")
        return {"status": "SUCCEEDED", "amount_sat": amount}

    @app.post("/invoice")
    async def invoice(body: InvoiceIn) -> dict[str, Any]:
        """SIMULATED receiving wallet: real LND invoice for the queue's regtest cash-out."""
        async with client() as c:
            r = await c.post("/v1/invoices", json={"value": str(body.amount_sat), "expiry": "86400"})
            r.raise_for_status()
            return {"payment_request": r.json()["payment_request"]}

    return app
