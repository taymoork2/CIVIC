import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { annotate, moveStore, readCheckout, Store, type Context } from '../src/index.ts'

// Decision 0020: records live in the main checkout's .civic/, shared by every worktree, never inside .git.
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
const ignored = (cwd: string, path: string) => { try { git(cwd, 'check-ignore', '-q', path); return true } catch { return false } }

function repository() {
  const main = mkdtempSync(join(tmpdir(), 'civic-folder-'))
  git(main, 'init', '-q', '-b', 'main'); git(main, 'config', 'user.email', 'reviewer@example.com')
  writeFileSync(join(main, 'README'), 'x'); git(main, 'add', '.'); git(main, 'commit', '-q', '-m', 'init')
  const worktree = `${main}-fix`
  git(main, 'worktree', 'add', '-q', '-b', 'fix/label', worktree)
  const context = (cwd: string): Context => ({ store: Store.forCheckout(readCheckout(cwd)), checkout: readCheckout(cwd), identity: { type: 'person', handle: 'reviewer' } })
  return { main, worktree, context }
}

test('every worktree writes to the main checkout\'s .civic, which hides itself from git', () => {
  const { main, worktree, context } = repository()
  const fromWorktree = context(worktree)
  assert.equal(fromWorktree.store.dir, join(readCheckout(main).mainRoot, '.civic'))
  assert.equal(context(main).store.dir, fromWorktree.store.dir)

  annotate(fromWorktree, { comment: 'From the worktree.', image: { bytes: Buffer.from('png'), mediaType: 'image/png' } })
  assert.equal(context(main).store.read().records.filter((record) => record.kind === 'annotation').length, 1)
  assert.ok(!existsSync(join(readCheckout(main).commonDir, 'civic')), 'nothing is written inside .git')
  assert.equal(git(main, 'status', '--porcelain'), '')
  assert.ok(ignored(main, '.civic/records.graph.json') && ignored(main, '.civic/captures/x.png'))
  assert.ok(!ignored(main, '.civic/civic.json'), 'the project file is the one thing a team commits')
})

test('move-store carries an earlier store out of .git, and can be run again', () => {
  const { main, context } = repository()
  const checkout = readCheckout(main)
  const old = new Store(join(checkout.commonDir, 'civic'))
  const annotation = annotate({ ...context(main), store: old }, { comment: 'Kept in .git before.', image: { bytes: Buffer.from('png'), mediaType: 'image/png' } })
  const before = readFileSync(old.file, 'utf8')

  const result = moveStore(checkout)
  assert.deepEqual(result.moved.sort(), [`captures/${annotation.capture!.sha256}.png`, 'records.graph.json'])
  assert.ok(!existsSync(old.dir), 'the old store is gone')
  assert.equal(readFileSync(join(checkout.mainRoot, '.civic', 'records.graph.json'), 'utf8'), before)
  assert.ok(existsSync(context(main).store.capturePath(annotation.capture!)))

  assert.deepEqual(moveStore(checkout), { from: old.dir, to: join(checkout.mainRoot, '.civic'), moved: [], left: [] })
})

test('move-store refuses, changing nothing, when stores differ or one is in use', () => {
  const { main, context } = repository()
  const checkout = readCheckout(main)
  const old = new Store(join(checkout.commonDir, 'civic'))
  annotate({ ...context(main), store: old }, { comment: 'Old.', image: { bytes: Buffer.from('old'), mediaType: 'image/png' } })
  annotate(context(main), { comment: 'New, written since.', image: { bytes: Buffer.from('new'), mediaType: 'image/png' } })
  assert.throws(() => moveStore(checkout), /hold records\.graph\.json, with different contents/)
  assert.ok(existsSync(old.file))

  mkdirSync(join(old.dir, 'lock'))
  assert.throws(() => moveStore(checkout), /civic command is running/)
})
