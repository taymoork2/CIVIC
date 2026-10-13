import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

// `bin/civic-laundry attach` on a stand-in Laundry checkout outside CIVIC's tree (decision 0010):
// the adapter goes in, CIVIC's packages are linked, Laundry's tracked files are left alone unless
// --replace is given, and a file with uncommitted changes is never overwritten.
const civic = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..')
const cli = join(civic, 'integrations/laundry/civic-laundry.mjs')
const attach = (app, ...args) => spawnSync(process.execPath, [cli, 'attach', app, ...args], { encoding: 'utf8' })

function checkout() {
  const app = mkdtempSync(join(tmpdir(), 'laundry-checkout-'))
  const git = (...args) => execFileSync('git', args, { cwd: app })
  git('init', '-q', '-b', 'feature'); git('config', 'user.email', 'reviewer@example.com'); git('config', 'user.name', 'Reviewer')
  mkdirSync(join(app, 'apps/web/node_modules'), { recursive: true }); mkdirSync(join(app, 'convex'))
  writeFileSync(join(app, 'apps/web/vite.config.ts'), 'export default {}\n')
  writeFileSync(join(app, '.gitignore'), 'node_modules/\n')
  git('add', '.'); git('commit', '-q', '-m', 'laundry')
  return { app, git }
}

test('attach copies the adapter and links CIVIC packages without touching tracked files', { skip: !existsSync(join(civic, 'packages/node_modules')) && 'CIVIC packages are not installed' }, () => {
  const { app, git } = checkout()
  const run = attach(app)
  assert.equal(run.status, 0, run.stderr)
  for (const file of ['civic.project.json', 'apps/web/src/review/canvas-extension.ts', 'apps/web/scripts/review-plugin.mjs', 'apps/web/vite.review.config.ts', 'docs/design/review-product/coverage.json']) assert.ok(existsSync(join(app, file)), file)
  for (const name of ['canvas', 'shell', 'vite-connector']) assert.equal(realpathSync(join(app, 'apps/web/node_modules/@civic', name)), realpathSync(join(civic, 'packages', name)))
  assert.equal(git('status', '--porcelain', '--untracked-files=no').toString(), '', 'no tracked file changes')
  assert.match(readFileSync(join(app, '.git/info/exclude'), 'utf8'), /\.review-data\//)
  assert.equal(git('status', '--porcelain', '--', '.review-data').toString(), '', 'review data stays out of git status')
  assert.equal(attach(app).status, 0, 'attaching again is a no-op')

  // A branch that already tracks a different review file needs --replace; one with uncommitted changes is refused.
  writeFileSync(join(app, 'civic.project.json'), '{}\n'); git('add', 'civic.project.json'); git('commit', '-q', '-m', 'old review')
  const refused = attach(app)
  assert.equal(refused.status, 1); assert.match(refused.stderr, /--replace/)
  writeFileSync(join(app, 'civic.project.json'), '{"local":true}\n')
  const dirty = attach(app, '--replace')
  assert.equal(dirty.status, 1); assert.match(dirty.stderr, /uncommitted changes/)
  git('checkout', 'civic.project.json')
  assert.equal(attach(app, '--replace').status, 0)
  assert.deepEqual(JSON.parse(readFileSync(join(app, 'civic.project.json'), 'utf8')).id, 'laundry-app')
})

test('attach refuses a folder that is not a Laundry checkout', () => {
  const run = attach(mkdtempSync(join(tmpdir(), 'not-laundry-')))
  assert.equal(run.status, 1)
  assert.match(run.stderr, /doesn't look like a Laundry checkout/)
})
