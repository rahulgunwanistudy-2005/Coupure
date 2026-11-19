# Verification record

Date: 20 November 2026, India time. This file distinguishes executed checks from required release checks.

## Executed locally

- Backend: **18 tests passed**, excluding the existing real-socket `test_http_probe_up_and_down`. That test cannot bind a socket under this task's sandbox; it remains in the suite and runs in CI.
- Wallet: **20 tests passed** (Vitest and fast-check), including actual blind-signature/DLEQ fixtures, cumulative exposure, exact FCFA arithmetic, forged coins, duplicated Ys and signed intent tampering.
- Settlement: **8 tests passed**, covering encrypted durable storage, wrong keys/tampering, restart recovery, lost PAID responses, PENDING/expired quotes, idempotency, maximum debit and signed change release.
- Ruff lint and formatting: passed.
- Svelte diagnostics: zero errors and warnings on the last checked source.
- Production static build: passed, including the SvelteKit 3 service worker API.
- Size budgets: enforced by `scripts/check-budget.mjs`; final build output records exact bytes. The implementation pass measured approximately 124 KB initial gzipped JS and 165 KB all static assets, within 150 KiB / 350 KiB budgets.
- Compose configuration and shell syntax: passed. The TLS overlay has configuration, but a real certificate/device validation is still required.
- Git diff whitespace checks: passed.

Commands used for the local backend avoided uv's unwritable global cache and ran the existing environment directly:

```bash
box/.venv/bin/ruff check box
box/.venv/bin/ruff format --check box
box/.venv/bin/pytest -q box/tests -k 'not test_http_probe_up_and_down'
npm --prefix wallet run check
npm --prefix wallet test
scripts/test-settlement.sh
npm --prefix wallet run build
node scripts/check-budget.mjs
docker compose --env-file .env -f infra/compose.yaml config --quiet
```

## GitHub CI evidence

On commit `f286825`, the full unit job passed, including the socket-binding backend test, wallet tests, all eight queue tests, ShellCheck and the production build/payload budgets. The previous commit's dependency audit passed; a later audit hit a truncated package download rather than a reported vulnerability. Auditing the fully pinned uv export without reinstalling its dependencies avoids that unrelated download path. Real-stack CI is being used to resolve startup/Lightning readiness before the final gate is declared.

## Not executed locally

The Docker daemon was stopped/unavailable. The sandbox also denies socket binding, shell network DNS and Chromium launch. Therefore the final-revision real mint/Lightning browser demo, workload metrics, screenshot review, Lighthouse, fresh-host run and dependency audits could not be certified locally. The corresponding checks are retained/extended in GitHub Actions, not skipped or relabelled as passing.

The expanded browser scenario covers funding, online payment, actual WAN cut, local payment, copied-token refusal, T2 provisional acceptance/return, queued custody, real settlement, liabilities availability and restoring unspent coins into a fresh browser profile. The real database privilege script verifies that the read-only role cannot write even after explicitly disabling its read-only transaction default.

## Publication

The local Git metadata is read-only in this task, so the existing G1 snapshot was imported into the previously empty GitHub repository and subsequent changes published as conventional commits through the connected account. The baseline import cites local commit `2bd1c78`. Original local history was not rewritten. Commit messages have no AI/co-author trailers; the repository's existing development disclosure was retained.

A public URL/video, native Wolof review, real Android HTTPS check and physical-box recording remain external release prerequisites. `v1.0.0` must not be tagged until those required gates are actually passed or explicitly rescaled in the release scope.
