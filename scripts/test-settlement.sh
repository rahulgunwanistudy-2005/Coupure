#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# The service reuses the wallet's pinned production dependencies. Its image puts them in /app.
if [[ ! -e settlement/node_modules ]]; then
  ln -s ../wallet/node_modules settlement/node_modules
fi
node --test settlement/queue.test.mjs
