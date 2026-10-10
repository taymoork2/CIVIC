#!/bin/sh
# Worktree-local HMR dev server for the A Laundered Closet redesign trial.
# Owns its own anonymous local Convex backend (127.0.0.1:3220/3221 by default, state in apps/web/.convex)
# and Vite dev on 127.0.0.1:3005. Loopback only: no tailnet serve, no public tunnel.
# Another worktree beside the trial picks free ports with WASHCLOSET_WEB_PORT, WASHCLOSET_CLOUD_PORT
# and WASHCLOSET_SITE_PORT; the port check below still refuses any port already in use.
# Never touches the 7e01 worktree's ports (3000/3004, Convex 3210/3211).
set -eu

WEB="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)"
ROOT="$(CDPATH= cd -- "$WEB/../.." && pwd -P)"
WEB_PORT="${WASHCLOSET_WEB_PORT:-3005}"
CLOUD_PORT="${WASHCLOSET_CLOUD_PORT:-3220}"
SITE_PORT="${WASHCLOSET_SITE_PORT:-3221}"

cd "$ROOT"
[ -d node_modules ] || pnpm install --frozen-lockfile

cd "$WEB"
mkdir -p .data
if [ -L .env.local ] || [ -L .convex/local/default ]; then
  echo "Refusing: .env.local or .convex/local/default is a link to another checkout." >&2
  exit 1
fi
for p in $WEB_PORT $CLOUD_PORT $SITE_PORT; do
  if lsof -nP -iTCP:$p -sTCP:LISTEN >/dev/null 2>&1; then echo "Port $p is already in use." >&2; exit 1; fi
done

# Anonymous agent mode: with no deployment selected, `convex dev` creates/reuses this worktree's own
# anonymous local deployment and honours --local-cloud-port/--local-site-port (convex 1.46 configure.js).
# (`--local` is deprecated in 1.46; `deployment select local` needs a logged-in project, not used here.)
unset CONVEX_DEPLOYMENT CONVEX_SELF_HOSTED_URL CONVEX_SELF_HOSTED_ADMIN_KEY CONVEX_DEPLOY_KEY
export CONVEX_AGENT_MODE=anonymous
CONVEX="$WEB/node_modules/.bin/convex"
VITE="$WEB/node_modules/.bin/vite"

: > .data/convex-dev.log
# Codegen stays on: this regenerates convex/_generated from the real functions.
"$CONVEX" dev --local-cloud-port $CLOUD_PORT --local-site-port $SITE_PORT --tail-logs disable >> .data/convex-dev.log 2>&1 &
CONVEX_PID=$!
cleanup() {
  CHILDREN="$(pgrep -P "$CONVEX_PID" || true)"
  kill "$CONVEX_PID" 2>/dev/null || true
  [ -z "$CHILDREN" ] || kill $CHILDREN 2>/dev/null || true
}
trap cleanup EXIT INT TERM

i=0
until BACKEND_URL="$(sed -n 's/^VITE_CONVEX_URL=//p' .env.local 2>/dev/null)" && [ -n "$BACKEND_URL" ] && curl --fail --silent "$BACKEND_URL/version" >/dev/null; do
  i=$((i + 1))
  if ! kill -0 "$CONVEX_PID" 2>/dev/null || [ "$i" -gt 120 ]; then echo "Convex did not start; see $WEB/.data/convex-dev.log" >&2; exit 1; fi
  sleep 1
done
i=0
until grep -q 'Convex functions ready' .data/convex-dev.log; do
  i=$((i + 1))
  if ! kill -0 "$CONVEX_PID" 2>/dev/null || [ "$i" -gt 120 ]; then echo "Functions did not deploy; see $WEB/.data/convex-dev.log" >&2; exit 1; fi
  sleep 1
done

setting() { "$CONVEX" env get "$1" 2>/dev/null | tail -n 1; }
[ -n "$(setting BETTER_AUTH_SECRET)" ] || "$CONVEX" env set BETTER_AUTH_SECRET "$(openssl rand -hex 32)" >/dev/null 2>&1
[ -n "$(setting WASHCLOSET_PHOTO_URL_SECRET)" ] || "$CONVEX" env set WASHCLOSET_PHOTO_URL_SECRET "$(openssl rand -hex 32)" >/dev/null 2>&1
"$CONVEX" env set SITE_URL "http://127.0.0.1:$WEB_PORT" >/dev/null 2>&1
"$CONVEX" env set WASHCLOSET_TRUSTED_ORIGINS "http://127.0.0.1:$WEB_PORT,http://localhost:$WEB_PORT" >/dev/null 2>&1
# Loopback-only dev: all callers share 127.0.0.1, so auth rate limiting would lock seeding and testing out.
"$CONVEX" env set WASHCLOSET_AUTH_RATE_LIMIT disabled >/dev/null 2>&1

echo "Convex backend: $BACKEND_URL (pid $CONVEX_PID, log $WEB/.data/convex-dev.log)"
echo "Web (HMR):      http://127.0.0.1:$WEB_PORT  (log $WEB/.data/vite-dev.log)"
echo "Shell pid:      $$   cwd: $WEB"
"$VITE" dev --host 127.0.0.1 --port $WEB_PORT --strictPort 2>&1 | tee .data/vite-dev.log
