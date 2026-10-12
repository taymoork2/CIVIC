import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { validateGraph, type Line } from '../../graph/src/index.ts'
import { readCheckout, run, Store, type DesignLens } from '../src/index.ts'

// The design lens (D36): a draft's frames compared with its base, read on the checkout's
// code line through the graphs that anchor targets to the same Figma nodes.

const root = mkdtempSync(join(tmpdir(), 'civic-lens-'))
const repo = join(root, 'repo')
const exports = join(root, 'exports')
const person = { CIVIC_PERSON: 'taymoor', CIVIC_AGENT: undefined, CIVIC_FOR: undefined }
const checkout = JSON.parse(readFileSync(new URL('../../demo/card/design/shop-checkout.figma.json', import.meta.url), 'utf8'))
const cardGraph = fileURLToPath(new URL('../../demo/card/out/resolved.graph.json', import.meta.url))
const draft = 'line:figma.SHOPfile123.draft.gift-wrap'

async function civic(...args: string[]): Promise<string> {
  const out: string[] = []
  assert.equal(await run(args, repo, { ...process.env, ...person }, (text) => out.push(text)), 0)
  return out.join('\n')
}

function exportVersion(name: string, version: string, edit: (frames: { id: string; name: string; children?: unknown[] }[]) => void = () => {}): string {
  const file = structuredClone(checkout)
  file.version = version
  edit(file.document.children[0].children)
  const path = join(exports, `${name}.json`)
  writeFileSync(path, JSON.stringify(file))
  return path
}

before(() => {
  execFileSync('mkdir', ['-p', repo, exports])
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo })
  execFileSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=T', 'commit', '-q', '--allow-empty', '-m', 'start'], { cwd: repo })
})

test('a design line records its frames with a fingerprint of each', async () => {
  await civic('design', exportVersion('main', '100'), '--file', 'SHOPfile123')
  const line = Store.forCommonDir(readCheckout(repo).commonDir).read().records.find((record): record is Line => record.id === 'line:figma.SHOPfile123')!
  assert.deepEqual(line.frames!.map((frame) => [frame.node, frame.name, frame.page]), [['40:1', 'Order Summary', 'Checkout'], ['40:5', 'Order Summary / Loading', 'Checkout'], ['40:10', 'Promo applied', 'Checkout'], ['40:20', 'Gift options', 'Checkout']])
  assert.ok(line.frames!.every((frame) => /^sha256:[0-9a-f]{64}$/.test(frame.hash)))
})

test('the lens says what a draft adds, changes and removes, and what each frame designs on the code line', async () => {
  await civic('draft', exportVersion('draft', 'd-1', (frames) => {
    const gift = frames.find((frame) => frame.id === '40:20')!
    gift.children = [...(gift.children ?? []), { id: '40:99', name: 'Gift note', type: 'TEXT' }]
    frames.find((frame) => frame.id === '40:5')!.name = 'Order Summary / Syncing'
    frames.splice(frames.findIndex((frame) => frame.id === '40:10'), 1)
    frames.push({ id: '41:1', name: 'Gift wrap picker', children: [] })
    Object.assign(frames.at(-1)!, { type: 'FRAME' })
  }), '--file', 'SHOPfile123', '--name', 'Gift wrap')
  const note = (await civic('annotate', 'Put the note under the wrap choice.', '--line', draft, '--figma-node', '40:20')).split(' ')[0]!

  const lens = JSON.parse(await civic('lens', draft, '--graph', cardGraph, '--json')) as DesignLens
  assert.deepEqual({ base: lens.base, codeLine: lens.codeLine, unchanged: lens.unchanged }, { base: { id: 'line:figma.SHOPfile123', title: checkout.name, head: '100' }, codeLine: 'line:git.main', unchanged: 1 })
  assert.deepEqual(lens.changes.map((item) => [item.change, item.node, item.was, item.targets.map((target) => target.id), item.annotations.map((a) => a.id)]), [
    ['changed', '40:5', 'Order Summary / Loading', ['target:shop.order-summary.loading'], []],
    ['changed', '40:20', undefined, ['target:shop.gift-options'], [note]],
    ['added', '41:1', undefined, [], []],
    ['removed', '40:10', undefined, ['target:shop.promo-applied'], []],
  ])

  const text = await civic('lens', draft, '--graph', cardGraph)
  assert.match(text, /^Draft: Gift wrap \(line:figma\.SHOPfile123\.draft\.gift-wrap\) at version d-1, against .* at version 100, read on line:git\.main\.\n4 frame\(s\) changed, 1 unchanged\./)
  assert.match(text, /added +41:1 +Checkout \/ Gift wrap picker\n +code: no target on line:git\.main is designed by this frame/)
  assert.match(text, /note: Put the note under the wrap choice\./)
  assert.deepEqual(validateGraph(Store.forCommonDir(readCheckout(repo).commonDir).read()).filter((issue) => issue.severity === 'error'), [])
})

test('the lens refuses a line that is not a draft', async () => {
  await assert.rejects(civic('lens', 'line:figma.SHOPfile123'), /not a design draft/)
})
