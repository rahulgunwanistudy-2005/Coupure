#!/usr/bin/env bash
# Creates secrets locally; extends an existing environment without changing any existing secret.
set -euo pipefail
cd "$(dirname "$0")/.."
umask 077
rand() { openssl rand -hex "${1:-16}"; }
if [[ ! -f .env ]]; then
  mnemonic=$(docker run --rm --entrypoint python cashubtc/nutshell:0.22.1 \
    -c "from mnemonic import Mnemonic; print(Mnemonic('english').generate(128))")
  while IFS= read -r line; do
    key=${line%%=*}
    if [[ $line == *"=CHANGE_ME" ]]; then
      case "$key" in
        MINT_MNEMONIC) echo "$key=\"$mnemonic\"" ;;
        OPERATOR_PIN) echo "$key=$(od -An -N4 -tu4 /dev/urandom | tr -d ' ' | cut -c1-8)" ;;
        QUEUE_KEY) echo "$key=$(rand 32)" ;;
        *) echo "$key=$(rand)" ;;
      esac
    else
      echo "$line"
    fi
  done <.env.example >.env
fi
# Migration from G1; never rotate a queue encryption key with existing funds.
for key in QUEUE_KEY QUEUE_TOKEN OPERATOR_PIN; do
  if ! grep -q "^${key}=" .env; then
    case "$key" in
      QUEUE_KEY) echo "$key=$(rand 32)" >>.env ;;
      QUEUE_TOKEN) echo "$key=$(rand)" >>.env ;;
      OPERATOR_PIN) echo "$key=$(od -An -N4 -tu4 /dev/urandom | tr -d ' ' | cut -c1-8)" >>.env ;;
    esac
  fi
done
chmod 600 .env
echo '.env ready (mode 600); operator PIN is in .env'
