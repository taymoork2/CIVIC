import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { validateGraph, type Annotation, type DesignExport, type GraphDocument, type Line, type WorkRequest } from '../../graph/src/index.ts'
import { linesChanging, readCheckout, run, Store, type DesignLens } from '../src/index.ts'

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

test('lines --json says which open lines change each target: drafts through their lens, code lines through claimed requests', async () => {
  const out = JSON.parse(await civic('lines', '--json')) as { lenses: Record<string, DesignLens>; changing: Record<string, { line: string; why: string[] }[]> }
  // No civic.check.json in this repository, so the draft's frames design no target here.
  assert.deepEqual(Object.keys(out.lenses), [draft])
  assert.deepEqual(out.changing, {})

  const line = (id: string, type: Line['type'], status: Line['status'] = 'open'): Line => ({ id, kind: 'line', title: id, type, tool: 'git', ref: id, ...(type === 'main' ? {} : { base: 'line:git.main' }), head: 'abc', status })
  const note: Annotation = { id: 'annotation:1', kind: 'annotation', title: 'Label clips', comment: 'Label clips', anchor: { targetIds: ['target:app.form'] }, seenOn: { line: 'line:git.main', revision: 'abc' }, at: '2026-10-12T00:00:00Z', writtenBy: 'actor:person.t' }
  const request = (id: string, fields: Partial<WorkRequest>) => ({ id, kind: 'work-request', title: `Fix ${id}`, annotationIds: [note.id], status: 'claimed', fixes: [], ...fields }) as WorkRequest
  const document = { schema: 'civic.graph/0', links: [], records: [
    line('line:git.main', 'main'), line('line:git.branch.wrap', 'branch'), line('line:git.branch.old', 'branch', 'abandoned'), note,
    request('work:a', { claim: { by: 'actor:agent.a', line: 'line:git.branch.wrap', at: '', expires: '' } }),
    request('work:b', { status: 'resolved', claim: { by: 'actor:agent.b', line: 'line:git.branch.wrap', at: '', expires: '' } }),
    request('work:c', { status: 'fix-ready', fixes: [{ by: 'actor:agent.c', line: 'line:git.branch.old', revision: 'def', at: '' }] }),
  ] } as unknown as GraphDocument
  const lens = { changes: [{ change: 'changed', node: '1:1', name: 'Form', page: 'P', annotations: [], targets: [{ graph: 'g', id: 'target:app.form', title: 'Form', passing: 0, failing: 0, annotations: 0 }] }] } as unknown as DesignLens
  const draftLine: Line = { ...line('line:figma.f.draft.x', 'design-draft'), tool: 'figma', base: 'line:figma.f' }
  document.records.push(draftLine)
  assert.deepEqual(linesChanging(document, { [draftLine.id]: lens }), {
    'target:app.form': [
      { line: 'line:figma.f.draft.x', title: 'line:figma.f.draft.x', type: 'design-draft', why: ['changed frame Form'] },
      { line: 'line:git.branch.wrap', title: 'line:git.branch.wrap', type: 'branch', why: ['claimed: Fix work:a'] },
    ],
  }, 'resolved requests and closed lines change nothing')
})

test("a design tool with no Figma export: Laundry's Open Design reference is a design line, and a proposal's lens reads Laundry's screens", async () => {
  const design = JSON.parse(readFileSync(new URL('../../projects/laundry/out/design.json', import.meta.url), 'utf8')) as DesignExport
  const laundryGraph = fileURLToPath(new URL('../../projects/laundry/out/graph.json', import.meta.url))
  const main = join(exports, 'laundry.design.json')
  writeFileSync(main, JSON.stringify(design))
  const registered = await civic('design', main)
  const base = `line:open-design.${design.key}`
  assert.match(registered, new RegExp(`^${base.replaceAll('.', '\\.')} open at version ${design.version}\\n`))

  // A proposal re-renders two drying frames and drops one sign-in case.
  const proposal = structuredClone(design)
  proposal.version = '2026-10-12T00:00:00.000Z'
  const changed = proposal.frames.filter((frame) => frame.page === 'drying-home').slice(0, 2)
  for (const frame of changed) frame.hash = `sha256:${'1'.repeat(64)}`
  const dropped = proposal.frames.findIndex((frame) => frame.page === 'sign-in')
  const [removed] = proposal.frames.splice(dropped, 1)
  const file = join(exports, 'laundry.proposal.json')
  writeFileSync(file, JSON.stringify(proposal))
  await civic('draft', file, '--name', 'Calmer drying')
  const draftLine = `${base}.draft.calmer-drying`
  const note = (await civic('annotate', 'The wait copy is too long at 320.', '--line', draftLine, '--figma-node', changed[0]!.node)).split(' ')[0]!

  const lens = JSON.parse(await civic('lens', draftLine, '--graph', laundryGraph, '--json')) as DesignLens
  assert.deepEqual(lens.base, { id: base, title: design.name, head: design.version })
  assert.equal(lens.unchanged, design.frames.length - 3)
  assert.deepEqual(lens.changes.map((item) => [item.change, item.node, item.targets.map((target) => target.id), item.annotations.map((a) => a.id)]), [
    ['changed', changed[0]!.node, ['target:laundry.legacy.drying-home'], [note]],
    ['changed', changed[1]!.node, ['target:laundry.legacy.drying-home'], []],
    ['removed', removed!.node, ['target:laundry.legacy.sign-in'], []],
  ])

  // Registering the proposal again finds the note by its frame, and a Figma key is refused.
  assert.match(await civic('draft', file, '--name', 'Calmer drying'), new RegExp(`${note} found on this version`))
  await assert.rejects(civic('design', main, '--file', 'other'), /not other/)
  assert.deepEqual(validateGraph(Store.forCommonDir(readCheckout(repo).commonDir).read()).filter((issue) => issue.severity === 'error'), [])
})
