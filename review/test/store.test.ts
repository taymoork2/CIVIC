import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { test } from 'node:test'
import { Store } from '../src/index.ts'

const run = promisify(execFile)

test('concurrent writers from several processes never lose each other\'s records', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'civic-store-'))
  const writer = new URL('./fixtures/write-actor.ts', import.meta.url).pathname
  await Promise.all(Array.from({ length: 8 }, (_, index) => run(process.execPath, [writer, dir, String(index)])))
  const ids = new Store(dir).read().records.map((record) => record.id).sort()
  assert.deepEqual(ids, Array.from({ length: 8 }, (_, index) => `actor:person.p${index}`).sort())
})

test('a write the graph refuses is never stored', () => {
  const store = new Store(mkdtempSync(join(tmpdir(), 'civic-store-')))
  store.transact((document) => { document.records.push({ id: 'actor:person.a', kind: 'actor', title: 'A', type: 'person', handle: 'a' }) })
  assert.throws(() => store.transact((document) => {
    document.records.push({ id: 'actor:agent.x', kind: 'actor', title: 'X', type: 'agent', handle: 'x' })
  }), /agent always acts for a named person/)
  assert.deepEqual(store.read().records.map((record) => record.id), ['actor:person.a'])
})

test('captures are content-addressed and written once', () => {
  const store = new Store(mkdtempSync(join(tmpdir(), 'civic-store-')))
  const first = store.putCapture(Buffer.from('same'), 'image/png')
  const second = store.putCapture(Buffer.from('same'), 'image/png')
  assert.deepEqual(first, second)
  assert.equal(readdirSync(join(store.dir, 'captures')).length, 1)
  assert.equal(readFileSync(store.capturePath(first), 'utf8'), 'same')
})

// Decision 0006: CIVIC makes no model calls. The loop imports Node, the graph, and Playwright for capture, nothing else.
test('the review loop imports only Node built-ins, the graph and playwright-core', () => {
  const sourceDir = new URL('../src/', import.meta.url).pathname
  const graphDir = new URL('../../graph/src/', import.meta.url).pathname
  const files = (readdirSync(sourceDir, { recursive: true }) as string[]).filter((name) => /\.(ts|js)$/.test(name))
  assert.ok(files.includes(join('overlay', 'server.ts')))
  for (const name of files) {
    for (const match of readFileSync(join(sourceDir, name), 'utf8').matchAll(/from\s+'([^']+)'|import\('([^']+)'\)/g)) {
      const specifier = (match[1] ?? match[2])!
      const target = specifier.startsWith('.') ? resolve(sourceDir, dirname(name), specifier) : undefined
      const allowed = specifier.startsWith('node:') || specifier === 'playwright-core' || (target !== undefined && (target.startsWith(sourceDir) || target.startsWith(graphDir)))
      assert.ok(allowed, `${name} imports ${specifier}`)
    }
  }
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { dependencies: Record<string, string> }
  assert.deepEqual(Object.keys(manifest.dependencies), ['playwright-core'])
})
