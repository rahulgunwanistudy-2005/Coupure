# Coupure: standing rules

Coupure keeps a market's ecash moving when the internet is cut: a box runs a Cashu mint on the LAN,
so double-spends are refused with zero internet, and it settles to Lightning when the uplink returns.
Execution plan and condensed spec: `PLAN.md`. Pinned versions and verified APIs: `docs/VERSIONS.md`.

1. **No fakes in the happy path.** Real bitcoind (regtest), real LND, real Nutshell, real cashu-ts,
   real network partition. `FakeWallet` only in unit tests. Anything that cannot be real is labelled
   `SIMULATED:` in the UI and the README.
2. **Verify before you code.** Read the installed version's source before using an API and record it in
   `docs/VERSIONS.md`. Never invent an endpoint, env var or method. If docs and code disagree, code wins; note it.
3. **Vertical slice first.** Fund → pay → partition → double-spend refused → reconnect → settle works end
   to end before polish. The repo is always demoable; tag `v0.x-demoable` at each gate.
4. **P0 > P1 > P2.** Never start a P1 while a P0 is failing.
5. **Security is a feature.** Every choice touching money or keys gets a line in `docs/THREAT_MODEL.md`.
6. **Offline-first.** Zero runtime requests from the wallet to any third-party origin. Self-host fonts,
   icons, scripts. Test with the cable out.
7. **Commits:** small, conventional (`feat(box): …`), lint + tests pass. No secrets in git (`.env.example` only).
8. **Disclose AI use** in `docs/AI_USE.md`: what was generated, what a human verified, how.
9. **French first**, English toggle. Wolof for amounts, main buttons and status words, every Wolof string
   tagged `[wo-review]`. Never ship machine Wolof unmarked. No string literals in components.
10. **Popular Choice:** share kit only. Nothing that games or rewards votes.

## Practical notes
- `make up | seed | demo | test | e2e | sim | clean` are the entry points. Keep them working.
- Island mode is a real partition in the `uplink` container; LND's chain-backend healthcheck is disabled
  on `lnd-box` so it survives the cut (see `docs/VERSIONS.md`).
- Never mount the Docker socket into any container. Demo controls exist only with `DEMO_MODE=1`.
- Logs: no tokens, seeds, macaroons, NWC secrets, names or phone numbers. Vendors are stall IDs.
- All value is integer sats (bigint in TS). Round display only, never value.
