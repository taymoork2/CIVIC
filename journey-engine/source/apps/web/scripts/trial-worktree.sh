#!/bin/sh
# Production trial build of the A Laundered Closet redesign, for the phone over Tailscale.
# Uses this worktree's own Convex backend (127.0.0.1:3220, started by dev-worktree.sh, which must be running).
# Tailnet mapping: https :443 -> 127.0.0.1:3006 (web), :10444 -> 127.0.0.1:3220 (Convex).
# The owner moved the phone app to 443; preserve the existing backend and other routes.
set -eu
WEB="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)"
cd "$WEB"
HOST=macbook-pro.tail221f42.ts.net
TRIAL="https://$HOST"
CONVEX="$WEB/node_modules/.bin/convex"
VITE="$WEB/node_modules/.bin/vite"
BACKEND_URL="$(sed -n 's/^VITE_CONVEX_URL=//p' .env.local)"
curl --fail --silent "$BACKEND_URL/version" >/dev/null || { echo "Convex backend $BACKEND_URL is not up: start laundered-closet-dev first." >&2; exit 1; }
unset CONVEX_DEPLOYMENT CONVEX_SELF_HOSTED_URL CONVEX_SELF_HOSTED_ADMIN_KEY CONVEX_DEPLOY_KEY
export CONVEX_AGENT_MODE=anonymous
# Auth answers on the trial origin; the local HMR server and this preview stay trusted too.
"$CONVEX" env set SITE_URL "$TRIAL" >/dev/null 2>&1
"$CONVEX" env set WASHCLOSET_TRUSTED_ORIGINS "$TRIAL,https://$HOST:10443,http://127.0.0.1:3005,http://localhost:3005,http://127.0.0.1:3006" >/dev/null 2>&1
mkdir -p .data
echo "Building (log .data/trial-build.log)"
VITE_CONVEX_REMOTE_PORT=10444 WASHCLOSET_BUILD_ID="$(date +%Y%m%d%H%M%S)" "$VITE" build > .data/trial-build.log 2>&1 || { tail -40 .data/trial-build.log >&2; exit 1; }
echo "Trial: $TRIAL   (local: http://127.0.0.1:3006)"
caffeinate -dimsu -w $$ &
NODE_ENV=production "$VITE" preview --host 127.0.0.1 --port 3006 --strictPort
