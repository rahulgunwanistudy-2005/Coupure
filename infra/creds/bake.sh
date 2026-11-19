#!/bin/sh
# One-shot: bake least-privilege macaroons and copy the TLS cert into a dedicated credentials volume, so
# no other container ever mounts an LND data directory or sees admin.macaroon.
#   BAKE="name.macaroon=perm,perm name2.macaroon=perm"   NODE=lnd-box
set -eu
LN="lncli --network=regtest --rpcserver=${NODE}:10009 --tlscertpath=/lnd/tls.cert --macaroonpath=/lnd/data/chain/bitcoin/regtest/admin.macaroon"
cp /lnd/tls.cert /creds/tls.cert
for spec in $BAKE; do
  name=${spec%%=*}
  perms=$(echo "${spec#*=}" | tr ',' ' ')
  # shellcheck disable=SC2086
  $LN bakemacaroon --save_to "/creds/$name.tmp" $perms >/dev/null
  mv "/creds/$name.tmp" "/creds/$name"
  echo "baked $name: $perms"
done
chmod 0444 /creds/*
