import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { before, test } from 'node:test'
import { validateGraph, type Annotation, type DraftChoice, type Line } from '../../graph/src/index.ts'
import { checkChange, parseAccess, readCheckout, run, Store } from '../src/index.ts'
import { callTool } from '../src/mcp.ts'

// D36: a designer's draft is its own line, read from its Figma file export. Comments on a
// draft stay on it and follow its frames by node ID, and a person chooses between drafts.

const root = mkdtempSync(join(tmpdir(), 'civic-drafts-'))
const repo = join(root, 'repo')
const exports = join(root, 'exports')
const person = { CIVIC_PERSON: 'taymoor', CIVIC_AGENT: undefined, CIVIC_FOR: undefined }
const agent = { CIVIC_AGENT: 'claude-code', CIVIC_FOR: 'taymoor' }
const checkout = JSON.parse(readFileSync(new URL('../../demo/card/design/shop-checkout.figma.json', import.meta.url), 'utf8'))
const fileKey = 'SHOPfile123'
const main = 'line:figma.SHOPfile123'
const draftA = 'line:figma.SHOPfile123.draft.gift-wrap-a'
const draftB = 'line:figma.SHOPfile123.draft.gift-wrap-b'

async function civic(env: Record<string, string | undefined>, ...args: string[]): Promise<string> {
  const out: string[] = []
  assert.equal(await run(args, repo, { ...process.env, ...env }, (text) => out.push(text)), 0)
  return out.join('\n')
}

/** Writes a version of the checkout file: the same frames, with some left out. */
function exportVersion(name: string, version: string, without: string[] = []): string {
  const file = structuredClone(checkout)
  file.version = version
  for (const page of file.document.children) page.children = page.children.filter((node: { id: string }) => !without.includes(node.id))
  const path = join(exports, `${name}.json`)
  writeFileSync(path, JSON.stringify(file))
  return path
}

const records = () => Store.forCommonDir(readCheckout(repo).commonDir).read()
const line = (id: string) => records().records.find((record): record is Line => record.id === id && record.kind === 'line')!

before(() => {
  execFileSync('mkdir', ['-p', repo, exports])
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo })
  execFileSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=T', 'commit', '-q', '--allow-empty', '-m', 'start'], { cwd: repo })
})

test('a draft needs its main design file first, then branches from it', async () => {
  await assert.rejects(civic(person, 'draft', exportVersion('a1', 'a-1'), '--file', fileKey, '--name', 'Gift wrap A'), /Register the main design file first/)
  assert.match(await civic(person, 'design', exportVersion('main', '100'), '--file', fileKey), new RegExp(`^${main} open at version 100`))
  const out = await civic(person, 'draft', exportVersion('a1', 'a-1'), '--file', fileKey, '--name', 'Gift wrap A', '--branch', 'BRANCHa')
  assert.match(out, new RegExp(`^${draftA} open at version a-1, from ${main}`))
  assert.match(out, /40:20 +Checkout \/ Gift options/)
  assert.deepEqual({ ...line(draftA), source: undefined }, { id: draftA, kind: 'line', title: 'Draft: Gift wrap A', type: 'design-draft', tool: 'figma', ref: 'BRANCHa', base: main, head: 'a-1', status: 'open', source: undefined })
  assert.equal(line(draftA).source?.path, 'https://www.figma.com/design/BRANCHa')
})

test('an annotation on a draft frame stays on the draft and follows the frame by node ID', async () => {
  await civic(person, 'draft', exportVersion('b1', 'b-1'), '--file', fileKey, '--name', 'Gift wrap B')
  const id = (await civic(agent, 'annotate', 'The gift note field is too far from the wrap choice.', '--line', draftB, '--figma-node', '40:20')).split(' ')[0]!
  const annotation = records().records.find((record): record is Annotation => record.id === id)!
  assert.deepEqual(annotation.seenOn, { line: draftB, revision: 'b-1' })
  assert.deepEqual(annotation.anchor, { targetIds: [], locator: { figmaNode: '40:20' } })

  assert.match(await civic(person, 'draft', exportVersion('b2', 'b-2'), '--file', fileKey, '--name', 'Gift wrap B'), new RegExp(`${id} found on this version`))
  assert.match(await civic(person, 'draft', exportVersion('b3', 'b-3', ['40:20']), '--file', fileKey, '--name', 'Gift wrap B'), new RegExp(`${id} not found on this version`))
  assert.equal(line(draftB).head, 'b-3')

  // An agent's harness annotates a draft frame through the MCP server the same way.
  const [result] = await callTool('annotate', { cwd: repo, comment: 'Promo copy overlaps the total.', line: draftA, figma_node: '40:10' }, { ...process.env, ...agent })
  const mcpId = (result as { text: string }).text.split(' ')[0]!
  const viaMcp = records().records.find((record): record is Annotation => record.id === mcpId)!
  assert.deepEqual({ seenOn: viaMcp.seenOn, anchor: viaMcp.anchor }, { seenOn: { line: draftA, revision: 'a-1' }, anchor: { targetIds: [], locator: { figmaNode: '40:10' } } })
})

test('only a person chooses a draft, and the others are abandoned, not deleted', async () => {
  await assert.rejects(civic(agent, 'choose-draft', draftA, '--why', 'Agents pick'), /Only a person chooses/)
  const out = await civic(person, 'choose-draft', draftA, '--why', 'A keeps the wrap choice and the note together.', '--merged-as', '101')
  assert.match(out, new RegExp(`chose ${draftA} at version a-1; abandoned ${draftB}`))
  const choice = records().records.find((record): record is DraftChoice => record.kind === 'draft-choice')!
  assert.deepEqual({ base: choice.base, chosen: choice.chosen, over: choice.over, writtenBy: choice.writtenBy }, { base: main, chosen: { line: draftA, revision: 'a-1' }, over: [draftB], writtenBy: 'actor:person.taymoor' })
  assert.equal(line(draftA).status, 'merged')
  assert.equal(line(draftA).mergedAs, '101')
  assert.equal(line(draftB).status, 'abandoned')
  assert.ok(records().records.some((record) => record.kind === 'annotation' && record.seenOn.line === draftB), 'comments on the passed-over draft are kept')
  await assert.rejects(civic(person, 'draft', exportVersion('b4', 'b-4'), '--file', fileKey, '--name', 'Gift wrap B'), /is abandoned \(another draft was chosen\)/)
  assert.deepEqual(validateGraph(records()).filter((issue) => issue.severity === 'error'), [])
})

test('the graph refuses a draft choice an agent wrote or one that leaves a passed-over draft open', () => {
  const document = records()
  const choice = document.records.find((record): record is DraftChoice => record.kind === 'draft-choice')!
  choice.writtenBy = 'actor:agent.claude-code.taymoor'
  const b = document.records.find((record): record is Line => record.id === draftB)!
  b.status = 'open'
  const codes = validateGraph(document).filter((issue) => issue.severity === 'error').map((issue) => issue.code)
  assert.ok(codes.includes('agent-decision'))
  assert.ok(codes.includes('draft-choice'))
})

test('a synced draft choice needs the approve scope', () => {
  const after = records()
  const before = { ...after, records: after.records.filter((record) => record.kind !== 'draft-choice') }
  const writeOnly = parseAccess(JSON.stringify({ people: { taymoor: ['read', 'write'] }, others: [] }))
  assert.match(checkChange('actor:person.taymoor', before, after, writeOnly).join('\n'), /changed choice:.* without the approve scope/)
  assert.deepEqual(checkChange('actor:person.taymoor', before, after, parseAccess(JSON.stringify({ people: { taymoor: ['read', 'write', 'approve'] }, others: [] }))), [])
})
