import asyncio

from coupured.island import IslandMonitor, IslandState, http_probe
from coupured.logs import redact


class Script:
    """A probe that returns the scripted results in order."""

    def __init__(self, results):
        self.results = list(results)

    async def __call__(self):
        return self.results.pop(0)


async def drive(mon, n):
    for _ in range(n):
        await mon.step()
        await asyncio.sleep(0)  # let a reconcile task run


async def test_boot_reconciles_then_online():
    calls = []

    async def reconcile():
        calls.append(1)

    mon = IslandMonitor(Script([True, True]), reconcile, hysteresis=3)
    assert mon.state == IslandState.RECONCILING
    await drive(mon, 2)
    assert calls == [1] and mon.state == IslandState.ONLINE


async def test_hysteresis_both_ways():
    async def reconcile():
        pass

    seen = []
    mon = IslandMonitor(Script([True] + [False, False, True] + [False] * 3 + [True, True, True, True]), reconcile)
    mon.on_change(lambda old, new, info: seen.append(new))
    await drive(mon, 1)
    assert mon.state == IslandState.ONLINE
    await drive(mon, 3)  # two fails then a success: a blip, not an island
    assert mon.state == IslandState.ONLINE
    await drive(mon, 3)
    assert mon.state == IslandState.ISLAND
    await drive(mon, 2)
    assert mon.state == IslandState.ISLAND  # two good probes are not enough
    await drive(mon, 2)
    assert mon.state == IslandState.ONLINE
    assert seen == [IslandState.ONLINE, IslandState.ISLAND, IslandState.RECONCILING, IslandState.ONLINE]


async def test_failed_reconcile_stays_reconciling_and_retries():
    attempts = []

    async def reconcile():
        attempts.append(1)
        if len(attempts) == 1:
            raise RuntimeError("lnd not ready")

    mon = IslandMonitor(Script([True, True, True]), reconcile)
    await drive(mon, 1)
    assert mon.state == IslandState.RECONCILING and mon.last_error == "RuntimeError"
    await drive(mon, 1)
    assert mon.state == IslandState.ONLINE and len(attempts) == 2


async def test_http_probe_up_and_down():
    async def handler(r, w):
        await r.readline()
        w.write(b"HTTP/1.1 401 Unauthorized\r\n\r\n")
        await w.drain()
        w.close()

    srv = await asyncio.start_server(handler, "127.0.0.1", 0)
    port = srv.sockets[0].getsockname()[1]
    assert await http_probe("127.0.0.1", port, 1)
    srv.close()
    await srv.wait_closed()
    assert not await http_probe("127.0.0.1", port, 1)


def test_redaction():
    line = (
        "got cashuBo2FteBtodHRwOi8vbG9jYWxob3N0OjMzMzg and lnbcrt10u1p5xyzxyzxyzxyzxyzxyzxyzxyz "
        "macaroon 0201036c6e6402f801030a10" + "ab" * 40 + " seed abandon abandon abandon abandon abandon "
        "abandon abandon abandon abandon abandon abandon about"
    )
    out = redact(line)
    for secret in ("cashuBo2", "lnbcrt10u1", "0201036c", "abandon abandon"):
        assert secret not in out


async def test_reconcile_waits_for_active_channels(tmp_path, monkeypatch):
    """The box must not claim ONLINE while its Lightning channels are still down."""
    import coupured.app as appmod
    from coupured.config import Settings

    real_sleep = asyncio.sleep
    monkeypatch.setattr(appmod.asyncio, "sleep", lambda *_: real_sleep(0))
    box = appmod.Box(Settings(data_dir=str(tmp_path)))

    class Lnd:
        def __init__(self, actives):
            self.actives = list(actives)

        async def reconnect_channel_peers(self):
            return 1

        async def summary(self):
            a = self.actives.pop(0) if len(self.actives) > 1 else self.actives[0]
            return {"channels": 2, "active": a, "peers": 1}

    box.lnd = Lnd([0])
    try:
        await box.reconcile()
        raise AssertionError("reconcile should not succeed with inactive channels")
    except appmod.ReconcileIncomplete:
        pass
    box.lnd = Lnd([0, 1, 2])
    await box.reconcile()
    assert box.ledger.tail(1)[0].kind == "reconciled"
