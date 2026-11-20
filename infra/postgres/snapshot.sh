#!/bin/sh
# This process has only the mint's read-only database role. Atomic snapshots contain no bearer data.
set -eu
export PGHOST=postgres PGDATABASE=mint PGUSER=coupured_ro
mkdir -p /snapshots
while :; do
  if psql -X -A -t -v ON_ERROR_STOP=1 -c "SELECT json_build_object(
    'ts', extract(epoch FROM now()),
    'outstanding_sat', COALESCE(sum(balance), 0)::bigint,
    'keysets', COALESCE(json_agg(json_build_object('id', keyset, 'balance_sat', balance)), '[]'::json)
  ) FROM balance" > /snapshots/liabilities.tmp; then
    chmod 644 /snapshots/liabilities.tmp
    mv /snapshots/liabilities.tmp /snapshots/liabilities.json
  fi
  sleep 2
done
