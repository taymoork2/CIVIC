# Getting started

CIVIC runs on your machine and makes no model calls. This page takes you from a fresh clone to reviewing your own app.

## 1. Check your machine and open the example

```sh
git clone https://github.com/taymoork2/CIVIC.git && cd CIVIC
bin/civic doctor
bin/civic demo
```

`doctor` needs [git](https://git-scm.com), [Node.js](https://nodejs.org) 22.18 or newer (26 recommended) and [pnpm](https://pnpm.io) (`corepack enable pnpm`), and tells you how to fix whatever is missing. Google Chrome is optional and is used for screen snapshots. To run `civic` from anywhere, link it: `ln -s "$PWD/bin/civic" /usr/local/bin/civic`.

`demo` installs the canvas packages the first time, then opens the Notebook example at `http://127.0.0.1:3020/review`. Play a journey, open a screen, and leave a comment on it. Press Ctrl+C to stop. Use `--port` if 3020 is taken.

## 2. The desktop window

```sh
bin/civic desktop
```

This opens the same canvas in the CIVIC desktop window, with tabs for each project. The first run downloads Electron (about 100 MB) into `~/.civic/desktop/electron`. It starts a local server on port 3030 (`CIVIC_LOCAL_PORT` changes it) and stops it when you close the window. The window is not a signed or packaged application; it is Electron run from your clone.

## Your own app

Open **Projects & versions** in the canvas, choose to connect an existing app, and enter the app's absolute folder path.

- **The app has a `civic.json`** (at its root or in `.civic/civic.json`). CIVIC connects it as it is.
- **The app has no manifest.** Give a source folder inside the app, such as `src`. CIVIC scans its `.html`, `.jsx` and `.tsx` files for screens, shows what it found, and lets you pick which become scenarios. The scan only reads files; it never runs your code. It is a heuristic, so expect to curate the list.
- **From the command line**, write a manifest and open it directly:

  ```sh
  node packages/vite-connector/src/review-project.mjs init --root /path/to/app --id my-app --name "My app" --source src --preview src/preview.ts --write
  bin/civic demo --project /path/to/app/civic.json      # or: bin/civic desktop --project /path/to/app/civic.json
  ```

Your app's source is read-only to CIVIC. Reviews, connections and snapshots go to `~/.civic`.

### Review a running app

If your app already runs on a loopback address, `civic review-app --upstream http://127.0.0.1:<port>` serves it with CIVIC's overlay in its pages, without changing the app. Press Alt+Shift+C in the page to comment on an element. See [Reviewing a running app](../review/README.md#reviewing-a-running-app). Run it inside the app's git checkout; comments are filed under its branch and revision.

## Hand a comment to an agent

Comments become work requests (`civic request`, or from the overlay) that a coding agent can claim, fix and report back. People resolve them; agents cannot. For Claude Code:

```text
/plugin marketplace add taymoork2/CIVIC
/plugin install civic@civic
```

Set `CIVIC_HOME` to your CIVIC clone before starting Claude Code. Codex works too; see the [plugin guide](../integrations/claude-code/README.md).

## What works today, and what doesn't

Works: the example apps, connecting an app by manifest or by scan, the desktop window, the overlay on a running app, the review-to-agent loop through the CLI and the Claude Code and Codex plugin.

Not yet:

- There is no installer or signed desktop app, so the desktop window needs the clone and Node.
- `bin/civic` is a bash script, so Windows needs WSL. Windows has not been tried.
- The first-run steps were checked on one macOS machine, not on a clean one.
- Screen discovery is static and heuristic, and live runs against a real backend need a runtime entry that only the bundled examples have.

## If something goes wrong

- `civic doctor` first.
- A port is busy: pass `--port` to `demo`, or set `CIVIC_LOCAL_PORT` for `desktop`.
- The Electron download failed: run `bin/civic desktop` again, or delete `~/.civic/desktop/electron` and retry.
- Anything else: send the output and `~/.civic/desktop/server.log`.
