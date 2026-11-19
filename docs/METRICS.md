# Verification and performance

No real-stack workload figures have been fabricated. Run `make sim` against an isolated funded stack to replace this file with measured results and create `docs/metrics.json`.

Local checks on 20 November 2026 (India time): wallet engine unit/property tests, queue recovery tests, backend tests excluding one socket-binding test, Svelte diagnostics, production build, shell syntax and Compose configuration. Exact final counts and size measurements are in `VERIFICATION.md`.

| Real workload measure | Status |
|---|---|
| T1 payments / second | Not measured |
| T1 p50 / p95 | Not measured |
| T1 replays attempted / accepted | Real-stack run pending |
| Liabilities invariant violations | Real-stack run pending |
| Reconnect settlement duration | Browser run pending |
| Raspberry Pi / Android results | Physical hardware run pending |

The committed test suite checks genuine DLEQ cryptography, aggregate caps, signed intents, encrypted durable storage, idempotent recovery and already-paid quote reconciliation. These unit tests do not substitute for the full network-partition demo.
