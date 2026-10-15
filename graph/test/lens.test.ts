import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { indexGraph, lensView, parseLens, renderPortal, resolveLens, storiesIn, validateGraph, type Environment, type GraphDocument, type GraphRecord, type Line } from '../src/index.ts'

// The story lens (decision 0013, point 3): one design line, one code line and one environment.

const read = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as GraphDocument
const card = () => indexGraph(read('../../demo/card/out/resolved.graph.json'))
const laundry = () => indexGraph(read('../../projects/laundry/out/graph.json'))
const hash = (n: number) => `sha256:${String(n).repeat(64)}`

// The Shop checkout file's main line, and a draft that changes the Promo applied frame and adds one.
const main: Line = { id: 'line:figma.shop', kind: 'line', title: 'Shop checkout', type: 'main', tool: 'figma', ref: 'shop', head: '5', status: 'open', frames: [{ node: '40:1', name: 'Order Summary', page: 'Checkout', hash: hash(1) }, { node: '40:10', name: 'Promo applied', page: 'Checkout', hash: hash(2) }] }
const draft: Line = { ...main, id: 'line:figma.shop.draft.promo', title: 'Promo rework', type: 'design-draft', base: main.id, head: '6', frames: [{ node: '40:1', name: 'Order Summary', page: 'Checkout', hash: hash(1) }, { node: '40:10', name: 'Promo applied', page: 'Checkout', hash: hash(3) }, { node: '40:20', name: 'Gift options', page: 'Checkout', hash: hash(4) }] }

test('through a design draft, each screen shows the draft frame that designs it and whether it changed from the base', () => {
  const records: GraphRecord[] = [main, draft]
  const lens = resolveLens(records, { design: draft.id })
  const changes = ['target:shop.order-summary', 'target:shop.promo-applied', 'target:shop.gift-options'].map((id) => lensView(card(), records, lens, id).frames.map((frame) => frame.change))
  assert.deepEqual(changes, [['unchanged'], ['changed'], ['added']])
  assert.deepEqual(parseLens(`?${lens.query}`), { design: draft.id })
})

test('through a code line, only runs on its head or its preview count, and the environment says whether it runs that head', () => {
  const graph = laundry()
  const head = graph.ofKind('evidence')[0]!.source.revision
  const mainLine: Line = { id: 'line:git.main', kind: 'line', title: 'main', type: 'main', tool: 'git', ref: 'main', head, status: 'open' }
  const branch: Line = { id: 'line:git.fix', kind: 'line', title: 'fix', type: 'branch', tool: 'git', ref: 'fix', base: mainLine.id, head: 'f'.repeat(40), status: 'open' }
  const staging: Environment = { id: 'environment:staging', kind: 'environment', title: 'Staging', url: 'https://staging.example.com', canvas: true, runs: [{ line: mainLine.id, revision: 'e'.repeat(40), observedAt: '2026-10-15T00:00:00Z' }] }
  const records: GraphRecord[] = [mainLine, branch, staging]
  const screen = 'target:laundry.route.drying.washer-queued'
  const onMain = lensView(graph, records, resolveLens(records, { code: mainLine.id, environment: staging.id }), screen)
  assert.ok(onMain.runs.length > 0)
  assert.deepEqual(onMain.deployed, { revision: 'e'.repeat(40), observedAt: '2026-10-15T00:00:00Z', current: false })
  const onBranch = lensView(graph, records, resolveLens(records, { code: branch.id }), screen)
  assert.deepEqual([onBranch.runs.length, onBranch.elsewhere], [0, onMain.runs.length])
  // A preview of the branch that served main's revision counts.
  const previewed = lensView(graph, records, resolveLens([{ ...branch, previews: [{ url: 'https://pr.example.com', revision: head }] }], { code: branch.id }), screen)
  assert.equal(previewed.runs.length, onMain.runs.length)

  const page = renderPortal(graph, storiesIn(graph, 'laundry'), { title: 'Laundry', lens: { resolved: resolveLens(records, { code: mainLine.id, environment: staging.id }), records } })
  assert.match(page.get('index.html')!, /href="stories\/laundry-journey-drying\.html\?code=line:git\.main&amp;environment=environment:staging"/)
  const story = page.get('stories/laundry-journey-drying.html')!
  assert.match(story, /lens="code=line:git\.main&amp;environment=environment:staging"/)
  assert.match(story, /&quot;src&quot;:&quot;https:\/\/staging\.example\.com\/review-frame\.html\?scenario=route\.drying\.washer-queued&quot;,&quot;label&quot;:&quot;Play on Staging&quot;/)
  assert.match(story, /Staging: runs main at e{12}, behind its head/)
})

test('a lens refuses the wrong kind of line, and the validator checks releases and environments', () => {
  assert.throws(() => resolveLens([main], { code: main.id }), /is a figma line, not code/)
  assert.throws(() => resolveLens([main], { environment: 'environment:nowhere' }), /No environment/)
  const release: Line = { id: 'line:npm.release.card.1', kind: 'line', title: 'card@1', type: 'release', tool: 'npm', ref: 'card@1', base: 'line:git.main', head: '1', status: 'merged', mergedAs: '1' }
  const orphan: Environment = { id: 'environment:prod', kind: 'environment', title: 'Production', runs: [{ line: 'line:git.gone', revision: 'a', observedAt: '2026-10-15T00:00:00Z' }] }
  const codes = validateGraph({ schema: read('../../demo/card/out/resolved.graph.json').schema, records: [{ id: 'line:git.main', kind: 'line', title: 'main', type: 'main', tool: 'git', ref: 'main', head: 'a', status: 'open' }, release, orphan], links: [] } as GraphDocument).filter((issue) => issue.severity === 'error').map((issue) => issue.code)
  assert.ok(codes.includes('line-release'), codes.join())
  assert.ok(codes.includes('dangling-reference'), codes.join())
})
