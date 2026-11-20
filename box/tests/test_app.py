from fastapi.testclient import TestClient

from coupured.app import create_app
from coupured.config import Settings


def make(tmp_path, demo=False):
    s = Settings(
        demo_mode=demo, data_dir=str(tmp_path), uplink_host="127.0.0.1", uplink_probe_port=1, operator_pin="48291600"
    )
    return TestClient(create_app(s))


def test_health_and_ledger(tmp_path):
    with make(tmp_path) as c:
        assert c.get("/api/health").json()["ok"] is True
        v = c.get("/api/ledger/verify").json()
        assert v["ok"] and v["length"] >= 1  # boot event


def test_demo_routes_absent_without_demo_mode(tmp_path):
    with make(tmp_path) as c:
        assert c.post("/api/demo/island", json={"action": "cut"}).status_code == 404
        assert c.get("/api/docs").status_code == 404


def test_input_validation(tmp_path):
    with make(tmp_path, demo=True) as c:
        assert c.post("/api/receipts", json={"stall": "b-14 ", "ys": ["02" + "a" * 64]}).status_code == 422
        assert c.post("/api/receipts", json={"stall": "B-14", "ys": ["nothex"]}).status_code == 422
        assert c.post("/api/receipts", json={"stall": "B-14", "ys": ["02" + "a" * 64] * 65}).status_code == 422
        assert c.post("/api/demo/fund", json={"bolt11": "lnbc1mainnetinvoice" + "a" * 30}).status_code == 422
        token = c.post("/api/operator/login", json={"pin": "48291600"}).json()["token"]
        assert (
            c.post(
                "/api/demo/island", json={"action": "explode"}, headers={"Authorization": f"Bearer {token}"}
            ).status_code
            == 422
        )
        big = "x" * 20_000
        assert c.post("/api/receipts", content=big, headers={"content-type": "application/json"}).status_code == 413


def test_lookup_empty(tmp_path):
    with make(tmp_path) as c:
        r = c.post("/api/receipts/lookup", json={"ys": ["02" + "b" * 64]})
        assert r.status_code == 200 and r.json() == {"found": {}}
