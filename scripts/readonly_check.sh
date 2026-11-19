#!/usr/bin/env bash
# Verify database privileges without changing a single row, even if the role is misconfigured.
# shellcheck source=scripts/lib.sh
source "$(dirname "$0")/lib.sh"
# Expand the database password inside the container, never in the host command arguments.
# shellcheck disable=SC2016
if "${DC[@]}" exec -T postgres sh -c '
  export PGPASSWORD="$COUPURED_RO_PASSWORD"
  psql -X -v ON_ERROR_STOP=1 -h postgres -U coupured_ro -d mint \
    -c "SET default_transaction_read_only = off" \
    -c "UPDATE mint_quotes SET amount = amount WHERE false;"
' >/dev/null 2>&1; then
  die "read-only mint role unexpectedly has write privileges"
fi
# shellcheck disable=SC2016
"${DC[@]}" exec -T postgres sh -c '
  export PGPASSWORD="$COUPURED_RO_PASSWORD"
  psql -X -A -t -v ON_ERROR_STOP=1 -h postgres -U coupured_ro -d mint \
    -c "SELECT count(*) >= 0 FROM balance"
' | tr -d '\r' | grep -qx t || die "read-only role cannot query real mint liabilities"
say "mint role can read balances and cannot write, even with transaction read-only disabled"
