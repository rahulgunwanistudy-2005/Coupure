# Build context: repository root.
# Stage 1: build the wallet (static SvelteKit SPA).
FROM node:24.19.0-bookworm-slim AS wallet
WORKDIR /w
COPY wallet/package.json wallet/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY wallet/ ./
RUN npm run build

# Stage 2: runtime, the official Caddy image (pinned; digest in docs/VERSIONS.md).
FROM caddy:2.11.9-alpine
COPY --from=wallet /w/build /srv/wallet
COPY infra/caddy/Caddyfile /etc/caddy/Caddyfile
COPY infra/caddy/Caddyfile.tls /etc/caddy/Caddyfile.tls
# unprivileged: listens on 8080, keeps its state in /tmp (no ACME on the LAN in G1)
USER 10002:10002
ENV XDG_DATA_HOME=/tmp XDG_CONFIG_HOME=/tmp
EXPOSE 8080
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
