import assert from 'node:assert/strict'
import { test } from 'node:test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { elements, diffRanges, parseSource } from '../src/elements.ts'
import { annotate, createRequest, readCheckout, Store } from '../src/index.ts'

test('source queries and diff ranges retain scenario and original location', () => {
  const captures = [{ scenario: 'screen', elements: [{ tag: 'button', source: 'src/view.tsx:4:2' }, { tag: 'div', source: 'src/view.tsx:8:1' }] }]
  assert.equal(elements(captures, 'src/view.tsx', [4, 4]).length, 1)
  assert.equal(elements(captures, 'other.tsx').length, 0)
  assert.equal(parseSource('../secret:1:1'), undefined)
  assert.equal(parseSource('/secret:1:1'), undefined)
  assert.equal(parseSource('src/a:0:1'), undefined)
  assert.deepEqual(diffRanges('+++ b/src/view.tsx\n@@ -2,2 +4,3 @@\n@@ -9 +12,0 @@'), [{ file: 'src/view.tsx', from: 4, to: 6 }])
})

test('annotation and request carry the code location at the observed revision', () => {
  const root = mkdtempSync(join(tmpdir(), 'civic-source-'))
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' })
  git('init', '-q', '-b', 'main')
  git('config', 'user.name', 'Test')
  git('config', 'user.email', 'test@example.com')
  writeFileSync(join(root, 'file'), 'test')
  git('add', '.')
  git('-c', 'commit.gpgsign=false', 'commit', '-qm', 'test: fixture')
  const checkout = readCheckout(root)
  const store = Store.forCheckout(checkout)
  const context = { checkout, store, identity: { type: 'person' as const, handle: 'tester' } }
  const source = { file: 'src/view.tsx', line: 4, column: 2 }
  const annotation = annotate(context, { comment: 'Change this', location: source, locator: { testId: 'button' } })
  const request = createRequest(context, { annotationIds: [annotation.id], ask: 'Fix it' })
  assert.deepEqual(request.location, { ...source, revision: checkout.head })
  assert.deepEqual((store.read().records.find(row => row.id === annotation.id) as { location?: unknown } | undefined)?.location, request.location)
  assert.throws(() => annotate(context, { comment: 'Invalid', location: { ...source, file: '../outside' }, locator: { testId: 'button' } }))
})
