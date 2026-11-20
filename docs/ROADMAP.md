# Release scope and remaining gates

The implemented scope is a custodial **Bitcoin regtest MVP**. No real-money deployment is authorized by this repository's defaults.

| Gate | Implementation | Verification still required |
|---|---|---|
| G0 | Real Bitcoin Core, LND, Nutshell, Postgres, WAN relay and bootstrap | Fresh-host Docker run and CI stack |
| G1 | PIN vault, Lightning top-up, T1 swap, NUT-17 claims, replay refusal | Rerun browser demo on final revision |
| G2 | DLEQ/pinned-key T2 with cumulative cap, recovery journals, signed custodial queue, real liabilities snapshots, workload runner | Final real-stack T2/settlement test and generated workload results |
| G3 | French/English wallet, marked partial Wolof, operator console, board, tour, camera fallback, offline static shell | 360×800 and 1280×800 screenshots, accessibility/Lighthouse and real phone checks |
| G4 | Deferred sponsor extensions, listed below | No completion claim |
| G5 | Operator sessions, scoped credentials, bounded bodies, strict CSP, encrypted queue, cross-tab vault revision checks, TLS overlay, audit CI | Audit results, full image digests, real Android TLS validation, physical captive-portal test |
| G6 | Setup, architecture, security model, demo script, Devpost draft, share kit, TLS/Pi/deployment guides | Domain, VPS, physical hardware/video, fresh-clone gate, approved release tag |

## Explicit scope cuts

P1 features were cut before compromising the P0 money path: BDK 2-of-3 reserve/PSBT signing, Nostr public attestations and relay replay, NWC make_invoice automation, P2PK envelopes, animated QR and a live market animation. **There are no fake integrations or sponsor claims standing in for them.**

The queue supports regtest BOLT11 invoices and an explicitly simulated external receiver. Lightning-address resolution is deferred to avoid introducing a remotely configurable HTTP fetcher/SSRF surface. Operator cash-in/out uses a separate ordinary wallet and actual ecash transfers; a dedicated cash-drawer accounting system is deferred. Operator auth uses scrypt and expiring bearer sessions; WebAuthn passkeys are deferred.

The workload runner measures real T1 transfers, replay refusal and the liabilities invariant across an actual WAN partition. It does not claim a two-hour run, 200 wallets, Poisson arrivals, a restart storm or Pi-class performance. These require additional scenarios and measured runs.

## Next practical steps

1. Merge only after CI's unit, stack and audit jobs are reviewed; inspect the recorded video and generated metrics.
2. Test the HTTP fallback and DNS-01 HTTPS mode on a physical Android. Confirm reload, seed restore and an out-of-range T2 round trip.
3. Supply a domain and VPS, configure operator secrets, deploy the real stack, and record its public URL in the submission.
4. Review Wolof with a native speaker. Record the three-minute video. Publish `v1.0.0` only after the fresh-clone check passes.
5. Add independently signed reserve attestations, Garants-controlled cold reserves, then NWC sweep. A future Fedimint design may distribute operator trust.
