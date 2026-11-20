# Threat model

Historical G0/G1 decisions are preserved below. The completion-pass STRIDE table records current mitigations, executed evidence and remaining release checks.

Each line: decision → threat it addresses → test that proves it (or `TODO` with the gate).

## Decisions so far (G0)

| Decision | Threat | Proof |
|---|---|---|
| The box network is `internal: true`; the only path out is the `uplink` relay | A box service talking to the internet behind our back; a fake "island" | `scripts/partition_check.sh` (bitcoind unreachable, payment fails on cut) |
| Island cut aborts relayed flows and adds an nftables reject on relay ports | Half-open connections keeping Lightning alive | same |
| Uplink control API only with `DEMO_MODE=1`, bearer token ≥ 24 chars, constant-time compare, 1 toggle / 2 s | Anyone on the market Wi-Fi cutting or restoring the cable | TODO G5: unit test of the control handler |
| No Docker socket in any container; uplink has only `NET_ADMIN` | Container escape via the Docker API | compose review; TODO G5 CI grep |
| coupured reads the mint DB as `coupured_ro`: SELECT only, read-only transactions | A coupured bug or compromise altering mint state | manual write attempt refused (2026-11-19); TODO G2 pytest |
| `MINT_INPUT_FEE_PPK=0` | Fees silently eroding small FCFA payments | `scripts/g0_check.sh` asserts it |
| Mint rate limits sized for a market: 240 req/min, 60 tx/min per client IP | Flooding the mint from one phone | TODO G5 test; Caddy must forward client IPs (G1) |
| Mint caps: max balance 0.5 BTC, max mint/melt 2M sat per quote | Hot-float exposure if the box is stolen | config; TODO G4 tie to the documented hot-float cap |
| `.env` generated locally with random secrets, mode 600, git-ignored; only `.env.example` committed | Secrets in git | `.gitignore`; TODO CI secret scan |

## Decisions added in G1 (vertical slice)

| Decision | Threat | Proof |
|---|---|---|
| Least-privilege macaroons baked once into a creds volume; the mint and coupured never see `admin.macaroon` or lnd-box's data dir | A mint or coupured compromise taking full control of the box's Lightning node | `infra/creds/bake.sh`; compose review (no service but `box-creds` mounts `lnd-box`) |
| The wallet refuses a token from any mint other than its own box, and requires DLEQ proofs on receive | Vendor accepting ecash from a look-alike mint; a mint tagging users with bad signatures | `receive` in `wallet/src/lib/state/wallet.svelte.ts`; foreign-mint case in `engine.test.ts` |
| Online acceptance is a swap at the box mint (T1): the vendor holds new proofs before showing PAYÉ | Double-spend of copied ecash between stalls | E2E step 5: replayed coins at stall B-07 refused with DÉJÀ DÉPENSÉ, B's balance stays 0 |
| Receipts: coupured registers stall ↔ Y only after `/v1/checkstate` says SPENT; first writer wins (`INSERT OR IGNORE`) | A phone claiming someone else's sale to frame them as the fraud victim, or overwriting attribution | `POST /api/receipts` returns 409 for unspent Ys; `test_app.py` |
| Wallet seed and proofs sealed with a 6-digit PIN: scrypt (N=2^15, r=8, p=1) → AES-256-GCM, key only in memory, relocks on reload | A borrowed or stolen phone emptied from IndexedDB | `engine.test.ts` (wrong PIN fails, tamper fails). A 6-digit PIN is brute-forceable offline in hours on a GPU: this protects against casual access, not a forensic attacker. TODO G5: attempt counter + wipe |
| Seed shown once as 12 words; restore uses NUT-09/13 from the seed alone | Lost phone = lost money | `restore()`; TODO G2 E2E: wipe and restore |
| Caddy is the only published port; mint and coupured trust `X-Forwarded-For` only from Caddy's fixed IP (10.77.0.10) | A phone spoofing its IP to dodge per-IP rate limits | compose (`MINT_FORWARDED_ALLOW_IPS`, uvicorn `--forwarded-allow-ips`) |
| Strict CSP from SvelteKit (hash mode, everything `'self'`), `frame-ancestors 'none'`, nosniff, no-referrer; request bodies capped (Caddy 64 KB, coupured 16 KB → 413) | XSS stealing the unlocked seed; clickjacking the pay button; memory exhaustion | `build/200.html` meta tag; `test_app.py` 413 test |
| Zero third-party origins: fonts, scripts and icons are bundled; no CDN | Wallet breaks on the island, or leaks usage to third parties | CSP `default-src 'self'` would block them; E2E runs with the cable cut |
| JSON logs with redaction of tokens, invoices, NWC URIs, long hex and BIP-39 runs; no access logs (client IPs) | Secrets or personal data in logs | `test_island.py::test_redaction` |
| IslandMonitor is hysteretic (3 probes) and reconcile must see every channel active before ONLINE | A flapping cable or a half-started lnd shown to vendors as "online" while Lightning payments would fail | `test_island.py` (hysteresis, reconcile retry, inactive channels keep RECONCILING) |
| Hash-chained append-only ledger of island transitions, cable actions and receipts; SQLite triggers refuse UPDATE/DELETE | Rewriting what happened during a cut after the fact | `test_ledger.py` (hypothesis: any tamper detected at the right seq); E2E checks `/api/ledger/verify` |
| SIMULATED world: the faucet (`world-faucet`) and the `miner` live only on the wan side, faucet capped at 200k sat per invoice | A demo helper paying from the box's own funds | they hold only `world-creds`; labelled SIMULATED in UI and README |

## Known gaps (to close before G5)
- ~~The mint mounts the whole `lnd-box` volume and uses `admin.macaroon`~~: fixed in G1 (creds volume, baked macaroons).
- The G1 public cable toggle is now protected by the operator session. The regtest faucet remains public and rate-limited while DEMO_MODE=1. Disable demo mode outside a stage demo.
- HTTP on the LAN in G1: a phone on the same Wi-Fi could tamper with the wallet bundle. HTTPS-on-LAN is G5
  (needs a domain from the operator).
- RPC credentials are passed as command-line flags (visible to `ps` inside the containers). Regtest only; move to
  config files with mode 600 before any non-regtest use.
- `lnd-box` uses `--noseedbackup`: the hot wallet seed is not backed up. Acceptable for regtest; a real box needs
  a seed backup held by the Garants.

## Completion pass: STRIDE across the new boundaries

| Boundary / class | Threat and mitigation | Evidence |
|---|---|---|
| Phone → mint, spoofing | Foreign mint/unit/keyset refused; T2 uses required real DLEQ against first-use pinned keys only | `tiers.test.ts` cryptographic fixtures and foreign/missing/forged cases |
| Offline receipt, tampering | Seen-Y set rejects duplicates; cap applies to total outstanding provisional exposure; that value is excluded from spendable proofs | `tiers.test.ts`; browser runner round trip pending execution |
| Browser storage, tampering | PIN encryption authenticates the blob. IndexedDB revision compare-and-swap rejects writes from stale tabs. Counters await durable writes | vault tests; cross-tab storage browser check pending |
| Mint response, repudiation/reliability | Receive/send journals persist exact previews before requests; NUT-19 replays preserve original outputs | source-verified API; full response-loss stack test still required |
| Browser → cash-out service, spoofing | Domain-separated Schnorr identity signs ID, total debit, destination and creation time. Server validates signature; changed IDs/bodies cannot reuse a request | `tiers.test.ts`, `queue.test.mjs` |
| Queue storage, tampering/disclosure | AES-256-GCM with a separate 32-byte environment key; atomic file replacement and fsync; service has no published port | `queue.test.mjs` encrypted restart, wrong-key and tamper tests |
| Queue retries, financial integrity | Existing quote checked before every retry; PENDING not resubmitted; PAID terminal; expiry requires review; retry backoff retains proofs | `queue.test.mjs`; browser real-Lightning settlement pending |
| Withdrawal amount, tampering | Invoice amount plus maximum routing reserve may not exceed the signed debit. Change needs the same identity's signed claim | `queue.test.mjs` excessive fee / authorized replayable change tests |
| Operator API, spoofing/elevation | Independent scrypt-verified PIN; 15-minute random bearer sessions kept only in browser memory; five login attempts per five minutes per real client | `test_security.py` wrong login, expiry, restart and XFF-spoof throttling |
| Request boundary, denial of service | Streamed body bytes are counted, not merely Content-Length; malformed lengths rejected; public mutation routes rate-limited | `test_security.py` chunked and malformed-length tests |
| Mint DB → transparency, elevation | SELECT-only export role, read-only daemon volume, timestamped atomic snapshots | `scripts/readonly_check.sh` (real-stack gate), stale/missing/invalid snapshot tests |
| Public board, repudiation | Explicitly channel-only reserves; unavailable fields stay null; no solvency claim from incomplete data | `test_security.py::test_tableau_never_turns_missing_data_into_zero` |
| LAN transport, spoofing/disclosure | DNS-01 certificate overlay and local hostname routing; visible warning in insecure HTTP fallback | Compose configuration checked; real Android/TLS gate pending |
| Service worker, disclosure | Only static URLs cached; `/api` and `/mint` bypass caches; no tokens or invoices in CacheStorage | production build; full offline browser check pending |

### Residual risks and precise claims

- V1 is custodial. A malicious mint can issue unbacked coins or refuse swaps. The board is not an independently signed reserve proof; Nostr/BDK/NWC are explicitly deferred.
- Local receipt attribution is untrusted metadata. Seeing spent Ys does not prove which stall actually accepted them; first registration can be raced. Never use it as authenticated evidence for punishment. The mint's replay refusal does not depend on attribution.
- The local hash chain catches edits relative to a trusted head, but a privileged host can replace the whole database and all local anchors.
- The six-digit phone PIN remains susceptible to offline brute force. In-process backoff deters casual guessing but resets on reload and is not a forensic defence. The application does not wipe money after failed attempts.
- Cached keyset enrollment is trust on first use. A physical sticker/operator identity check is not implemented. Trusted HTTPS is required against a fake first hotspot; HTTP fallback is regtest-only.
- A T2 coin may already be spent elsewhere. Its cap limits this phone's current aggregate exposure, not losses across independent phones or unlimited repeated visits. No offline double-spend prevention claim is made for T2.
- Queue encryption protects a stolen data file, not a running-host administrator holding QUEUE_KEY. Back up the key and encrypted volume together under a separate access policy.
- Cash-out destinations are regtest BOLT11 or the labelled demo receiver. No generic URL resolver or Lightning-address/NWC secret ingestion is exposed.
- A fixed BOLT11 may expire during a long cut. Such a request stays pending for explicit review; automatic redirection would violate the signed destination.
- Routing reserve is deliberately forfeited with NUT-08 blank change disabled. Separate excess proofs are reclaimable via a signed identity claim. The UI discloses the fee policy before submission.
