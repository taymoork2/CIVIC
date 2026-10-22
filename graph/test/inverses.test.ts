import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkGraph, indexGraph, kindOfLabel, objectMapOf, renderObjectMap, resolveVocabulary, validateGraph, vocabularyErrors, type DomainObject, type GraphDocument, type Link, type Target } from '../src/index.ts'

// "Can you go back?" (decision 0015): an action that makes or starts something needs one that
// undoes it, declared on the object or seen on a screen that shows it.

const design = { role: 'design' as const, who: 'designers' }
const object = (title: string, actions: DomainObject['actions']): DomainObject => ({ id: `object:app.${title.toLowerCase()}`, kind: 'object', title, owners: [design], attributes: [], actions, relationships: [] })
const screen = (id: string, controls?: Target['controls']): Target => ({ id: `target:app.${id}`, kind: 'target', title: id, scale: 'screen', presence: 'discovered', platforms: ['web'], ...(controls ? { controls } : {}) })
const shows = (from: string, to: string, status: Link['status'] = 'declared'): Link => ({ from: `target:app.${from}`, relation: 'shows', to, status })
const document = (records: GraphDocument['records'], links: Link[] = []): GraphDocument => ({ schema: 'civic.graph/0', records, links })
const gapsOf = (doc: GraphDocument, vocabulary = resolveVocabulary()) => objectMapOf(indexGraph(doc), vocabulary).gaps.filter((gap) => gap.kind === 'object-action-no-inverse')

test('an action with no inverse is a finding; declaring one, or a decision that makes it one-way, clears it', () => {
  const gaps = gapsOf(document([object('Project', [{ key: 'add-project', title: 'Add project' }, { key: 'open', title: 'Open' }])]))
  assert.deepEqual(gaps.map((gap) => [gap.subjectId, gap.detail]), [['object:app.project', 'add-project'], ['object:app.project', 'open']])
  assert.match(gaps[0]!.summary, /Project has "Add project" \(add, declared\), but nothing undoes it: no remove or archive action/)
  assert.deepEqual(gaps[0]!.owners, [design])

  const removable = gapsOf(document([object('Project', [{ key: 'add-project', title: 'Add project' }, { key: 'archive', title: 'Archive' }])]))
  assert.deepEqual(removable.map((gap) => gap.detail), ['archive'], 'archiving needs a restore; archiving is a way back from adding')

  const oneWay = { key: 'add-project', title: 'Add project', oneWay: { reason: 'Projects are permanent records.', decision: 'docs/decisions/0042-permanent-projects.md' } }
  assert.deepEqual(gapsOf(document([object('Project', [oneWay])])), [])
  assert.deepEqual(objectMapOf(indexGraph(document([object('Project', [oneWay])]))).counts.inverseChecks, 1)
})

test('declared kinds work in any language; a label is read only when no kind is declared', () => {
  const swedish = object('Projekt', [{ key: 'lagg-till', title: 'Lägg till projekt', kind: 'add' }])
  assert.equal(gapsOf(document([swedish])).length, 1)
  assert.deepEqual(gapsOf(document([{ ...swedish, actions: [...swedish.actions, { key: 'ta-bort', title: 'Ta bort projekt', kind: 'remove' }] }])), [])
  // A project's labels teach CIVIC its words.
  const vocabulary = resolveVocabulary({ labels: { 'ta bort': 'remove' } })
  assert.equal(kindOfLabel('Ta bort projekt', vocabulary), 'remove')
  assert.equal(kindOfLabel('Ta bort projekt', resolveVocabulary()), undefined)
  assert.equal(kindOfLabel('Sign out of Orca', resolveVocabulary()), 'sign-out')
  assert.equal(kindOfLabel('Remove project', resolveVocabulary()), 'remove')
  // The earliest word wins.
  assert.equal(kindOfLabel('Add and remove', resolveVocabulary()), 'add')
  // A project may change what needs an inverse: here, adding is allowed to be one-way, and starting needs a pause.
  const custom = resolveVocabulary({ inverses: { add: ['remove', 'hide'], start: ['pause'] } })
  assert.equal(gapsOf(document([object('Job', [{ key: 'go', title: 'Start job' }])]), custom)[0]?.summary.includes('no pause action'), true)
  assert.deepEqual(vocabularyErrors({ inverses: { add: [] }, labels: { x: '' } }).length, 2)
})

test('a control the crawl saw, even one it blocked as destructive, proves the inverse exists', () => {
  const projects = object('Project', [{ key: 'add-project', title: 'Add project' }])
  const links = [shows('projects', projects.id)]
  assert.equal(gapsOf(document([projects, screen('projects')], links)).length, 1)
  const blocked = screen('projects', [{ role: 'button', name: 'Remove project', outcome: 'blocked' }])
  assert.deepEqual(gapsOf(document([projects, blocked], links)), [])
  // A suggested tie doesn't count until a person confirms it, so its controls don't either.
  assert.equal(gapsOf(document([projects, blocked], [shows('projects', projects.id, 'inferred')])).length, 1)
  // A control seen on a screen is checked too, though the grid never listed it.
  const queue = object('Message', [])
  const seen = screen('chat', [{ role: 'button', name: 'Queue message', outcome: 'taken' }])
  const lonely = gapsOf(document([queue, seen], [shows('chat', queue.id)]))
  assert.deepEqual(lonely.map((gap) => gap.detail), ['queue'])
  assert.match(lonely[0]!.summary, /seen on target:app\.chat/)
})

test('queued messages, which can be sent and cancelled, pass', () => {
  const message = object('Queued message', [{ key: 'send', title: 'Send input' }, { key: 'cancel', title: 'Cancel input' }, { key: 'edit', title: 'Edit input' }])
  assert.deepEqual(gapsOf(document([message])), [])
  assert.equal(objectMapOf(indexGraph(document([message]))).counts.inverseChecks, 1)
})

test('the gate reports it as advisory, with a count, and rejects a malformed declaration', () => {
  const doc = document([object('Project', [{ key: 'add-project', title: 'Add project' }])])
  const check = checkGraph('app', indexGraph(doc), { today: '2026-10-21' })
  assert.deepEqual(check.findings.map((item) => item.key), ['object-action-no-inverse object:app.project add-project'])
  assert.deepEqual(check.measures.find((item) => item.check === 'Object actions with no way back'), { graph: 'app', check: 'Object actions with no way back', found: 1, of: 1 })
  assert.match(renderObjectMap(objectMapOf(indexGraph(doc))), /## Actions with no way back: 1/)
  const withLabels = checkGraph('app', indexGraph(document([object('Projekt', [{ key: 'a', title: 'Lägg till' }])])), { today: '2026-10-21', actions: { labels: { 'lägg till': 'add' } } })
  assert.equal(withLabels.findings.length, 1)

  const bad = document([object('Project', [{ key: 'x', title: 'X', oneWay: { reason: '' } as never }])])
  assert.ok(validateGraph(bad).some((issue) => issue.severity === 'error' && issue.at.includes('oneWay')))
  assert.ok(validateGraph(document([screen('a', [{ role: 'button', name: 'Go', outcome: 'maybe' as never }])])).some((issue) => issue.severity === 'error'))
})
