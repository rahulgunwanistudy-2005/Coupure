#!/usr/bin/env bash
# Proves the island is a real partition: with the cable cut, the box's Lightning node loses its peer and
# chain backend and an outbound payment fails, while the mint keeps answering on the LAN. Restoring the
# cable brings the peer back and payments flow again.
# shellcheck source=scripts/lib.sh
source "$(dirname "$0")/lib.sh"

world_pk=$(lnw getinfo | jq -r .identity_pubkey)
peer_up() { lnb listpeers | jq -e --arg pk "$world_pk" '.peers[] | select(.pub_key == $pk)'; }
peer_down() { ! peer_up; }
active_two() { [[ $(lnb listchannels --active_only | jq '.channels | length') -ge 2 ]]; }

say "cut the cable"
scripts/island.sh cut >/dev/null
wait_for "lnd-box loses its peer" 30 peer_down

say "mint still serves the LAN"
mint_curl http://127.0.0.1:3338/v1/keysets | jq -e '.keysets | length > 0' >/dev/null || die "mint unreachable on LAN"

say "Lightning really fails: no active channel, and a payment cannot complete"
no_active() { [[ $(lnb listchannels --active_only | jq '.channels | length') -eq 0 ]]; }
wait_for "channels inactive" 30 no_active
inv=$(lnw addinvoice --amt 100 | jq -r .payment_request)
# timeout runs inside the container so a hung lncli cannot linger and pay after the cable returns
if "${DC[@]}" exec -T lnd-box timeout 30 lncli --network=regtest payinvoice --force --timeout 10s --json "$inv" 2>/dev/null \
  | jq -e '.status == "SUCCEEDED"' >/dev/null; then
  die "payment succeeded with the cable cut"
fi
lnw lookupinvoice "$(lnw decodepayreq "$inv" | jq -r .payment_hash)" | jq -e '.state != "SETTLED"' >/dev/null \
  || die "invoice settled with the cable cut"
say "bitcoind is unreachable from the box"
if "${DC[@]}" exec -T lnd-box sh -c 'nc -z -w 2 uplink 18443' 2>/dev/null; then die "uplink still relays RPC"; fi

say "restore the cable"
scripts/island.sh restore >/dev/null
reconnect() { peer_up || lnb connect "${world_pk}@uplink:9735" >/dev/null 2>&1; peer_up; }
wait_for "peer back" 60 reconnect
wait_for "channels active" 60 active_two
inv=$(lnw addinvoice --amt 100 | jq -r .payment_request)
lnb payinvoice --force --json "$inv" | jq -e '.status == "SUCCEEDED"' >/dev/null || die "payment failed after restore"
say "partition OK: Lightning broke on cut and recovered on restore"
