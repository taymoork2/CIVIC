#!/usr/bin/env node
// Runs CIVIC's review on a Laundry checkout of its own (decision 0010), instead of the copy of Laundry
// in journey-engine/source. Any branch or worktree works, each on its own port.
//
//   bin/civic-laundry attach <laundry-checkout> [--replace]   copy Laundry's adapter in and link CIVIC's packages
//   bin/civic-laundry review <laundry-checkout> [--port 3010] start the review server for that checkout
//
// attach copies the adapter files listed below from CIVIC's copy of Laundry, links @civic/canvas,
// @civic/shell and @civic/vite-connector from this CIVIC checkout into the app's node_modules, and
// keeps review's working data out of git status. It changes no file Laundry already tracks unless
// --replace is given, and never one with uncommitted changes. No model calls.

import { execFileSync, spawn } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, appendFileSync, rmSync, statSync, symlinkSync, lstatSync, readlinkSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const civic = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const copy = join(civic, 'journey-engine/source')
const packages = ['canvas', 'shell', 'vite-connector']

// Laundry's adapter: everything review needs that Laundry's app doesn't already have. Directories are copied whole.
const ADAPTER = [
  'civic.project.json',
  'docs/design/review-product',
  'apps/web/src/review',
  ...readdirSync(join(copy, 'apps/web/scripts')).filter((name) => name.startsWith('review-')).map((name) => `apps/web/scripts/${name}`),
  ...readdirSync(join(copy, 'apps/web/e2e')).filter((name) => name.startsWith('review-')).map((name) => `apps/web/e2e/${name}`),
]
const REVIEW_CONFIG = 'apps/web/vite.review.config.ts'
const IGNORED = ['.review-data/', 'rehearsal-projects/', '.vite-runtime-*/']

const fail = (message) => { console.error(`civic-laundry: ${message}`); process.exit(1) }
const [command, target, ...rest] = process.argv.slice(2)
if (!['attach', 'review'].includes(command) || !target) fail('usage: bin/civic-laundry attach|review <laundry-checkout> [--replace] [--port <n>]')
const app = resolve(target)
const web = join(app, 'apps/web')
if (!existsSync(join(web, 'vite.config.ts')) || !existsSync(join(app, 'convex'))) fail(`${app} doesn't look like a Laundry checkout (no apps/web/vite.config.ts or convex/).`)
const git = (...args) => execFileSync('git', ['-C', app, ...args], { encoding: 'utf8' }).trim()

const filesUnder = (root, path) => {
  const full = join(root, path)
  if (!existsSync(full)) return []
  if (!statSync(full).isDirectory()) return [path]
  return readdirSync(full, { recursive: true }).map((name) => join(path, String(name))).filter((name) => statSync(join(root, name)).isFile())
}

/** Points app/apps/web/node_modules/@civic/<name> at this CIVIC checkout's package. pnpm install in Laundry removes the links, so review re-links. */
function link() {
  if (!existsSync(join(civic, 'packages/node_modules'))) fail(`CIVIC's packages aren't installed. Run: (cd ${relative(process.cwd(), join(civic, 'packages')) || '.'} && pnpm install --frozen-lockfile)`)
  if (!existsSync(join(web, 'node_modules'))) fail(`Laundry's dependencies aren't installed. Run: (cd ${app} && pnpm install)`)
  const scope = join(web, 'node_modules/@civic')
  mkdirSync(scope, { recursive: true })
  for (const name of packages) {
    const to = join(civic, 'packages', name)
    const at = join(scope, name)
    if (existsSync(at) || isLink(at)) {
      if (isLink(at) && resolve(scope, readlinkSync(at)) === to) continue
      rmSync(at, { recursive: true, force: true })
    }
    symlinkSync(to, at, 'dir')
  }
}
const isLink = (path) => { try { return lstatSync(path).isSymbolicLink() } catch { return false } }

function attach() {
  const replace = rest.includes('--replace')
  const files = [...ADAPTER.flatMap((path) => filesUnder(copy, path)).map((path) => ({ path, from: join(copy, path) })), { path: REVIEW_CONFIG, from: join(civic, 'integrations/laundry/vite.review.config.ts') }]
  const tracked = new Set(git('ls-files').split('\n'))
  const dirty = new Set(execFileSync('git', ['-C', app, 'status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).split('\n').filter(Boolean).map((line) => line.slice(3)))
  const changes = files.filter(({ path, from }) => !existsSync(join(app, path)) || !readFileSync(join(app, path)).equals(readFileSync(from)))
  const blocked = changes.filter(({ path }) => dirty.has(path))
  if (blocked.length) fail(`these files have uncommitted changes; commit or stash them first:\n  ${blocked.map((file) => file.path).join('\n  ')}`)
  const replacing = changes.filter(({ path }) => tracked.has(path))
  if (replacing.length && !replace) fail(`this branch already tracks ${replacing.length} review file(s) that differ from CIVIC's adapter, for example ${replacing.slice(0, 3).map((file) => file.path).join(', ')}.\nRerun with --replace to take CIVIC's versions; git keeps the old ones.`)
  for (const { path, from } of changes) { mkdirSync(dirname(join(app, path)), { recursive: true }); cpSync(from, join(app, path)) }

  // Review's working data stays out of git status, in this clone only.
  const exclude = join(git('rev-parse', '--path-format=absolute', '--git-common-dir'), 'info/exclude')
  const ignored = IGNORED.filter((pattern) => { try { git('check-ignore', '-q', '--no-index', pattern.replace('*', 'x')); return false } catch { return true } })
  if (ignored.length) { mkdirSync(dirname(exclude), { recursive: true }); appendFileSync(exclude, `\n# CIVIC review (bin/civic-laundry)\n${ignored.join('\n')}\n`) }

  // Fixture snapshots the canvas starts from.
  const fixtures = join(app, '.review-data/fixtures')
  mkdirSync(fixtures, { recursive: true })
  for (const name of readdirSync(join(civic, 'journey-engine/fixtures')).filter((name) => name.endsWith('.png'))) if (!existsSync(join(fixtures, name))) cpSync(join(civic, 'journey-engine/fixtures', name), join(fixtures, name))

  link()
  try { git('config', 'user.email') } catch { console.warn('Set git user.email in this checkout: review notes are written as that person, and saving one fails without it.') }
  console.log(`Attached CIVIC (${execFileSync('git', ['-C', civic, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim()}) to ${app} on ${git('rev-parse', '--abbrev-ref', 'HEAD')}.`)
  console.log(changes.length ? `${changes.length} adapter file(s) written${replacing.length ? `, ${replacing.length} of them replacing tracked files` : ''}. They are Laundry's to commit or leave untracked; git status lists them.` : 'The adapter was already current.')
  console.log(`Next: bin/civic-laundry review ${target}`)
}

function review() {
  if (!existsSync(join(web, 'vite.review.config.ts'))) fail(`run bin/civic-laundry attach ${target} first.`)
  link()
  const at = rest.indexOf('--port')
  const port = at >= 0 ? rest[at + 1] : process.env.PORT ?? '3010'
  const vite = join(web, 'node_modules/.bin/vite')
  if (!existsSync(vite)) fail(`no Vite in ${web}/node_modules; run pnpm install in the checkout.`)
  console.log(`Review for ${app} (${git('rev-parse', '--abbrev-ref', 'HEAD')} at ${git('rev-parse', '--short', 'HEAD')}): http://127.0.0.1:${port}/review`)
  const child = spawn(vite, ['dev', '--config', 'vite.review.config.ts', '--host', '127.0.0.1', '--port', port, '--strictPort'], {
    cwd: web,
    stdio: 'inherit',
    env: {
      ...process.env,
      WASHCLOSET_REVIEW: '1',
      VITE_CONVEX_URL: 'http://127.0.0.1:1',
      VITE_CONVEX_SITE_URL: 'http://127.0.0.1:1',
      CIVIC_ROOT: civic,
      WASHCLOSET_REVIEW_DESIGN: process.env.WASHCLOSET_REVIEW_DESIGN ?? join(civic, 'journey-engine/design/laundry-reference'),
    },
  })
  child.on('exit', (code) => process.exit(code ?? 0))
}

command === 'attach' ? attach() : review()
