# shellcheck shell=bash
# Shared helpers for scripts/*.sh. Source it; do not execute.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
DC=(docker compose --env-file "$ROOT/.env" -f "$ROOT/infra/compose.yaml")

set -a
# shellcheck source=/dev/null
source "$ROOT/.env"
set +a

btc() { "${DC[@]}" exec -T bitcoind bitcoin-cli -regtest -rpcuser="$BITCOIN_RPC_USER" -rpcpassword="$BITCOIN_RPC_PASSWORD" "$@"; }
lnw() { "${DC[@]}" exec -T lnd-world lncli --network=regtest "$@"; }
lnb() { "${DC[@]}" exec -T lnd-box lncli --network=regtest "$@"; }
mint_curl() { "${DC[@]}" exec -T nutshell curl -fsS "$@"; }

say() { printf '\033[1m▸ %s\033[0m\n' "$*"; }
die() { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

mine() {
  local n=${1:-1} addr
  addr=$(btc -rpcwallet=miner getnewaddress)
  btc generatetoaddress "$n" "$addr" >/dev/null
}

# wait_for <description> <timeout_s> <command...>
wait_for() {
  local what=$1 timeout=$2; shift 2
  local start=$SECONDS
  until "$@" >/dev/null 2>&1; do
    (( SECONDS - start > timeout )) && die "timed out waiting for: $what"
    sleep 1
  done
}

synced() { "$@" getinfo | jq -e '.synced_to_chain == true' >/dev/null; }
