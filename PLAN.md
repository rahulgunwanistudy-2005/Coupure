# Coupure execution status

Source of scope: the original master build brief and the existing G1 vertical slice. Priority remains P0 before optional sponsor integrations. The implementation is a custodial **regtest MVP**, not a real-money launch.

| Area | Implemented in this pass | Evidence / remaining work |
|---|---|---|
| T2 engine | Required DLEQ, pinned keys, duplicate/seen rejection, aggregate FCFA cap, explicit provisional history and return-to-box swaps | Actual cryptographic unit tests; final browser round trip retained in CI |
| Money persistence | Awaited deterministic counters, send/receive swap journals, PIN-vault revision checks, bounded in-process PIN retry backoff | Wallet tests/types/build pass; cross-tab and response-loss browser drills remain |
| Cash-out | Signed intentions, immediate local custody, encrypted fsynced storage, quote-aware retries/backoff, signed change release | Eight durable-queue tests; actual LND settlement in expanded E2E |
| Transparency | Real SELECT-only mint snapshot, stale-data refusal, channel-only reserve coverage and verified ledger head | Backend tests; real DB privilege check in CI |
| UI | French/English receipt design, marked partial Wolof, payment stamps, operator console, public board, walkthrough, camera fallback and static offline shell | Production build and payload budgets; screenshot/Lighthouse/device review pending |
| Security | Operator sessions, stream-counted body limits, trusted-proxy IP handling, HTTPS overlay, audit job and STRIDE notes | Backend tests/config pass; audits, physical TLS and digest pinning not claimed |
| Release material | README, architecture, deployment/Pi instructions, demo script, Devpost draft, share kit, upstream drafts, measured-workload runner | No invented deployment URL, video, benchmark or release tag |

## Acceptance checks

```bash
make test
make g0
scripts/readonly_check.sh
make partition
make e2e
SIM_PAYMENTS=20 make sim
make audit
```

`docs/VERIFICATION.md` records which checks actually ran. `docs/METRICS.md` stays unmeasured until the real workload runs. The CI workflow retains the full real-socket test and records videos/metrics.

## Explicit cuts and handoff

BDK reserve signing, Nostr attestations, NWC sweeps, P2PK envelopes, animated QR and the market visualizer are deferred. Full details and external prerequisites are in `docs/ROADMAP.md`. Do not claim those sponsor integrations or tick a phase gate merely because its code exists.

A domain/VPS, physical Android/Pi access and actual video recording remain necessary for the original deployment/physical gates. Everything reviewable without them is implemented or documented. Publish the final completion branch, review CI, then merge only after the real-stack checks are resolved.
