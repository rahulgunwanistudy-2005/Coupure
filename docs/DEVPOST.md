# Coupure — Le marché continue

## Inspiration

A phone can have battery and a shop can have stock, yet a mobile-data shutdown can stop a payment. Reporting from Senegal's shutdowns described disrupted mobile-money transfers and queues for cash. We focused on the small place that still has people, goods and power: the market itself.

Offline bearer ecash raises a difficult question for the seller. A signature proves that a coin was issued, but an isolated phone cannot know whether somebody already spent a copy. Coupure changes the network boundary. It puts the mint in the market, where the seller can still reach it when the internet uplink is gone.

## What it does

A customer joins the box's Wi-Fi and opens a browser wallet. A seller receives a token and swaps it at the local Cashu mint before seeing PAYÉ. Sending the same input coins to another stall is refused even while the WAN relay is cut.

The wallet distinguishes three outcomes. T1 payments confirmed by the box are spendable. T2 receipts accepted away from the box are explicitly provisional, cryptographically checked and limited by a cumulative exposure cap. T3 withdrawals are signed requests that the box takes into custody locally and settles over Lightning when connectivity returns.

The operator gets a protected console. Anyone can inspect a public board with actual mint liabilities, Lightning channel balances, queue counts and a verifiable hash-chained ledger. Missing data stays unavailable. French is the default, English is complete, and the partial Wolof catalogue is marked for native review.

## How we built it

Bitcoin Core regtest, two LND nodes, Nutshell and Postgres run in Docker Compose. The box's internal network reaches the outside only through an explicit TCP relay. Cutting it aborts actual connections. The local mint remains reachable from the wallet.

SvelteKit ships a static, offline-capable wallet using the pinned cashu-ts release. The Python daemon monitors the island and protects operator actions. A small internal Node service reuses cashu-ts for the custodial cash-out wallet. Both sides durably save deterministic counters and exact swap previews before contacting the mint, so an ambiguous response can be recovered without inventing another transaction.

## Challenges

A displayed “offline” label is easy; proving that Lightning is disconnected while local payments still work is harder. Another challenge is response loss during money operations. A payment may succeed even if its HTTP response disappears. Our queue checks an existing quote before retrying and treats PAID as terminal. T2 acceptance also needs an aggregate cap: a per-payment limit alone would allow unlimited exposure through many small receipts.

## Accomplishments

The implementation includes the complete local payment and replay-refusal path, capped T2 processing, a durable signed withdrawal queue, an honest transparency board, operator access controls, a guided demo and a real-stack workload runner. The release notes distinguish locally verified unit/build results from pending real-stack and physical hardware checks.

## What we learned

“Offline” means different things at different boundaries. Losing the WAN is different from losing the mint. The product must communicate that difference clearly, especially when a seller is deciding whether to hand over goods.

## What's next

Run a supervised market pilot after independent security review. Add Garants-controlled cold reserves, signed public attestations and least-privilege NWC sweeping. Explore a federated custody model. Validate the French/Wolof experience with the people who will actually use it.

## Built with

Bitcoin Core, Lightning Network, LND, Cashu, Nutshell, cashu-ts, SvelteKit, TypeScript, Python, FastAPI, PostgreSQL, SQLite, Docker Compose, Caddy, Playwright.

## Submission checklist

- Public source: https://github.com/rahulgunwanistudy-2005/Coupure
- Completion branch: `feat/complete-island-mvp` until reviewed/merged.
- Add a real live URL or recorded demo video before submission.
- Use generated metrics only after a successful isolated real-stack run.
- Regtest only. Custodial v1. No audited-production claim.
- BDK, Nostr and NWC extensions are deferred; do not list them as implemented integrations.

Problem references: [mobile-money impact](https://osiris.sn/Au-Senegal-comment-se-connecter.html), [Wave during the June shutdown](https://www.osiris.sn/La-coupure-de-l-internet-mobile-au.html). Historical context should acknowledge that Wave subsequently announced a USSD fallback; Coupure does not claim Wave has never offered one.
