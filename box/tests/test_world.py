import httpx
from fastapi.testclient import TestClient

from coupured import world


def test_world_readiness_requires_routes_not_just_active_channels(tmp_path, monkeypatch):
    macaroon = tmp_path / "faucet.macaroon"
    macaroon.write_bytes(b"unit-test-only")
    monkeypatch.setenv("LND_MACAROON", str(macaroon))
    routes = []
    requested = []

    class Lnd:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        async def get(self, path):
            requested.append(path)
            data = {"channels": [{"active": True, "remote_pubkey": "peer"}] * 2}
            if path != "/v1/channels":
                data = {"routes": routes}
            return httpx.Response(200, json=data, request=httpx.Request("GET", "http://unit-test" + path))

    monkeypatch.setattr(world.httpx, "AsyncClient", lambda **kwargs: Lnd())
    with TestClient(world.create_app()) as c:
        assert c.get("/ready").status_code == 503
        routes.append({"total_amt": "1000"})
        assert c.get("/ready").json() == {"ready": True}
    assert "/v1/graph/routes/peer/1000" in requested
