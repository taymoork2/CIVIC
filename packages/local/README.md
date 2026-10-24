# CIVIC local desktop host

The local launcher serves the generic canvas and opens it in Electron. Projects
are selected through their manifests; no connected application is required by
CIVIC's source or startup.

From a clone, `bin/civic desktop` does all of this for you: it downloads Electron on first run, starts a
server on its own port and store, opens the window, and stops the server when the window closes. The
commands below are the manual route.

```sh
CIVIC_PROJECT=/absolute/project/civic.json pnpm --dir packages/local start
CIVIC_ELECTRON_BINARY=/absolute/Electron pnpm --dir packages/local desktop
```

The default loopback port is 3012. Use `CIVIC_LOCAL_PORT` and `CIVIC_LOCAL_STORE`
for an isolated instance. The store owns project connections, synthetic runtime
state, captures, reviews, and the Electron profile. Application sources remain
external and read-only. This source-backed Electron launcher is not a signed,
packaged application.

Optional integrations can provide a Vite configuration. Set `hostConfig` to its
absolute path in the store's ignored `local-config.json`. Keep adapter code,
private project assets, and acceptance reports outside tracked CIVIC content.
An integration owns its dependencies and project-specific runtime restrictions;
CIVIC's shared engine and default host stay independent of it.

The generic host supports manifest selection, isolated module runtimes, project
windows and tabs, and lease-based host cleanup. Electron uses sandboxed,
context-isolated views and accepts project navigation only through registered
loopback hosts. Window closing and checkout replacement preserve existing draft
confirmation guards.

Run `pnpm --dir packages/local test` for launcher and lifecycle checks. The
optional `test:desktop-settings` script uses synthetic projects and a temporary
Electron profile. Private integrations have separate local validation.
