# Draft: wallet recovery example

Status: documentation proposal, not submitted. Read the contribution guide and search for an existing example first.

A possible cashu-ts example could show a storage-backed CounterSource, persisted `serializeSwapPreview`/`deserializeSwapPreview`, exact NUT-19 replay after a dropped response, and a melt state check before any retry. This project also distinguishes a mint-signed T2 coin from a confirmed-unspent T1 receipt.

Before proposing upstream text, reduce the example to a small tested module against the supported release, remove Coupure-specific policy and document its storage assumptions. Do not send repository-specific abstractions or claim the example fixes a library bug.
