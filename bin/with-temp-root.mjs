#!/usr/bin/env node
// Runs a command with a temporary folder of its own and removes that folder when the command ends:
//
//   node bin/with-temp-root.mjs <command> [args...]
//
// CIVIC's checks make temp folders, and an Electron run leaves a 30-110 MB profile in each, so
// without this a day of checks fills the disk. The command sees the folder as TMPDIR (and as
// CIVIC_TEMP_ROOT), so every mkdtemp inside it, in any package, lands there. Set CIVIC_KEEP_TEMP=1
// to keep the folder and print its path. Git inside the command never signs commits or tags, because
// checks commit to throwaway repositories and must not ask the owner's signing key (1Password) for
// each one; commits made outside this tool are unaffected. A run killed before it could clean up leaves its folder
// behind; the next run removes those, but only when the process that made one is no longer running.
//
// Deletion is recursive, so a folder is removed only if it is a real folder of ours, directly inside
// the temp folder, named civic-run-*, and carrying the marker file this tool wrote.
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { constants, tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'

const PREFIX = 'civic-run-'
const MARK = '.civic-temp-root'
const base = realpathSync(tmpdir())

/** What the marker says, for a folder this tool made; undefined for anything else. */
function ours(dir) {
  try {
    const inside = relative(base, dir)
    const info = lstatSync(dir)
    if (inside.includes(sep) || !inside.startsWith(PREFIX) || !info.isDirectory() || info.uid !== process.getuid?.()) return undefined
    const mark = JSON.parse(readFileSync(join(dir, MARK), 'utf8'))
    return Number.isInteger(mark.pid) ? mark : undefined
  } catch {
    return undefined
  }
}

function alive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code === 'EPERM'
  }
}

function remove(dir) {
  if (!ours(dir)) return console.error(`Not removing ${dir}: it is not a folder this tool made.`)
  rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
}

// Folders left by runs that were killed. One whose maker is still running, or that was kept on purpose, stays.
for (const name of readdirSync(base).filter((entry) => entry.startsWith(PREFIX))) {
  const mark = ours(join(base, name))
  if (mark && !mark.keep && !alive(mark.pid)) remove(join(base, name))
}

const [command, ...args] = process.argv.slice(2)
if (!command) {
  console.error('Usage: with-temp-root.mjs <command> [args...]')
  process.exit(2)
}
const keep = process.env.CIVIC_KEEP_TEMP === '1'
const root = join(base, `${PREFIX}${randomBytes(4).toString('hex')}`)
mkdirSync(root, { mode: 0o700 })
writeFileSync(join(root, MARK), JSON.stringify({ pid: process.pid, started: new Date().toISOString(), keep }))

let finished = false
function finish(code) {
  if (finished) return
  finished = true
  if (keep) console.error(`Kept the temp folder ${root}. Delete it when you are done.`)
  else remove(root)
  process.exit(code)
}

// Added after any GIT_CONFIG_* entries already set, which still apply.
const used = Number(process.env.GIT_CONFIG_COUNT ?? 0)
const noSigning = { GIT_CONFIG_COUNT: String(used + 2), [`GIT_CONFIG_KEY_${used}`]: 'commit.gpgsign', [`GIT_CONFIG_VALUE_${used}`]: 'false', [`GIT_CONFIG_KEY_${used + 1}`]: 'tag.gpgsign', [`GIT_CONFIG_VALUE_${used + 1}`]: 'false' }
const child = spawn(command, args, { stdio: 'inherit', env: { ...process.env, ...noSigning, TMPDIR: root, CIVIC_TEMP_ROOT: root } })
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => child.kill(signal))
child.on('error', (error) => {
  console.error(`Could not run ${command}: ${error.message}`)
  finish(127)
})
// A command ended by a signal exits 128 plus the signal's number, as a shell reports it.
child.on('close', (code, signal) => finish(code ?? 128 + (constants.signals[signal] ?? 0)))
