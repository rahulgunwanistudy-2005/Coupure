# Deployment and a fresh-host check

## Laptop / VPS demo

Use a Docker-capable Linux host or Docker Desktop on the laptop, with enough free memory and disk for Bitcoin regtest, two LND nodes, Postgres and the mint. The static wallet alone cannot reproduce the double-spend or island demo: deploy the full Compose project.

```bash
git clone https://github.com/rahulgunwanistudy-2005/Coupure.git
cd Coupure
git switch feat/complete-island-mvp  # until the completion branch is merged
make demo
make g0
make partition
make test
make e2e
SIM_PAYMENTS=20 make sim
make audit
```

Open `http://localhost:8080/tour`. For a phone, use the laptop's LAN address. The operator PIN is generated in the private `.env` file. Do not put it in a screenshot, issue or commit. Three independent wallets need separate browser profiles/devices, not three tabs sharing the same IndexedDB.

`make env` preserves existing secrets and extends a G1 environment with the queue encryption key, queue authentication token and operator code. On an old G1 data volume, rerun the one-shot credential bake after upgrading:

```bash
docker compose --env-file .env -f infra/compose.yaml run --rm world-creds
```

The added `/v1/invoices` permission is needed to test cash-outs. The bake replaces only the scoped macaroon, not wallet data or seeds.

The final acceptance check must be performed on a fresh checkout and fresh disposable regtest volumes. A local browser build and unit tests cannot prove that the full stack starts cleanly. Record the run, save the generated metrics and review the Playwright video before making release claims.

## HTTPS on the LAN

1. Choose a domain you control, such as `box.example.org`.
2. While online, obtain a publicly trusted certificate by DNS-01 using an ACME client and your DNS provider. Keep the DNS credential outside this repository and outside runtime containers.
3. Place `fullchain.pem` and `privkey.pem` in a certificate directory readable by the Caddy container's UID/GID 10002. Keep the private key group-readable only by that service account, never world-readable.
4. Set `BOX_DOMAIN` and `TLS_CERT_DIR` locally. On the market router/dnsmasq, resolve that hostname to the box's LAN address. The phone must use that hostname, not an IP URL.
5. Start Caddy with the overlay:

```bash
docker compose --env-file .env -f infra/compose.yaml -f infra/compose.tls.yaml up -d --build
```

The overlay exposes only host port 443 for Caddy. Verify the trusted chain on a real Android while the WAN is cut, then test camera, install, reload and T2 return. Certificate renewal still requires periodic internet access and DNS-01 authorization. Monitor the actual expiry date; do not rely on an assumed fixed certificate lifetime.

Do not terminate TLS in a remote proxy that becomes unreachable when the cable is cut. If a VPS uses an additional proxy, preserve Host and use a narrowly configured trusted proxy chain; do not trust arbitrary forwarded headers.

## Backups and operational limits

Back up `.env` securely, the Postgres mint database, LND seed/data and the `settlement` and `coupured` volumes together. **Losing QUEUE_KEY loses access to queued funds.** Queue vault encryption is not protection against a running host's administrator, who also has the environment key.

Default demo controls are deliberately enabled in the example environment for regtest. They require the operator session; disable `DEMO_MODE` for any non-stage installation. Faucet and miner are explicitly simulated world-side helpers. There is no production money launch or automatic public reset in this release.

A public VPS URL, a domain and physical hardware were not supplied in this task. No live deployment, verified Android result, video URL, image digest verification or final `v1.0.0` gate is asserted.
