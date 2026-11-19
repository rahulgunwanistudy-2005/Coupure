#!/usr/bin/env bash
# Pull or plug the cable: scripts/island.sh cut|restore|state   (needs DEMO_MODE=1)
# shellcheck source=scripts/lib.sh
source "$(dirname "$0")/lib.sh"
action=${1:-state}
case $action in
  cut | restore) method=POST ;;
  state) method=GET ;;
  *) die "usage: $0 cut|restore|state" ;;
esac
"${DC[@]}" exec -T -e ACTION="$action" -e METHOD="$method" uplink python - <<'PY'
import http.client, json, os
c = http.client.HTTPConnection("127.0.0.1", 8099, timeout=5)
c.request(os.environ["METHOD"], "/" + os.environ["ACTION"], headers={"Authorization": "Bearer " + os.environ["UPLINK_TOKEN"]})
r = c.getresponse()
print(json.dumps(json.loads(r.read()), indent=1))
raise SystemExit(0 if r.status == 200 else 1)
PY
