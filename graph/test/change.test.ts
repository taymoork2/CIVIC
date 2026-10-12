import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { changeBetween, checkDocument, compareToBaseline, renderChange, type GraphDocument, type GraphRecord, type Owner } from '../src/index.ts'

// Step 10's acceptance: a change to one side of the Button or Card raises its finding on that
// change only, names who is asked and who is told, and makes no model calls.

const today = '2026-10-12'

function demo(name: string): GraphDocument {
  return JSON.parse(readFileSync(new URL(`../../demo/${name}.graph.json`, import.meta.url), 'utf8')) as GraphDocument
}

function without(document: GraphDocument, ...ids: string[]): GraphDocument {
  return { ...document, records: document.records.filter((record) => !ids.includes(record.id)) }
}

function changing(document: GraphDocument, id: string, edit: (record: GraphRecord) => GraphRecord): GraphDocument {
  return { ...document, records: document.records.map((record) => (record.id === id ? edit(structuredClone(record)) : record)) }
}

function change(graph: string, base: GraphDocument | undefined, head: GraphDocument) {
  const check = (document: GraphDocument) => checkDocument(graph, document, { today })
  return changeBetween('main', [{ graph, ...(base ? { base: { document: base, check: check(base) } } : {}), head: { document: head, check: check(head) } }])
}

const who = (owners: Owner[]) => owners.map((owner) => owner.who).sort()

test('an iOS library release that drops a slot raises one Card conflict, asks iOS and tells design', () => {
  // Before: the iOS CardView could express a body, so there was no conflict to raise.
  const head = without(demo('card/out/resolved'), 'decision:card.ios.default.body')
  const base = changing(without(head, 'conflict:card.ios.default.body'), 'platform:fluent-apple.card-view', (record) => ({ ...record, source: { ...record.source!, revision: 'earlier-release' } }))
  assert.equal(checkDocument('card', base, { today }).findings.some((item) => item.kind === 'invalid-graph'), false)

  const { introduced } = change('card', base, head)
  assert.deepEqual(introduced.map((entry) => entry.finding.key), ['open-conflict conflict:card.ios.default.body ios'])
  const [entry] = introduced
  assert.deepEqual(who(entry!.asked), ['fluent-ios'])
  assert.deepEqual(who(entry!.told), ['design-system-maintainers'])
  assert.match(entry!.why, /platform:fluent-apple\.card-view changed from github revision earlier-release to 920ee25179c4/)
})

test('a product override in a design file raises its Card conflict, asks the product designer and tells the library and QA', () => {
  const head = without(demo('card/out/resolved'), 'decision:shop.order-summary.card.corner-radius')
  const base = without(head, 'override:shop.order-summary.card.corner-radius', 'conflict:shop.order-summary.card.corner-radius')
  const { introduced } = change('card', base, head)
  assert.deepEqual(introduced.map((entry) => entry.finding.key), ['open-conflict conflict:shop.order-summary.card.corner-radius'])
  assert.deepEqual(who(introduced[0]!.asked), ['shop-design'])
  assert.deepEqual(who(introduced[0]!.told), ['card-qa', 'design-system-maintainers'])
  assert.match(introduced[0]!.why, /override:shop\.order-summary\.card\.corner-radius is new/)
})

test('a new Android kit export raises the Button conflict on the design side and tells Android', () => {
  const head = demo('fluent-button/out/raised')
  const kit = 'evidence:figma.android-kit.button'
  const base = changing(without(head, 'conflict:button.android.brand-outline'), kit, (record) => ({ ...record, source: { ...record.source!, revision: 'kit-v1' } }))
  const { introduced } = change('button', base, head)
  assert.deepEqual(introduced.map((entry) => entry.finding.key), ['open-conflict conflict:button.android.brand-outline android'])
  assert.deepEqual(who(introduced[0]!.asked), ['design-system-maintainers'])
  assert.deepEqual(who(introduced[0]!.told), ['fluent-android'])
})

test('recapturing evidence with the same result moves nothing, and unchanged graphs introduce nothing', () => {
  const head = demo('card/out/resolved')
  assert.deepEqual(change('card', head, head), { since: 'main', introduced: [], resolved: [] })
  const recaptured = changing(head, 'evidence:figma.library.card', (record) => ({ ...record, capturedAt: '2027-01-01T00:00:00Z' }) as GraphRecord)
  assert.deepEqual(change('card', head, recaptured).introduced, [])
})

test('withdrawing a decision asks everyone the conflict names, since neither side moved', () => {
  const base = demo('card/out/resolved')
  const head = without(base, 'decision:shop.order-summary.card.corner-radius')
  const result = change('card', base, head)
  const entry = result.introduced.find((item) => item.finding.kind === 'open-conflict')!
  assert.deepEqual(who(entry.asked), ['design-system-maintainers', 'shop-design'])
  assert.deepEqual(entry.told, [])
  assert.match(entry.why, /removed decision:shop\.order-summary\.card\.corner-radius/)
})

test('the pull request summary lists what the change blocks on, with who is asked and told', () => {
  const head = without(demo('card/out/resolved'), 'decision:card.ios.default.body')
  const base = changing(without(head, 'conflict:card.ios.default.body'), 'platform:fluent-apple.card-view', (record) => ({ ...record, title: `${record.title} (earlier)` }))
  const report = compareToBaseline([checkDocument('card', head, { today })], undefined)
  const text = renderChange(change('card', base, head), { ...report, graphs: 1 })
  assert.match(text, /## CIVIC: 1 finding introduced/)
  assert.match(text, /- \*\*Asked:\*\* fluent-ios \(design-engineering, ios\)/)
  assert.match(text, /- \*\*Told:\*\* design-system-maintainers \(design\)/)
  assert.match(text, /civic decide <decisions\.json> conflict:card\.ios\.default\.body/)
})

test('civic check --since compares with the graphs at a git revision', () => {
  const root = mkdtempSync(join(tmpdir(), 'civic-since-'))
  const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' })
  git('init', '--quiet', '--initial-branch=main')
  git('config', 'user.email', 'civic@example.com')
  git('config', 'user.name', 'CIVIC')
  mkdirSync(join(root, 'out'))
  writeFileSync(join(root, 'civic.check.json'), JSON.stringify({ graphs: ['out/card.json'] }))
  const head = without(demo('card/out/resolved'), 'decision:shop.order-summary.card.corner-radius')
  writeFileSync(join(root, 'out/card.json'), JSON.stringify(without(head, 'override:shop.order-summary.card.corner-radius', 'conflict:shop.order-summary.card.corner-radius')))
  git('add', '.')
  git('commit', '--quiet', '-m', 'base')
  writeFileSync(join(root, 'out/card.json'), JSON.stringify(head))
  git('commit', '--quiet', '-am', 'change')

  const cli = (...extra: string[]) => spawnSync(process.execPath, [fileURLToPath(new URL('../src/cli.ts', import.meta.url)), 'check', '--today', today, ...extra], { cwd: root, encoding: 'utf8' })
  const result = cli('--since', 'HEAD~1', '--json')
  assert.equal(result.status, 1, result.stderr)
  const report = JSON.parse(result.stdout) as { change: { introduced: { finding: { key: string }; asked: Owner[] }[] } }
  assert.deepEqual(report.change.introduced.map((entry) => entry.finding.key), ['open-conflict conflict:shop.order-summary.card.corner-radius'])
  assert.match(cli('--since', 'HEAD~1').stdout, /Asked:\*\* shop-design/)
  assert.match(cli('--since', 'no-such-ref').stderr, /isn't a revision in this repository/)
  assert.match(cli('--comment', '7').stderr, /--comment needs --since/)
})
