from __future__ import annotations

import os
from dataclasses import dataclass, field


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default)


@dataclass(frozen=True)
class Settings:
    demo_mode: bool = field(default_factory=lambda: _env("DEMO_MODE") == "1")
    data_dir: str = field(default_factory=lambda: _env("COUPURED_DATA", "/data"))
    # the cable
    uplink_host: str = field(default_factory=lambda: _env("UPLINK_HOST", "uplink"))
    uplink_probe_port: int = field(default_factory=lambda: int(_env("UPLINK_PROBE_PORT", "18443")))
    uplink_control_port: int = field(default_factory=lambda: int(_env("UPLINK_CONTROL_PORT", "8099")))
    uplink_token: str = field(default_factory=lambda: _env("UPLINK_TOKEN"))
    world_faucet_port: int = field(default_factory=lambda: int(_env("WORLD_FAUCET_PORT", "8090")))
    world_peer_port: int = field(default_factory=lambda: int(_env("WORLD_PEER_PORT", "9735")))
    # the box's Lightning node (scoped macaroon: info/peers/offchain read + peers write)
    lnd_rest: str = field(default_factory=lambda: _env("LND_REST", "https://lnd-box:8080"))
    lnd_cert: str = field(default_factory=lambda: _env("LND_CERT", "/lnd/tls.cert"))
    lnd_macaroon: str = field(default_factory=lambda: _env("LND_MACAROON", "/lnd/coupured.macaroon"))
    # the local mint
    mint_url: str = field(default_factory=lambda: _env("MINT_URL", "http://nutshell:3338"))
    settlement_url: str = field(default_factory=lambda: _env("SETTLEMENT_URL", "http://settlement:8000"))
    queue_token: str = field(default_factory=lambda: _env("QUEUE_TOKEN"))
    operator_pin: str = field(default_factory=lambda: _env("OPERATOR_PIN"))
    snapshots_dir: str = field(default_factory=lambda: _env("SNAPSHOTS_DIR", "/snapshots"))
    # island detection
    probe_interval_s: float = field(default_factory=lambda: float(_env("PROBE_INTERVAL_S", "2")))
    probe_timeout_s: float = field(default_factory=lambda: float(_env("PROBE_TIMEOUT_S", "2")))
    hysteresis: int = field(default_factory=lambda: int(_env("ISLAND_HYSTERESIS", "3")))
