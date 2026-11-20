SHELL := /bin/bash
.NOTPARALLEL: test
DC := docker compose --env-file .env -f infra/compose.yaml

.PHONY: env up down seed demo test test-box test-wallet e2e g0 partition island-cut island-restore logs ps clean test-settlement sim audit

env:            ## create .env with random secrets (never overwrites)
	@scripts/env.sh

up: env         ## build and start the whole box + world
	$(DC) up -d --build --wait

seed: up        ## fund Lightning nodes, open channels through the uplink
	@scripts/bootstrap.sh

demo: seed      ## stack up and funded: open the wallet from any phone on this LAN
	@echo "Coupure is up on port $${HTTP_PORT:-8080} of this machine's LAN address."

test: test-box test-wallet test-settlement  ## unit + property tests, lint, type check (no stack needed)

test-box:
	cd box && uv run --frozen ruff check . && uv run --frozen ruff format --check . && uv run --frozen pytest -q

test-settlement:
	@scripts/test-settlement.sh

test-wallet:
	cd wallet && npm ci --no-audit --no-fund && npm run check && npm test

e2e: seed       ## the island demo in real browsers against the real stack (needs DEMO_MODE=1)
	cd wallet && npx playwright test

g0: seed        ## G0 gate: mint quote paid over real Lightning
	@scripts/g0_check.sh

partition: seed  ## prove the island is a real partition (needs DEMO_MODE=1)
	@scripts/partition_check.sh

island-cut:
	@scripts/island.sh cut

island-restore:
	@scripts/island.sh restore

logs:
	$(DC) logs -f --tail=100

ps:
	$(DC) ps

down:
	$(DC) down

clean:          ## stop and delete all regtest data (volumes); keeps .env
	$(DC) down -v --remove-orphans

sim: seed
	node sim/run.mjs

audit:
	cd wallet && npm audit --omit=dev --audit-level=high
	cd box && uv export --frozen --no-dev --no-hashes --no-emit-project --format requirements-txt > /tmp/coupure-requirements.txt
	uvx pip-audit==2.9.0 --disable-pip --no-deps -r /tmp/coupure-requirements.txt
