# Coupure

A battery-powered box that keeps a market's digital money moving when the internet is cut. Phones join its
Wi-Fi and open a wallet in the browser. The box runs a Cashu ecash mint on the local network, so every
payment is checked against it and double-spending is refused with no internet at all. When the uplink
returns, the box settles to Lightning.

> Work in progress for the Dakar Bitcoin Hack 2026. Current state: **G1, vertical slice**. A phone wallet
> (French, English, Wolof draft) tops up over real Lightning, pays a stall, keeps paying with the cable cut,
> and a replayed payment at a second stall is refused and names the stall that was paid first. See `PLAN.md`.

## Run it

Needs Docker (with Compose v2), `make`, `jq` and bash. `make test` also needs `uv` and Node 24.

```bash
make demo        # boot the box and the world, fund Lightning, open channels; then open the wallet on port 8080
make e2e         # the island demo in a real browser: three phones, cut, double-spend refused, restore
make test        # lint, types, unit and property tests (no stack needed)
make partition   # cut the cable: Lightning fails, the mint keeps serving the LAN; restore: it recovers
make clean       # delete all regtest data
```

`make env` (run automatically) writes `.env` with fresh random secrets. Nothing secret is committed.
Demo controls (cut/restore the cable, the test faucet) exist only with `DEMO_MODE=1`.

## What is real and what is simulated

Real: bitcoind (regtest), two LND nodes, the Nutshell mint on Postgres, cashu-ts in the browser, the
network partition (the box reaches the world only through the `uplink` container, which the cut severs).

- **SIMULATED:** `world-faucet`, a wallet "abroad" that pays the box's top-up invoices. The payment itself
  is real Lightning through the cable; only the sender is a stand-in.
- **SIMULATED:** `miner`, one regtest block a minute, standing in for the Bitcoin network's miners.
- **SIMULATED:** the cable. In a market it is a 4G modem or a fibre line; here it is a container.

## Docs
- `docs/VERSIONS.md`: what is pinned and what was verified in source
- `docs/THREAT_MODEL.md`: security decisions and the tests behind them
- `docs/AI_USE.md`: what an AI agent wrote and how it was checked

MIT licensed.
