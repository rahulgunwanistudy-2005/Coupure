"""coupured: the box daemon. Served behind Caddy at /api/*."""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import os
import re
import time
from collections import defaultdict, deque
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated, Any, Literal

import httpx
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field, StringConstraints

from . import logs
from .config import Settings
from .island import IslandMonitor, IslandState, http_probe
from .ledger import Ledger
from .lnd import LndBox
from .operator import OperatorAuth
from .price import PriceSnapshot
from .receipts import Receipts
from .settlement import Settlement
from .transparency import read_liabilities

log = logging.getLogger("coupured")

HexY = Annotated[str, StringConstraints(pattern=r"^0[23][0-9a-f]{64}$")]
StallId = Annotated[str, StringConstraints(pattern=r"^[A-Z0-9][A-Z0-9-]{0,11}$")]
Bolt11 = Annotated[str, StringConstraints(pattern=r"^lnbcrt[0-9a-z]{20,1800}$")]


class ReceiptIn(BaseModel):
    stall: StallId
    ys: list[HexY] = Field(min_length=1, max_length=64)


class LookupIn(BaseModel):
    ys: list[HexY] = Field(min_length=1, max_length=64)


class IslandAction(BaseModel):
    action: Literal["cut", "restore"]


class FundIn(BaseModel):
    bolt11: Bolt11


class LoginIn(BaseModel):
    pin: str = Field(pattern=r"^\d{6,12}$")


class CashOutIntent(BaseModel):
    id: str = Field(pattern=r"^[0-9a-f]{32}$")
    amount: str = Field(pattern=r"^[1-9][0-9]{0,6}$")
    destination: str = Field(pattern=r"^(lnbcrt[0-9a-z]{20,1800}|demo:world)$")
    created_at: int = Field(ge=0)
    pubkey: str = Field(pattern=r"^[0-9a-f]{64}$")
    signature: str = Field(pattern=r"^[0-9a-f]{128}$")


class CashOutIn(BaseModel):
    intent: CashOutIntent
    token: str = Field(min_length=10, max_length=12000, pattern=r"^cashu[AB]")


class ChangeIn(BaseModel):
    id: str = Field(pattern=r"^[0-9a-f]{32}$")
    pubkey: str = Field(pattern=r"^[0-9a-f]{64}$")
    signature: str = Field(pattern=r"^[0-9a-f]{128}$")


class RateLimiter:
    """Sliding window per (client, bucket). In memory: it is one box."""

    def __init__(self) -> None:
        self.hits: dict[tuple[str, str], deque[float]] = defaultdict(deque)

    def check(self, client: str, bucket: str, limit: int, window_s: float) -> None:
        q, now = self.hits[(client, bucket)], time.monotonic()
        while q and now - q[0] > window_s:
            q.popleft()
        if len(q) >= limit:
            raise HTTPException(429, "trop de requêtes, réessayez dans un instant")
        q.append(now)


class Hub:
    """Fan-out of island state changes to SSE listeners."""

    def __init__(self) -> None:
        self.queues: set[asyncio.Queue[dict[str, Any]]] = set()

    def publish(self, msg: dict[str, Any]) -> None:
        for q in list(self.queues):
            with contextlib.suppress(asyncio.QueueFull):
                q.put_nowait(msg)


class ReconcileIncomplete(RuntimeError):
    """Lightning is not back yet; try again on the next good probe."""


class Box:
    def __init__(self, s: Settings) -> None:
        self.s = s
        os.makedirs(s.data_dir, exist_ok=True)
        self.ledger = Ledger(os.path.join(s.data_dir, "ledger.sqlite"))
        self.receipts = Receipts(os.path.join(s.data_dir, "receipts.sqlite"), s.mint_url)
        self.lnd = LndBox(s.lnd_rest, s.lnd_cert, s.lnd_macaroon, f"{s.uplink_host}:{s.world_peer_port}")
        self.hub = Hub()
        self.limiter = RateLimiter()
        self.auth = OperatorAuth(s.operator_pin)
        self.settlement = Settlement(s.settlement_url, s.queue_token)
        self.started_at = time.time()
        self.price = PriceSnapshot(
            os.path.join(s.data_dir, "price.json"), f"http://{s.uplink_host}:{s.world_faucet_port}"
        )
        self.monitor = IslandMonitor(
            probe=lambda: http_probe(s.uplink_host, s.uplink_probe_port, s.probe_timeout_s),
            reconcile=self.reconcile,
            hysteresis=s.hysteresis,
            interval_s=s.probe_interval_s,
        )
        self.monitor.on_change(self._on_island_change)

    async def reconcile(self) -> None:
        """Runs when the cable comes back. G1: bring the Lightning peer back. G2 adds the cash-out queue."""
        n = await self.lnd.reconnect_channel_peers()
        summ: dict[str, Any] = {}
        for _ in range(30):  # channels need a moment to re-establish after the peer reconnects
            summ = await self.lnd.summary()
            if summ["channels"] == 0 or summ["active"] == summ["channels"]:
                break
            await asyncio.sleep(1)
        else:
            # Not ONLINE until Lightning really is: the monitor stays RECONCILING and retries on the next probe.
            raise ReconcileIncomplete(f"{summ.get('active', 0)}/{summ.get('channels', 0)} channels active")
        self.ledger.append("reconciled", {"peers_reconnected": n})

    async def settle_loop(self) -> None:
        while True:
            if self.monitor.state == IslandState.ONLINE:
                if time.time() - self.price.value.get("ts", 0) > 300:
                    try:
                        await self.price.refresh()
                    except (httpx.HTTPError, ValueError, KeyError):
                        pass
                try:
                    summary = await self.settlement.call("/drain", {})
                    count = summary.get("settled", 0)
                    if count != getattr(self, "_settled", 0):
                        self.ledger.append("cashouts_settled", {"count": count})
                        self._settled = count
                        self.hub.publish(self.island_view())
                except httpx.HTTPError:
                    pass  # worker or uplink unavailable: durable queue retries on the next tick
            await asyncio.sleep(5)

    async def _on_island_change(self, old: IslandState, new: IslandState, info: dict[str, Any]) -> None:
        e = self.ledger.append("island", {"from": old.value, "to": new.value, "why": info["why"]})
        log.info(json.dumps({"event": "island", "from": old.value, "to": new.value, "seq": e.seq}))
        self.hub.publish(self.island_view())

    def island_view(self) -> dict[str, Any]:
        head = self.ledger.head()
        return {**self.monitor.snapshot(), "ledger_head": head.hash if head else None, "ts": time.time()}

    async def uplink_control(self, action: str) -> dict[str, Any]:
        url = f"http://{self.s.uplink_host}:{self.s.uplink_control_port}/{action}"
        async with httpx.AsyncClient(timeout=5.0) as c:
            r = await c.post(url, headers={"Authorization": f"Bearer {self.s.uplink_token}"})
        if r.status_code == 429:
            raise HTTPException(429, "un instant entre deux bascules")
        r.raise_for_status()
        return r.json()


def get_box(request: Request) -> Box:
    return request.app.state.box


BoxDep = Annotated[Box, Depends(get_box)]


def client_ip(req: Request) -> str:
    # Uvicorn alone processes forwarded headers from the configured Caddy IP. Never trust raw XFF.
    return req.client.host if req.client else "?"


def create_app(settings: Settings | None = None) -> FastAPI:
    s = settings or Settings()
    logs.setup()
    box = Box(s)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        box.ledger.append("boot", {"demo_mode": s.demo_mode})
        task = asyncio.create_task(box.monitor.run())
        settlement_task = asyncio.create_task(box.settle_loop())
        try:
            yield
        finally:
            for t in (task, settlement_task):
                t.cancel()
            box.monitor._cancel_reconcile()
            await asyncio.gather(task, settlement_task, return_exceptions=True)

    app = FastAPI(
        title="coupured",
        lifespan=lifespan,
        docs_url="/api/docs" if s.demo_mode else None,
        redoc_url=None,
        openapi_url="/api/openapi.json" if s.demo_mode else None,
    )
    app.state.box = box

    @app.middleware("http")
    async def limit_body(request: Request, call_next):  # type: ignore[no-untyped-def]
        try:
            length = int(request.headers.get("content-length") or 0)
        except ValueError:
            return JSONResponse({"detail": "invalid content length"}, status_code=400)
        if length < 0:
            return JSONResponse({"detail": "invalid content length"}, status_code=400)
        if length > 16_384:
            return JSONResponse({"detail": "requête trop grande"}, status_code=413)
        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > 16_384:
                return JSONResponse({"detail": "requête trop grande"}, status_code=413)
        request._body = bytes(body)
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.get("/api/health")
    async def health(b: BoxDep) -> dict[str, Any]:
        return {
            "ok": True,
            "island": b.monitor.state.value,
            "demo_mode": s.demo_mode,
            "uptime_s": round(time.time() - b.started_at),
            "network": "regtest",
        }

    @app.post("/api/operator/login")
    async def operator_login(body: LoginIn, b: BoxDep, request: Request) -> dict[str, str]:
        b.limiter.check(client_ip(request), "operator_login", 5, 300)
        token = b.auth.login(body.pin)
        if not token:
            raise HTTPException(401, "code incorrect ou accès opérateur non configuré")
        return {"token": token}

    def operator_only(request: Request) -> None:
        token = request.headers.get("authorization", "").removeprefix("Bearer ")
        if not box.auth.valid(token):
            raise HTTPException(401, "accès opérateur requis")

    @app.get("/api/tableau")
    async def tableau(b: BoxDep) -> dict[str, Any]:
        liabilities = read_liabilities(s.snapshots_dir)
        reserves = None
        queue = None
        try:
            reserves = await asyncio.wait_for(b.lnd.summary(), 3)
        except (httpx.HTTPError, OSError, RuntimeError, TimeoutError):
            pass
        try:
            queue = await b.settlement.call("/summary")
        except httpx.HTTPError:
            pass
        outstanding = liabilities["outstanding_sat"]
        ratio = None
        if outstanding and reserves is not None:
            ratio = round(reserves["local_sat"] / outstanding, 4)
        return {
            "island": b.island_view(),
            "liabilities": liabilities,
            "reserves": reserves,
            "queue": queue,
            "coverage_ratio": ratio,
            "coverage_basis": "lightning_channels_only",
            "ledger": b.ledger.verify(),
            "network": "regtest",
            "custodial": True,
        }

    @app.get("/api/price")
    async def price(b: BoxDep) -> dict[str, Any]:
        return b.price.snapshot(b.monitor.state == IslandState.ONLINE)

    @app.post("/api/cashouts")
    async def cashout(body: CashOutIn, b: BoxDep, request: Request) -> dict[str, Any]:
        b.limiter.check(client_ip(request), "cashout", 20, 60)
        if not 10 <= int(body.intent.amount) <= 2_000_000:
            raise HTTPException(422, "montant hors limites")
        if body.intent.destination == "demo:world" and not s.demo_mode:
            raise HTTPException(422, "destination de démo indisponible")
        try:
            result = await b.settlement.call(
                "/enqueue",
                {
                    "intent": body.intent.model_dump(),
                    "token": body.token,
                    "publicMint": str(request.base_url).rstrip("/") + "/mint",
                },
            )
        except httpx.HTTPError as e:
            raise HTTPException(409, "retrait non confirmé, réessayez la même demande") from e
        # No destination, token, signing key, or invoice in the public ledger.
        b.ledger.append("cashout_queued", {"id": body.intent.id, "amount_sat": int(body.intent.amount)})
        return result

    @app.get("/api/cashouts/{job_id}")
    async def cashout_status(job_id: str, pubkey: str, b: BoxDep, request: Request) -> dict[str, Any]:
        b.limiter.check(client_ip(request), "cashout_status", 60, 60)
        if not re.fullmatch(r"[0-9a-f]{32}", job_id) or not re.fullmatch(r"[0-9a-f]{64}", pubkey):
            raise HTTPException(422, "identifiant invalide")
        try:
            return await b.settlement.call("/lookup", {"id": job_id, "pubkey": pubkey})
        except httpx.HTTPError as e:
            raise HTTPException(404, "retrait introuvable") from e

    @app.post("/api/cashouts/change")
    async def cashout_change(body: ChangeIn, b: BoxDep, request: Request) -> dict[str, Any]:
        b.limiter.check(client_ip(request), "cashout_change", 20, 60)
        try:
            return await b.settlement.call(
                "/change", {**body.model_dump(), "publicMint": str(request.base_url).rstrip("/") + "/mint"}
            )
        except httpx.HTTPError as e:
            raise HTTPException(409, "monnaie indisponible, réessayez") from e

    @app.get("/api/island")
    async def island(b: BoxDep) -> dict[str, Any]:
        view = b.island_view()
        try:
            view["lightning"] = await asyncio.wait_for(b.lnd.summary(), 3)
        except Exception:
            view["lightning"] = None
        return view

    @app.get("/api/island/stream")
    async def island_stream(b: BoxDep, request: Request) -> StreamingResponse:
        q: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=16)
        b.hub.queues.add(q)

        async def gen() -> AsyncIterator[bytes]:
            try:
                yield f"retry: 2000\ndata: {json.dumps(b.island_view())}\n\n".encode()
                while not await request.is_disconnected():
                    try:
                        msg = await asyncio.wait_for(q.get(), 15)
                        yield f"data: {json.dumps(msg)}\n\n".encode()
                    except TimeoutError:
                        yield b": keepalive\n\n"
            finally:
                b.hub.queues.discard(q)

        return StreamingResponse(
            gen(), media_type="text/event-stream", headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"}
        )

    @app.get("/api/ledger")
    async def ledger_tail(b: BoxDep, n: int = 50) -> list[dict[str, Any]]:
        return [e.as_dict() for e in b.ledger.tail(max(1, min(n, 500)))]

    @app.get("/api/ledger/verify")
    async def ledger_verify(b: BoxDep) -> dict[str, Any]:
        return b.ledger.verify()

    @app.post("/api/receipts")
    async def receipt(body: ReceiptIn, b: BoxDep, request: Request) -> dict[str, Any]:
        b.limiter.check(client_ip(request), "receipt", 60, 60)
        spent = None
        for attempt in range(3):
            try:
                spent = await b.receipts.all_spent(body.ys)
                break
            except httpx.HTTPError as e:
                log.warning(
                    json.dumps({"event": "receipt_checkstate_failed", "attempt": attempt, "err": type(e).__name__})
                )
                await asyncio.sleep(0.3 * (attempt + 1))
        if spent is None:
            raise HTTPException(503, "boîte momentanément indisponible")
        if not spent:
            raise HTTPException(409, "ces pièces ne sont pas encore encaissées")
        new = b.receipts.register(body.stall, body.ys)
        if new:
            b.ledger.append("receipt", {"stall": body.stall, "proofs": new})
        return {"registered": new}

    @app.post("/api/receipts/lookup")
    async def receipt_lookup(body: LookupIn, b: BoxDep, request: Request) -> dict[str, Any]:
        b.limiter.check(client_ip(request), "lookup", 60, 60)
        return {"found": b.receipts.lookup(body.ys)}

    # ------------------------------------------------------------------ demo controls (DEMO_MODE=1 only)
    def demo_only() -> None:
        if not s.demo_mode:
            raise HTTPException(404, "not found")

    @app.post("/api/demo/island", dependencies=[Depends(demo_only), Depends(operator_only)])
    async def demo_island(body: IslandAction, b: BoxDep, request: Request) -> dict[str, Any]:
        b.limiter.check(client_ip(request), "demo_island", 10, 60)
        state = await b.uplink_control(body.action)
        b.ledger.append("demo_cable", {"action": body.action})
        b.monitor.poke()
        return {"uplink": {"linked": state.get("linked")}, "island": b.island_view()}

    @app.post("/api/demo/fund", dependencies=[Depends(demo_only)])
    async def demo_fund(body: FundIn, b: BoxDep, request: Request) -> dict[str, Any]:
        """SIMULATED sender: a wallet in "the world" pays the box's invoice over real Lightning,
        through the cable. With the cable cut this fails, as it would in a real shutdown."""
        b.limiter.check(client_ip(request), "demo_fund", 10, 60)
        url = f"http://{s.uplink_host}:{s.world_faucet_port}/pay"
        try:
            async with httpx.AsyncClient(timeout=45.0) as c:
                r = await c.post(url, json={"bolt11": body.bolt11})
        except httpx.HTTPError as e:
            raise HTTPException(503, "internet coupé : impossible de recevoir de l'étranger") from e
        if r.status_code != 200:
            raise HTTPException(502, r.json().get("detail", "paiement refusé"))
        b.ledger.append("demo_fund", {"amount_sat": r.json().get("amount_sat")})
        return r.json()

    return app
