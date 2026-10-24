#!/usr/bin/env node
// `civic doctor` and `civic demo`: the first ten minutes for someone who just cloned CIVIC. No dependencies, so it
// runs before anything is installed.
//
//   civic doctor                          checks Node, git, pnpm, Chrome and the install, and says how to fix what is missing
//   civic demo [--project <civic.json>] [--port 3020]
//                                         installs the canvas packages if needed and opens the Notebook example (or your app)
//   civic desktop [--project <civic.json>] the same in the CIVIC desktop window; Electron is downloaded on first run
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = join(dirname(fileURLToPath(import.meta.url)), '..')
const MIN_NODE = [22, 18] // the first Node 22 that runs .ts files without a flag, which the civic CLI relies on
const ELECTRON = 'electron@45' // the major the desktop host was written against
const CHROME = ['/Applications/Google Chrome.app', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/snap/bin/chromium']

const has = (command) => spawnSync(command, ['--version'], { stdio: 'ignore' }).status === 0

/** What this machine has, as plain facts. */
export function gather(env = process.env) {
  return {
    node: process.versions.node,
    git: has('git'),
    pnpm: has('pnpm'),
    chrome: Boolean(env.CIVIC_BROWSER_PATH) || CHROME.some(existsSync),
    installed: existsSync(join(repo, 'packages/node_modules')),
  }
}

/** One line per check: `ok` says whether it passes, `required` whether `civic demo` cannot work without it. */
export function judge(facts) {
  const [major = 0, minor = 0] = facts.node.split('.').map(Number)
  return [
    { name: 'Node.js', ok: major > MIN_NODE[0] || (major === MIN_NODE[0] && minor >= MIN_NODE[1]), required: true, found: facts.node, fix: 'Install Node 26 (22.18 or newer also works) from https://nodejs.org' },
    { name: 'git', ok: facts.git, required: true, fix: 'Install git from https://git-scm.com' },
    { name: 'pnpm', ok: facts.pnpm, required: true, fix: 'Run: corepack enable pnpm (or npm install -g pnpm)' },
    { name: 'Google Chrome', ok: facts.chrome, required: false, fix: 'Install Chrome for screen snapshots and annotations from the overlay; set CIVIC_BROWSER_PATH to use another Chromium' },
    { name: 'CIVIC packages installed', ok: facts.installed, required: false, fix: 'Run: civic demo (it installs them)' },
  ]
}

function doctor() {
  const rows = judge(gather())
  for (const row of rows) console.log(`${row.ok ? '✔' : row.required ? '✘' : '!'} ${row.name}${row.found ? ` ${row.found}` : ''}${row.ok ? '' : `: ${row.fix}`}`)
  const blocked = rows.some((row) => row.required && !row.ok)
  console.log(blocked ? '\nFix the ✘ lines, then run civic doctor again.' : '\nReady. Try: civic demo')
  return blocked ? 1 : 0
}

const packages = join(repo, 'packages')

/** Nonzero when this machine cannot run CIVIC yet; installs the canvas packages on the first run. */
function prepare() {
  if (judge(gather()).some((row) => row.required && !row.ok)) {
    console.error('CIVIC cannot start yet.\n')
    return doctor()
  }
  if (existsSync(join(packages, 'node_modules'))) return 0
  console.log('Installing the canvas packages (first run only)...')
  return spawnSync('pnpm', ['install', '--frozen-lockfile'], { cwd: packages, stdio: 'inherit' }).status ?? 1
}

function demo(args) {
  const failed = prepare()
  if (failed) return failed
  const own = args.includes('--project')
  // The bundled example keeps the older manifest name, so its rename notice is hidden; your own app still gets it.
  const flags = own ? [] : ['--disable-warning=CIVIC_MANIFEST_NAME'], example = own ? [] : ['--project', join(packages, 'canvas/examples/notebook/civic.project.json')]
  console.log('Starting the canvas. Open the address it prints, and press Ctrl+C to stop.')
  return spawnSync(process.execPath, [...flags, join(packages, 'canvas/bin/civic-canvas.mjs'), ...example, ...args], { stdio: 'inherit' }).status ?? 1
}

/** Opens the desktop window on a local server of its own, and stops that server when the window closes. */
async function desktop(args) {
  const failed = prepare()
  if (failed) return failed
  const store = process.env.CIVIC_LOCAL_STORE ?? join(homedir(), '.civic', 'desktop')
  const port = process.env.CIVIC_LOCAL_PORT ?? '3030' // 3012 is refused for a non-default store
  const at = args.indexOf('--project')
  const env = { ...process.env, CIVIC_LOCAL_STORE: store, CIVIC_LOCAL_PORT: port, CIVIC_PROJECT: at >= 0 ? args[at + 1] : join(packages, 'canvas/examples/notebook/civic.project.json') }
  delete env.ELECTRON_RUN_AS_NODE
  const folder = join(store, 'electron')
  if (!existsSync(join(folder, 'node_modules/electron'))) {
    console.log(`Downloading Electron (first run only, about 100 MB) into ${folder}...`)
    const got = spawnSync('npm', ['install', '--prefix', folder, ELECTRON, '--no-audit', '--no-fund', '--loglevel=error'], { stdio: 'inherit' })
    if (got.status !== 0) return got.status ?? 1
  }
  const binary = createRequire(join(folder, 'x.js'))('electron')
  // Always start our own server: whatever already answers on the port is not trusted, and start.mjs refuses a taken port.
  const started = spawnSync(process.execPath, [join(packages, 'local/start.mjs')], { env, stdio: 'inherit' })
  if (started.status !== 0) return (console.error(`The CIVIC server did not start. If port ${port} is in use (another civic desktop?), close it or set CIVIC_LOCAL_PORT.`), started.status ?? 1)
  const window = spawnSync(binary, [join(packages, 'local/desktop.mjs')], { env: { ...env, CIVIC_DESKTOP_ORIGIN: `http://127.0.0.1:${port}` }, stdio: 'inherit' })
  try { process.kill(JSON.parse(readFileSync(join(store, 'runtime.json'), 'utf8')).pid, 'SIGTERM') } catch (error) { console.error(`Could not stop the CIVIC server; see ${join(store, 'runtime.json')}: ${error.message}`) }
  return window.status ?? 1
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [command, ...args] = process.argv.slice(2)
  process.exit(command === 'doctor' ? doctor() : command === 'demo' ? demo(args) : command === 'desktop' ? await desktop(args) : (console.error('Usage: civic doctor | civic demo | civic desktop [--project <civic.json>] [--port 3020, demo only]'), 2))
}
