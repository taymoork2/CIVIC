#!/bin/sh
# Runs WashCloset for real use on this Mac: the local Convex backend plus a production web build.
#
# With Tailscale installed and signed in, it also publishes the app privately to your tailnet over
# HTTPS, so a phone on cellular (also signed in to Tailscale) can use it from the laundry room:
#   https://<this-mac>.<tailnet>.ts.net        -> web app (port 3000)
#   https://<this-mac>.<tailnet>.ts.net:8443   -> this worktree's Convex backend
# Nothing is exposed to the public internet. The Mac is kept awake while this runs.
set -eu

WEB_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)"
cd "$WEB_DIR"
mkdir -p .data
if [ -L .env.local ] || [ -L .convex/local/default ]; then
  echo "Trial startup needs a worktree-owned .env.local and local Convex state; cross-checkout links must be separated first." >&2
  exit 1
fi
CONVEX="$WEB_DIR/node_modules/.bin/convex"
VITE="$WEB_DIR/node_modules/.bin/vite"
export CONVEX_AGENT_MODE=anonymous

say() { printf '\n==> %s\n' "$1"; }

tailscale_cli() {
  if command -v tailscale >/dev/null 2>&1; then echo tailscale
  elif [ -x /Applications/Tailscale.app/Contents/MacOS/Tailscale ]; then echo /Applications/Tailscale.app/Contents/MacOS/Tailscale
  fi
}

say "Starting the local Convex backend"
if [ -f .data/convex.log ]; then
  mv .data/convex.log ".data/convex-$(date +%Y%m%d%H%M%S).log"
fi
"$CONVEX" dev --codegen disable --typecheck disable --tail-logs disable >> .data/convex.log 2>&1 &
CONVEX_PID=$!
cleanup() {
  BACKEND_PIDS="$(pgrep -P "$CONVEX_PID" || true)"
  kill "$CONVEX_PID" 2>/dev/null || true
  if [ -n "$BACKEND_PIDS" ]; then kill $BACKEND_PIDS 2>/dev/null || true; fi
}
trap cleanup EXIT INT TERM
i=0
until BACKEND_URL="$(sed -n 's/^VITE_CONVEX_URL=//p' .env.local 2>/dev/null)" && [ -n "$BACKEND_URL" ] && curl --fail --silent "$BACKEND_URL/version" >/dev/null; do
  i=$((i + 1)); [ "$i" -le 90 ] || { echo "Convex did not start; see .data/convex.log" >&2; exit 1; }
  sleep 1
done

# Where the app is reached: localhost, the local review preview, and the tailnet name when available.
ORIGINS="http://localhost:3000,http://localhost:3002"
SITE_URL="http://localhost:3000"
TS="$(tailscale_cli || true)"
if [ -n "$TS" ] && "$TS" status >/dev/null 2>&1; then
  HOST="$("$TS" status --json | sed -n 's/.*"DNSName": *"\([^"]*\)\.".*/\1/p' | head -n 1)"
  if [ -n "$HOST" ]; then
    say "Publishing privately on your tailnet: https://$HOST"
    "$TS" serve --bg --https=443 http://127.0.0.1:3000 >/dev/null
    "$TS" serve --bg --https=8443 "$BACKEND_URL" >/dev/null
    SITE_URL="https://$HOST"
    ORIGINS="$ORIGINS,https://$HOST"
  fi
else
  echo "Tailscale is not installed or not signed in: the app is reachable from this Mac only."
fi

say "Configuring the backend"
setting() { "$CONVEX" env get "$1" 2>/dev/null | tail -n 1; }
[ -n "$(setting BETTER_AUTH_SECRET)" ] || "$CONVEX" env set BETTER_AUTH_SECRET "$(openssl rand -hex 32)" >/dev/null 2>&1
[ -n "$(setting WASHCLOSET_PHOTO_URL_SECRET)" ] || "$CONVEX" env set WASHCLOSET_PHOTO_URL_SECRET "$(openssl rand -hex 32)" >/dev/null 2>&1
"$CONVEX" env set SITE_URL "$SITE_URL" >/dev/null 2>&1
"$CONVEX" env set WASHCLOSET_TRUSTED_ORIGINS "$ORIGINS" >/dev/null 2>&1
# Only this run's log counts; a second dev process would compete for the backend.
i=0
until grep -q 'Convex functions ready' .data/convex.log; do
  i=$((i + 1))
  if ! kill -0 "$CONVEX_PID" 2>/dev/null || [ "$i" -gt 90 ]; then
    echo "Functions did not deploy; see .data/convex.log" >&2
    exit 1
  fi
  sleep 1
done

say "Building the web app"
WASHCLOSET_BUILD_ID="$(date +%Y%m%d%H%M%S)" "$VITE" build > .data/build.log 2>&1 || { cat .data/build.log >&2; exit 1; }

say "WashCloset is running (Ctrl-C to stop)"
echo "  This Mac: http://localhost:3000"
[ "$SITE_URL" = "http://localhost:3000" ] || echo "  Phone:    $SITE_URL"
caffeinate -dimsu -w $$ &
# Bind IPv4 loopback explicitly: Tailscale forwards to 127.0.0.1, and "localhost" can resolve to ::1 only.
NODE_ENV=production "$VITE" preview --host 127.0.0.1 --port 3000 --strictPort
