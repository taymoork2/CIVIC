import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, symlinkSync, realpathSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { retainPreviewBuilds } from './preview-retention.mjs'

const published = 'builds/aaaaaaaaaaaaaaaa-11111111'
const running = 'builds/bbbbbbbbbbbbbbbb-22222222'
const old = 'builds/cccccccccccccccc-33333333'

function fixture() {
  assert.ok(process.env.TMPDIR, 'Run through bin/with-temp-root.mjs')
  const store = realpathSync(mkdtempSync(join(process.env.TMPDIR, 'retention-')))
  mkdirSync(join(store, 'projects'))
  function project(name, root = join(store, 'source', name)) {
    const path = join(store, 'projects', name)
    for (const build of [published, running, old]) {
      mkdirSync(join(path, build), { recursive: true })
      writeFileSync(join(path, build, 'index.html'), 'preview')
    }
    writeFileSync(join(path, 'receipt.json'), JSON.stringify({ root, worktreeHash: 'a'.repeat(16), worktreeBuild: published, ui: published, dirty: true }))
    return { path, root }
  }
  return { store, project }
}

test('removes stale projects and superseded builds, preserving published and leased builds', () => {
  const { store, project } = fixture()
  const stale = project('stale'), live = project('live'), leased = project('leased')
  const result = retainPreviewBuilds(store, { live: new Set([live.root]), inUse: new Set([join(live.path, running), join(leased.path, old)]) })
  assert.deepEqual(result.refused, [])
  assert.deepEqual(new Set(result.removed.map(item => item.path)), new Set([stale.path, join(live.path, old)]))
  assert.ok(result.bytes > 28)
  assert.equal(result.bytes, result.removed.reduce((sum, item) => sum + item.bytes, 0))
  assert.equal(existsSync(stale.path), false)
  assert.equal(existsSync(join(live.path, old)), false)
  for (const path of [join(live.path, published), join(live.path, running), leased.path]) assert.ok(existsSync(path))
  assert.equal(retainPreviewBuilds(store, { live: [live.root], inUse: [join(leased.path, old), join(live.path, running)] }).bytes, 0)
})

test('foreign and legacy receipts are untouched', () => {
  const { store, project } = fixture()
  const foreign = join(store, 'projects', 'foreign')
  mkdirSync(foreign)
  const legacy = project('legacy')
  writeFileSync(join(legacy.path, 'receipt.json'), '{}')
  const result = retainPreviewBuilds(store, { live: [], inUse: [] })
  assert.deepEqual(result.removed, [])
  assert.ok(existsSync(foreign))
  assert.ok(existsSync(legacy.path))
})

test('refuses project, receipt and store symlinks; removes links inside a build without following them', () => {
  const { store, project } = fixture()
  const target = project('target'), nested = project('nested')
  symlinkSync(target.path, join(store, 'projects', 'linked'))
  symlinkSync(target.path, join(nested.path, old, 'linked'))
  const receiptLink = join(store, 'projects', 'receipt-link')
  mkdirSync(receiptLink)
  symlinkSync(join(target.path, 'receipt.json'), join(receiptLink, 'receipt.json'))
  const result = retainPreviewBuilds(store, { live: [target.root], inUse: [] })
  assert.equal(result.refused.length, 2)
  assert.equal(existsSync(join(nested.path, old)), false)
  assert.ok(existsSync(join(target.path, published, 'index.html')))
  symlinkSync(store, join(store, 'alias'))
  assert.throws(() => retainPreviewBuilds(join(store, 'alias'), { live: [], inUse: [] }), /Symlink/)
})

test('rejects outside in-use paths, root and empty operands, and escaping receipts', () => {
  const { store, project } = fixture()
  const own = project('own')
  for (const path of ['', '/']) assert.throws(() => retainPreviewBuilds(path, { live: [], inUse: [] }), /Invalid preview store/)
  assert.throws(() => retainPreviewBuilds(store, { live: [], inUse: [store] }), /outside projects/)
  writeFileSync(join(own.path, 'receipt.json'), JSON.stringify({ root: own.root, worktreeHash: 'hash', worktreeBuild: '../../outside' }))
  assert.equal(retainPreviewBuilds(store, { live: [own.root], inUse: [] }).removed.length, 0)
  assert.ok(existsSync(join(own.path, old)))
})

test('scan budget fails closed before deleting an oversized candidate', () => {
  const { store, project } = fixture()
  const own = project('large')
  for (let i = 0; i < 100; i++) writeFileSync(join(own.path, old, String(i)), '')
  const result = retainPreviewBuilds(store, { live: [], inUse: [], limit: 50 })
  assert.deepEqual(result.removed, [])
  assert.match(result.refused[0].reason, /scan limit/)
  assert.ok(existsSync(own.path))
})

test('an unavailable published build prevents live-project pruning', () => {
  const { store, project } = fixture()
  const own = project('unpublished')
  // This fixture directory was created here, inside the wrapper-owned temporary root.
  rmSync(join(own.path, published), { recursive: true })
  assert.deepEqual(retainPreviewBuilds(store, { live: [own.root], inUse: [] }).removed, [])
  assert.ok(existsSync(join(own.path, old)))
})
