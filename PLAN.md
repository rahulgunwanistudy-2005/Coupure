# Coupure: execution plan

Solo entry, Dakar Bitcoin Hack 2026 (BTrust). Each gate passes in CI, then gets a `v0.N-demoable` tag.
Cut order if a gate is at risk: P2, then P1. Cuts are recorded in `docs/ROADMAP.md`. Never cut P0 tests,
the double-spend demo, or the README.

## Spine

| Tier | Where | Mechanism | Finality |
|---|---|---|---|
| T1 | In range of the box | Receiver swaps at the local mint (NUT-03), state check (NUT-07), UI driven by NUT-17 | Final, no internet |
| T2 | Out of range | DLEQ vs cached keyset (NUT-12) + local seen-set + amount ≤ cap + pinned keyset; optional P2PK envelopes (NUT-11) | Provisional; auto-swap on return; double-spend flagged |
| T3 | Uplink back | Mint resumes LN mint/melt (NUT-04/05), queued cash-outs execute, attestations publish | Settled |

## Topology decisions (G0)

- Two Docker networks. `box` (internal, no default route): caddy, nutshell, postgres, coupured, lnd-box,
  relay. `wan`: bitcoind, lnd-world, public-relay stand-in. The `uplink` container is the only member of
  both and is the cable.
- `uplink` is a TCP relay with a kill switch (`infra/uplink/`). Box services reach the world only through
  named relay ports on `uplink` (bitcoind RPC, ZMQ, lnd-world p2p, price/relay HTTP). Cutting tears down
  every relayed flow and refuses new ones; nftables in the same container drops the ports as defence in
  depth. Toggle API is token-protected and only started with `DEMO_MODE=1`.
- `lnd-box` has its chain-backend healthcheck disabled so it keeps serving the mint's REST calls while
  bitcoind is unreachable.
- Mint: Nutshell 0.22.1 image, `LndRestWallet`, Postgres, `MINT_INPUT_FEE_PPK=0`, `MINT_MNEMONIC`
  from `.env`. coupured reads the mint DB through a read-only role (`balance` view for liabilities).

## Phases

### G0 Recon (P0)
- [ ] `docs/VERSIONS.md` from real sources (done for core deps; extend as libraries are added)
- [ ] `infra/compose.yaml`: bitcoind, lnd-box, lnd-world, uplink, postgres, nutshell
- [ ] `scripts/bootstrap.sh`: create wallets, mine, fund both LNDs, connect through uplink, open channels both ways
- [ ] `scripts/g0_check.sh`: mint quote paid over Lightning by lnd-world, proofs issued
- [ ] `make up`, `make seed`, `make g0`

### G1 Vertical slice (P0)
- Wallet (SvelteKit static, cashu-ts 4.13.1, unstyled): create/restore (BIP39 → NUT-13, NUT-09), mint via LN,
  pay T1, "Déjà dépensé" on replay
- coupured skeleton: FastAPI, IslandMonitor (probes + hysteresis + SSE), ledger (hash chain)
- Caddy routes `/`, `/mint/*`, `/api/*`; uplink toggle works; reconnect works
- Playwright E2E steps 1–5

### G2 Engine complete (P0)
- T2 acceptance + auto-swap; CashOutQueue; Liabilities invariant; IslandMonitor SSE; sim → METRICS.md
  with 0 accepted T1 double-spends; E2E 1–9

### G3 Design (P0/P1)
- frontend-design skill; all screens; i18n fr/en/wo `[wo-review]`; signature animations; Lighthouse budgets
  (≤150 KB gz JS, ≤350 KB total, TTI < 3 s); screenshot self-critique at 360×800 and 1280×800

### G4 Sponsor depth (P1)
- BDK 2-of-3 cold reserve, watch-only, PSBT flow; Nostr attestations (kind 30078, `d=coupure:attest`);
  NWC `make_invoice`-only sweep; Tableau

### G5 Hardening (P0/P1)
- THREAT_MODEL (STRIDE) with a test per mitigation; HTTPS-on-LAN (DNS-01) verified on a real Android;
  captive-portal launcher; `pip-audit`/`npm audit` clean; strict CSP

### G6 Ship (P0)
- VPS with guided tour, auto-reset; README, DEMO_SCRIPT, DEVPOST, SHARE_KIT; upstream drafts in
  `docs/upstream/`; fresh-clone test; tag `v1.0.0`

## Decisions needed from the user (asked at gates only)
- Domain for HTTPS-on-LAN (G5)
- VPS host (G6)
- Approval of upstream PR/issue texts (G6)
- Raspberry Pi availability for the physical video (G5)
