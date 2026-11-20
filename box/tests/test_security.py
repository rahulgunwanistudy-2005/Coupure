import json
import time

from fastapi.testclient import TestClient

from coupured.app import create_app
from coupured.config import Settings
from coupured.operator import OperatorAuth
from coupured.transparency import read_liabilities


def test_operator_disabled_by_default():
    auth = OperatorAuth("")
    assert auth.login("123456") is None
    assert not auth.valid("arbitrary token")


def test_sessions_are_random_expire_and_do_not_survive_restart(monkeypatch):
    clock = [100.0]
    monkeypatch.setattr("coupured.operator.time.monotonic", lambda: clock[0])
    auth = OperatorAuth("48291600")
    assert auth.login("48291601") is None
    first, second = auth.login("48291600"), auth.login("48291600")
    assert first != second and auth.valid(first)
    assert not OperatorAuth("48291600").valid(first)
    clock[0] = 1000.1
    assert not auth.valid(first)


def test_demo_controls_need_operator_even_in_demo_mode(tmp_path):
    app = create_app(Settings(data_dir=str(tmp_path), demo_mode=True, operator_pin="48291600"))
    with TestClient(app) as client:
        assert client.post("/api/demo/island", json={"action": "cut"}).status_code == 401
        for _ in range(5):
            assert client.post("/api/operator/login", json={"pin": "00000000"}).status_code == 401
        # Spoofing XFF cannot evade login throttling.
        assert (
            client.post(
                "/api/operator/login", json={"pin": "48291600"}, headers={"X-Forwarded-For": "203.0.113.1"}
            ).status_code
            == 429
        )


def test_chunked_body_limit_and_malformed_length(tmp_path):
    with TestClient(create_app(Settings(data_dir=str(tmp_path)))) as client:
        result = client.post("/api/receipts/lookup", content=iter([b"x" * 9000, b"y" * 9000]))
        assert result.status_code == 413
        assert client.post("/api/receipts", content=b"{}", headers={"content-length": "oops"}).status_code == 400
        assert client.get("/api/health").headers["cache-control"] == "no-store"


def test_liabilities_snapshot_rejects_missing_stale_and_invalid_data(tmp_path):
    assert not read_liabilities(str(tmp_path))["available"]
    path = tmp_path / "liabilities.json"
    for value in (
        {"ts": time.time() - 60, "outstanding_sat": 100},
        {"ts": time.time(), "outstanding_sat": -1},
        {"ts": time.time() + 60, "outstanding_sat": 100},
        {"ts": time.time(), "outstanding_sat": "100"},
    ):
        path.write_text(json.dumps(value))
        assert not read_liabilities(str(tmp_path))["available"]
    path.write_text(json.dumps({"ts": time.time(), "outstanding_sat": 42, "keysets": []}))
    assert read_liabilities(str(tmp_path))["outstanding_sat"] == 42


def test_tableau_never_turns_missing_data_into_zero(tmp_path, monkeypatch):
    app = create_app(Settings(data_dir=str(tmp_path), snapshots_dir=str(tmp_path)))

    async def unavailable(*args):
        import httpx

        raise httpx.ConnectError("offline")

    monkeypatch.setattr(app.state.box.lnd, "summary", unavailable)
    monkeypatch.setattr(app.state.box.settlement, "call", unavailable)
    with TestClient(app) as c:
        data = c.get("/api/tableau").json()
        assert data["reserves"] is None and data["queue"] is None
        assert data["liabilities"]["outstanding_sat"] is None and data["coverage_ratio"] is None
