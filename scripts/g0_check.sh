#!/usr/bin/env bash
# G0 gate: a real mint quote on the box's Nutshell, paid over real Lightning by the outside world.
# shellcheck source=scripts/lib.sh
source "$(dirname "$0")/lib.sh"

say "mint info (NUT-06)"
info=$(mint_curl http://127.0.0.1:3338/v1/info)
echo "$info" | jq '{name, version, nuts: (.nuts | keys)}'
for nut in 7 9 10 11 12 17; do
  echo "$info" | jq -e --arg n "$nut" '.nuts[$n]' >/dev/null || die "mint does not advertise NUT-$nut"
done

say "keyset input fee is 0"
mint_curl http://127.0.0.1:3338/v1/keysets | jq -e '[.keysets[] | select(.active and .unit == "sat")][0].input_fee_ppk == 0' >/dev/null \
  || die "active sat keyset charges input fees"

say "mint quote for 1000 sat (NUT-04)"
quote=$("${DC[@]}" exec -T nutshell curl -fsS -X POST -H 'content-type: application/json' \
  -d '{"amount":1000,"unit":"sat"}' http://127.0.0.1:3338/v1/mint/quote/bolt11)
qid=$(echo "$quote" | jq -r .quote)
bolt11=$(echo "$quote" | jq -r .request)
[[ $(echo "$quote" | jq -r .state) == UNPAID ]] || die "fresh quote is not UNPAID"

say "lnd-world pays the invoice through the uplink"
lnw payinvoice --force --json "$bolt11" | jq -e '.status == "SUCCEEDED"' >/dev/null || die "payment failed"

paid() { [[ $(mint_curl "http://127.0.0.1:3338/v1/mint/quote/bolt11/$qid" | jq -r .state) == PAID ]]; }
wait_for "quote $qid PAID" 30 paid
say "G0 OK: quote $qid paid over Lightning"
