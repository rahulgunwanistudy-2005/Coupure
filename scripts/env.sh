#!/usr/bin/env bash
# Create .env from .env.example, filling every CHANGE_ME with a fresh random value. Never overwrites.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -f .env ]]; then
  echo ".env exists, leaving it alone"
  exit 0
fi

rand() { LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c "${1:-32}"; }
mnemonic=$(docker run --rm --entrypoint python cashubtc/nutshell:0.22.1 \
  -c "from mnemonic import Mnemonic; print(Mnemonic('english').generate(128))")

while IFS= read -r line; do
  key=${line%%=*}
  if [[ $line == *"=CHANGE_ME" ]]; then
    if [[ $key == MINT_MNEMONIC ]]; then
      echo "$key=\"$mnemonic\""
    else
      echo "$key=$(rand 32)"
    fi
  else
    echo "$line"
  fi
done <.env.example >.env
chmod 600 .env
echo ".env written (mode 600)"
