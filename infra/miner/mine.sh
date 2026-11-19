#!/bin/sh
# SIMULATED: regtest block production. Mainnet makes a block every ~10 minutes; regtest makes none unless asked.
# Without fresh blocks, lnd (btcwallet) treats a tip older than 2 h as "not synced" and never finishes starting.
set -eu
cli() { bitcoin-cli -regtest -rpcconnect=bitcoind -rpcuser="$BITCOIN_RPC_USER" -rpcpassword="$BITCOIN_RPC_PASSWORD" "$@"; }
until cli getblockchaininfo >/dev/null 2>&1; do sleep 2; done
cli listwallets | grep -q '"miner"' || cli loadwallet miner >/dev/null 2>&1 || cli createwallet miner >/dev/null 2>&1 || true
interval=${MINER_INTERVAL_S:-60}
echo "miner: one block every ${interval}s"
while true; do
  addr=$(cli -rpcwallet=miner getnewaddress)
  cli generatetoaddress 1 "$addr" >/dev/null && echo "miner: height $(cli getblockcount)"
  sleep "$interval"
done
