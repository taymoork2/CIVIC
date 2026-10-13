import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { civicShared } from './review-civic.mjs'

// The connector's link to CIVIC's shared store (decision 0007), run against CIVIC's real
// CLI in a throwaway repository: a canvas note becomes an anchored annotation, and handing it
// off makes a work request any worktree can claim.
const civicRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..')

test('a canvas note becomes a shared annotation and can be handed to an agent', async () => {
  const repo = mkdtempSync(join(tmpdir(), 'laundry-civic-'))
  const git = (...args) => execFileSync('git', args, { cwd: repo })
  git('init', '-q', '-b', 'main'); git('config', 'user.email', 'reviewer@example.com'); git('config', 'civic.handle', 'reviewer')
  writeFileSync(join(repo, 'README'), 'x'); git('add', '.'); git('commit', '-q', '-m', 'init')
  const shared = civicShared({ repo, product: 'laundry', civicRoot })
  assert.ok(shared, 'the civic CLI is found at the CIVIC repository root')

  const context = { scenario: 'intake.pack.color', persona: 'single', role: 'owner', condition: 'normal', theme: 'light', textScale: 2, viewport: { width: 393, height: 852 } }
  const element = await shared.record({ feedback: { message: 'Continue is hard to find.', context, anchor: { label: 'Continue', x: 0.1, y: 0.8, width: 0.8, height: 0.05, locator: { role: 'button', name: 'Continue' } } }, screenshot: Buffer.from('png'), origin: 'http://127.0.0.1:3010' })
  const screen = await shared.record({ feedback: { message: 'Whole step is confusing.', context, anchor: { label: 'Whole screen', x: 0, y: 0, width: 1, height: 1 } }, screenshot: Buffer.from('png2'), origin: 'http://127.0.0.1:3010' })

  const { current, annotations } = await shared.list()
  assert.equal(current, 'line:git.main')
  const byId = Object.fromEntries(annotations.map((entry) => [entry.annotation.id, entry.annotation]))
  assert.deepEqual(byId[element].anchor.locator, { role: 'button', name: 'Continue' })
  assert.deepEqual(byId[screen].anchor.targetIds, ['target:laundry.intake.pack.color'])
  assert.equal(byId[screen].capture.reproduction, '/review-frame.html?scenario=intake.pack.color&persona=single&role=owner&condition=normal&theme=light&scale=2&width=393')
  assert.equal(byId[element].writtenBy, 'actor:person.reviewer')

  const handed = await shared.handOff({ annotationIds: [element, screen], ask: 'Make Continue easy to find.', checks: ['pnpm test'] })
  assert.equal(handed.request.status, 'open')
  assert.equal(handed.lane, 'auto')
  assert.deepEqual((await shared.list()).requests.map((summary) => summary.request.id), [handed.request.id])
})

test('an open design draft comes with its design lens', async () => {
  const repo = mkdtempSync(join(tmpdir(), 'laundry-civic-lens-'))
  const git = (...args) => execFileSync('git', args, { cwd: repo })
  git('init', '-q', '-b', 'main'); git('config', 'user.email', 'designer@example.com'); git('config', 'civic.handle', 'designer')
  writeFileSync(join(repo, 'README'), 'x'); git('add', '.'); git('commit', '-q', '-m', 'init')
  const file = (version, name) => {
    const path = join(repo, `${version}.json`)
    writeFileSync(path, JSON.stringify({ name: 'Shop', version, document: { id: '0:0', name: 'Document', type: 'DOCUMENT', children: [{ id: '1:0', name: 'Checkout', type: 'CANVAS', children: [{ id: '1:1', name, type: 'FRAME' }] }] } }))
    return path
  }
  const cli = (...args) => execFileSync(process.execPath, [join(civicRoot, 'review', 'src', 'cli.ts'), ...args], { cwd: repo, env: { ...process.env, CIVIC_AGENT: '', CIVIC_FOR: '' } })
  cli('design', file('1', 'Order summary'), '--file', 'SHOP')
  cli('draft', file('d1', 'Order summary, compact'), '--file', 'SHOP', '--name', 'Compact')
  const { lenses } = await civicShared({ repo, product: 'laundry', civicRoot }).list()
  const lens = lenses['line:figma.SHOP.draft.compact']
  assert.deepEqual({ base: lens.base.head, changes: lens.changes.map((item) => [item.change, item.node, item.was]) }, { base: '1', changes: [['changed', '1:1', 'Order summary']] })
})

test('without the civic CLI the review works as before', () => {
  assert.equal(civicShared({ repo: tmpdir(), product: 'laundry', civicRoot: tmpdir() }), null)
})

test('the CLI is found in the CIVIC checkout the package came from, and a product ID is required', () => {
  const saved = process.env.CIVIC_ROOT
  delete process.env.CIVIC_ROOT
  try {
    assert.ok(civicShared({ repo: tmpdir(), product: 'laundry' }))
    assert.throws(() => civicShared({ repo: tmpdir() }), /product ID/)
  } finally {
    if (saved !== undefined) process.env.CIVIC_ROOT = saved
  }
})

test('a screen reads what CIVIC\'s graphs know about it: journeys, paths, run evidence and findings', async () => {
  const shared = civicShared({ repo: tmpdir(), product: 'laundry', civicRoot })
  const facts = await shared.screen('intake.pack.final')
  assert.equal(facts.graph, 'projects/laundry/out/graph.json')
  assert.equal(facts.target.id, 'target:laundry.intake.pack.final')
  assert.deepEqual(facts.journeys.map((journey) => journey.title), ['Multicolor pack'])
  assert.ok(facts.evidence.length > 0 && facts.evidence.every((item) => item.source.tool === 'playwright'))
  assert.ok(facts.findings.every((item) => typeof item.baselined === 'boolean'))
  assert.equal(await shared.screen('no.such.scenario'), null)
  await assert.rejects(shared.screen('target:laundry.x; rm'), /Not a scenario ID/)
})
