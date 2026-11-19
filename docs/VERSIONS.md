# Pinned versions and verified APIs

Every entry was checked against the release page, the package registry, or the source at the pinned tag on
2026-11-19. Where docs and code disagreed, the code won and the disagreement is noted.

## Containers

| Component | Pin | Digest (linux/arm64 pull, 2026-11-19) | Why this version |
|---|---|---|---|
| Bitcoin Core | `bitcoin/bitcoin:32.1` | `sha256:d2454aaf2ff4…50bbe0` | Latest release (2026-10-28). Image entrypoint runs bitcoind via `gosu bitcoin`. |
| LND | `lightninglabs/lnd:v0.21.8-beta` | `sha256:f17b2944b1b7…935f9` | Latest 0.21.x (2026-11-11). Alpine base; `jq` and busybox `nc`/`timeout` available. |
| Nutshell (mint) | `cashubtc/nutshell:0.22.1` | `sha256:05b536e0e3d6…b450e` | Latest (2026-11-03). PyPI's `cashu` is still at 0.21.0; the image is the source of truth. |
| Postgres | `postgres:17-alpine` | `sha256:cdef2be34fbb…dfd47f` | Mint DB. |
| Python | `python:3.12-slim` | `sha256:5e2bdb1b0d54…a4fa5b` | uplink, coupured. Nutshell 0.22 recommends 3.12. |
| Caddy | `caddy:2.11.9-alpine` | (G5) | Serves the wallet and reverse-proxies `/mint/*` and `/api/*` on the LAN. `admin off`. |
| Node (build only) | `node:24.19.0-bookworm-slim` | (G5) | Builds the wallet in the Caddy image's first stage. Nothing Node runs on the box. |
| uv (build only) | `ghcr.io/astral-sh/uv:0.8.23` | (G5) | Installs coupured from `box/uv.lock` with `--frozen`. |

Full digests are in `infra/compose.yaml` comments once digest pinning lands (G5).

## Nutshell 0.22.1: confirmed in `cashu/core/settings.py` and `cashu/lightning/`

- LND backend still exists after the 0.21.0 backend removals: `LndRestWallet` (`cashu/lightning/lndrest.py`)
  and the gRPC one (`cashu/lightning/lnd_grpc/`). 0.21.0 removed `BlinkWallet`, `LNbitsWallet`, `CoreLightningRestWallet`.
- Env vars used (pydantic-settings, upper-cased field names):
  `MINT_BACKEND_BOLT11_SAT`, `MINT_LND_REST_ENDPOINT`, `MINT_LND_REST_CERT`, `MINT_LND_REST_MACAROON`
  (path, hex or base64, see `cashu/lightning/macaroon.py`), `MINT_LISTEN_HOST`, `MINT_LISTEN_PORT`,
  `MINT_DATABASE` (a `postgres://` URL is rewritten to `postgresql+asyncpg://`), `MINT_INPUT_FEE_PPK`
  (default **100**; we set 0), `MINT_INFO_NAME`, `MINT_INFO_DESCRIPTION`, `MINT_RATE_LIMIT`,
  `MINT_GLOBAL_RATE_LIMIT_PER_MINUTE` (default 60), `MINT_TRANSACTION_RATE_LIMIT_PER_MINUTE` (default 20),
  `MINT_RATE_LIMIT_PROXY_TRUST` (default true), `MINT_FORWARDED_ALLOW_IPS` (default `127.0.0.1`),
  `MINT_MAX_BALANCE`, `MINT_MAX_MINT_BOLT11_SAT`, `MINT_MAX_MELT_BOLT11_SAT`.
- **Brief vs code:** the brief names `MINT_PRIVATE_KEY`. It is deprecated since 0.22.0 in favour of
  `MINT_MNEMONIC` (BIP-39, CDK-compatible derivation). We use `MINT_MNEMONIC`.
- `MINT_INFO_CONTACT` is `List[List[str]]` (JSON), e.g. `[["nostr","npub1…"]]`. Wired in G4 with the operator key.
- NUTs advertised by `/v1/info` on our running mint: 4, 5, 7, 8, 9, 10, 11, 12, 14, 15, 17, 19, 20, 29
  (checked by `scripts/g0_check.sh`). NUT-13 is client-side (deterministic secrets) and needs no mint flag;
  restore is NUT-09. NUT-03 swap is core.
- Liabilities: the mint DB has a `balance` view = `balance_issued − balance_redeemed` per keyset
  (`cashu/mint/migrations.py`, `create_balance_views`). coupured reads it with the `coupured_ro` role
  (default privileges = SELECT, `default_transaction_read_only = on`; a `CREATE TABLE` is refused, tested by hand on 2026-11-19).

## LND v0.21.8-beta: confirmed with `lnd --help` in the image

- `--healthcheck.chainbackend.attempts=0` disables the chain-backend health check. Without it, lnd shuts
  itself down after repeated failures to reach bitcoind, which is exactly what island mode causes.
- **Observed on the island (2026-11-19):** with bitcoind unreachable, `lncli getinfo` and `payinvoice` on
  `lnd-box` block for about 60 s (bitcoind RPC client retry/backoff), while `listpeers` and `listchannels`
  return in about 1 s. IslandMonitor therefore never probes with `getinfo`; it uses `listpeers` plus a
  2-second TCP probe through the uplink. Candidate upstream report (§5 d) once reproduced minimally.
- After the cable returns, `scripts/partition_check.sh` reconnects the peer explicitly if lnd has not
  yet; channels are active again within ~10 s.
- By default lnd accepts one pending inbound channel per peer, so `bootstrap.sh` confirms the first channel
  before opening the second.

## cashu-ts 4.13.1 (`latest` on npm; `next` is 5.0.0-rc.13, not final, so not used)

Read from the source at tag `v4.13.1` (`src/index.ts`, `src/wallet/Wallet.ts`):
- Exports `Wallet`, `Mint`, `KeyChain`, `Keyset`, `P2PKBuilder`, `WalletOps` (`SendBuilder`, `ReceiveBuilder`,
  `MintBuilder`, `MeltBuilder`), `WalletEvents`, `WalletCounters`.
- `Wallet` methods confirmed: `loadMint`, `loadMintFromCache` (offline start from cached keysets),
  `receive`, `send`, `sendOffline`, `restore`/`batchRestore`, `createMintQuoteBolt11`, `mintProofsBolt11`,
  `createMeltQuoteBolt11`, `meltProofsBolt11`, `checkProofsStates`, `decodeToken`.
- Runtime deps: `@noble/curves`, `@noble/hashes`, `@scure/base`, `@scure/bip32` (v2.x). Node ≥ 22.4.
- Detailed call signatures are recorded here when the wallet engine uses them (G1).

## LND v0.21.8-beta: REST paths and macaroons used by the box (G1)

Exercised against the running node (every call below is on the E2E path):
- coupured: `GET /v1/channels`, `GET /v1/peers`, `POST /v1/peers` (`{"addr":{"pubkey","host"},"perm":false}`;
  a 500 with `already connected` is success, `server is still in the process of starting` is not).
- world-faucet (SIMULATED sender): `GET /v1/payreq/{pay_req}`, `POST /v2/router/send` (server-streaming:
  one JSON object per line, the last carries `status`). **There is no SendPaymentSync in 0.21.**
- Macaroons are baked once by `infra/creds/bake.sh` (`lncli bakemacaroon`) into a creds volume.
  `mint.macaroon` = `info:read offchain:read offchain:write invoices:read invoices:write` (enough for
  `LndRestWallet` to create, watch and pay invoices: exercised by `make g0` and the E2E).
  `coupured.macaroon` = `info:read offchain:read peers:read peers:write`. `admin.macaroon` never leaves lnd-box.
- **Stale-tip trap (found 2026-11-19):** btcwallet's bitcoind client reports "not current" when the tip is
  older than 2 h (`isCurrentDelta`), so a restarted lnd waits forever at `Waiting for chain backend to finish
  sync` and every RPC answers `server is still in the process of starting`. Regtest makes no blocks on its own,
  so the stack runs a `miner` service (one block a minute, labelled SIMULATED). Mainnet never has this problem.

## Wallet (npm, exact versions from `wallet/package-lock.json`)

| Package | Version | Notes |
|---|---|---|
| `@sveltejs/kit` | 3.4.0 | **Kit 3: config moved into `vite.config.ts` `sveltekit({...})`**; there is no `svelte.config.js`. `$lib` alias replaced by Node subpath imports (`#lib/*`, explicit `.ts` extension needed for svelte-check). |
| `svelte` | 5.58.0 | Runes (`$state`, `$derived`, `$effect`). |
| `@sveltejs/adapter-static` | 4.0.1 | `fallback: '200.html'`; SPA, `ssr = false`. CSP in hash mode (`kit.csp`) writes a meta tag into the fallback page. |
| `vite` / `typescript` | 8.3.8 / 6.0.3 | |
| `@cashu/cashu-ts` | 4.13.1 | Calls used: `new Wallet(mint, {unit, bip39seed, counterSource})`, `loadMint`, `loadMintFromCache`, `createMintQuoteBolt11`, `onceMintPaid`, `mintProofsBolt11`, `send(amount, proofs, {includeFees})`, `getEncodedToken`, `receive(token, {requireDleq})`, `checkProofsStates`, `proofStateUpdates` (NUT-17 WebSocket), `batchRestore`, `hashToCurve` (for Y). Error 11001 = proofs already spent. |
| `@scure/bip39` | 2.4.0 | English wordlist, 128-bit mnemonics. |
| `@noble/ciphers` / `@noble/hashes` | 2.4.0 / 2.4.0 | AES-256-GCM vault; scrypt N=2^15, r=8, p=1. |
| `idb` | 8.0.4 | One store, one sealed blob. |
| `qrcode-generator` | 2.0.4 | Rendered to one SVG path (no inline styles, CSP-safe). |
| `vitest` / `fast-check` | 5.1.1 / 4.10.3 | Unit + property tests. |
| `@playwright/test` | 1.65.1 | E2E: three Pixel 7 contexts against the real stack. |
| `svelte-check` | 4.7.8 | |

## Box daemon (PyPI, exact versions from `box/uv.lock`)

| Package | Version |
|---|---|
| FastAPI / Starlette | 0.165.0 / 1.10.0 |
| pydantic | 2.14.3 |
| uvicorn | 0.54.0 |
| httpx | 0.28.1 |
| pytest / hypothesis / ruff | dev only |

Starlette note: an `HTTPException` raised inside `@app.middleware("http")` is not turned into a response;
the body-size guard returns a `JSONResponse(413)` instead.

## Not yet pinned (filled in when first used)

| Library | Latest seen | Phase |
|---|---|---|
| bdkpython | 3.1.1 (PyPI) | G4 |
| nostr-sdk (Python) | 0.45.2 (PyPI) | G4 |
| NWC library, local relay (strfry or nostr-rs-relay) | to check | G4 |

## Host tooling notes

- If `docker pull` or `docker build` hangs with `error getting credentials - signal: terminated`, the Docker
  Desktop credential helper is stuck. Public images need no credentials: point `DOCKER_CONFIG` at a directory
  whose `config.json` has no `credsStore` (copy `contexts/` and `cli-plugins/`), or restart Docker Desktop.
