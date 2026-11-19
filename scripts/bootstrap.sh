#!/usr/bin/env bash
# Fund both Lightning nodes and open channels in both directions, through the uplink. Idempotent.
# shellcheck source=scripts/lib.sh
source "$(dirname "$0")/lib.sh"

say "miner wallet"
btc listwallets | jq -e 'index("miner")' >/dev/null \
  || btc loadwallet miner >/dev/null 2>&1 \
  || btc createwallet miner >/dev/null
height=$(btc getblockcount)
if (( height < 101 )); then mine $((101 - height)); fi

say "waiting for both LND nodes to sync"
wait_for "lnd-world synced" 120 synced lnw
wait_for "lnd-box synced through the uplink" 120 synced lnb

fund() {
  local name=$1 cli=$2 bal addr
  bal=$($cli walletbalance | jq -r '.confirmed_balance')
  if (( bal < 100000000 )); then
    addr=$($cli newaddress p2tr | jq -r .address)
    btc -rpcwallet=miner sendtoaddress "$addr" 5 >/dev/null
    say "funded $name with 5 BTC"
  fi
}
fund lnd-world lnw
fund lnd-box lnb
mine 6
wait_for "lnd-world synced" 60 synced lnw
wait_for "lnd-box synced" 60 synced lnb

world_pk=$(lnw getinfo | jq -r .identity_pubkey)
box_pk=$(lnb getinfo | jq -r .identity_pubkey)

say "box → world peer link via uplink:9735"
if ! lnb listpeers | jq -e --arg pk "$world_pk" '.peers[] | select(.pub_key == $pk)' >/dev/null; then
  lnb connect "${world_pk}@uplink:9735" >/dev/null
fi

# channels opened by $1's node, open or pending. listchannels.initiator is a bool, pending uses an enum.
initiated_by_box() {
  local open pend
  open=$(lnb listchannels | jq '[.channels[] | select(.initiator == true)] | length')
  pend=$(lnb pendingchannels | jq '[.pending_open_channels[].channel | select(.initiator == "INITIATOR_LOCAL")] | length')
  echo $((open + pend))
}
initiated_by_world() {
  local open pend
  open=$(lnb listchannels | jq '[.channels[] | select(.initiator == false)] | length')
  pend=$(lnb pendingchannels | jq '[.pending_open_channels[].channel | select(.initiator == "INITIATOR_REMOTE")] | length')
  echo $((open + pend))
}

if (( $(initiated_by_box) == 0 )); then
  say "opening box → world channel (5M sat): the box's outbound liquidity for melts"
  lnb openchannel --node_key "$world_pk" --local_amt 5000000 >/dev/null
fi
mine 6 # confirm before the next open: lnd allows one pending inbound channel per peer by default
if (( $(initiated_by_world) == 0 )); then
  say "opening world → box channel (5M sat): inbound liquidity so the world can fund the mint"
  world_sees_box() { lnw listpeers | jq -e --arg pk "$box_pk" '.peers[] | select(.pub_key == $pk)'; }
  wait_for "world sees box as peer" 30 world_sees_box
  lnw openchannel --node_key "$box_pk" --local_amt 5000000 >/dev/null
  mine 6
fi

active_two() {
  [[ $(lnb listchannels --active_only | jq '.channels | length') -ge 2 ]] &&
    [[ $(lnw listchannels --active_only | jq '.channels | length') -ge 2 ]]
}
wait_for "both nodes report two active channels" 90 active_two

# An active channel can still be absent from the sender's routing graph for a few seconds.
# The WAN-side helper checks LND's real QueryRoutes response before we issue the first invoice.
world_route_ready() { mint_curl http://uplink:8090/ready | jq -e '.ready == true'; }
wait_for "world has a payable route to the box" 90 world_route_ready

lnb listchannels | jq -r '.channels[] | "  channel \(.chan_id): local \(.local_balance) / remote \(.remote_balance) sat"'
say "bootstrap done"
