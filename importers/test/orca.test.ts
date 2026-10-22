import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { indexGraph, objectMapOf, validateGraph, type GraphDocument, type Target } from '../../graph/src/index.ts'
import { assemble, fragment, parseCsv, readCrawl, readOrcaGrid, tieObjects, type ObjectTiesFile } from '../src/index.ts'

// The OOUX object map (decision 0014, point 8): a designer's ORCA grid, exported as CSV,
// becomes object records, and targets are tied to them by declaration or a confirmed suggestion.

const owners = [{ role: 'design', who: 'designers' }] as const
const source = { tool: 'spreadsheet', importer: 'orca-grid', revision: 'v1', path: 'orca.csv' }
const grid = `ORCA grid,Order,Customer
description,"An order, placed ""once""",Someone who buys
also called,purchase; basket,
core content,Total,Name
core content,Status,
metadata,Placed at,Email
nested objects,Customer (one),Order (many)
calls to action,Cancel,
calls to action,Reorder,
`
const screen = (id: string, title: string, scale: Target['scale'] = 'screen'): Target => ({ id: `target:shop.${id}`, kind: 'target', title, scale, presence: 'expected', platforms: ['web'] })

test('CSV cells may quote commas, quotes and newlines', () => {
  assert.deepEqual(parseCsv('a,"b, ""c""\nd",e\r\nf,,\n'), [['a', 'b, "c"\nd', 'e'], ['f', '', '']])
  assert.throws(() => parseCsv('a,"b'), /inside a quoted cell/)
})

test('an ORCA grid becomes one object per column, owned by Design', () => {
  const [order, customer] = readOrcaGrid(grid, { prefix: 'shop', owners: [...owners], source })
  assert.equal(order!.id, 'object:shop.order')
  assert.equal(order!.description, 'An order, placed "once"')
  assert.deepEqual(order!.synonyms, ['purchase', 'basket'])
  assert.deepEqual(order!.attributes, [
    { key: 'total', title: 'Total', kind: 'core' },
    { key: 'status', title: 'Status', kind: 'core' },
    { key: 'placed-at', title: 'Placed at', kind: 'metadata' },
  ])
  assert.deepEqual(order!.actions.map((action) => action.key), ['cancel', 'reorder'])
  assert.deepEqual(order!.relationships, [{ objectId: 'object:shop.customer', cardinality: 'one' }])
  assert.deepEqual(customer!.relationships, [{ objectId: 'object:shop.order', cardinality: 'many' }])
  assert.deepEqual(customer!.owners, owners)
  assert.equal(customer!.source?.anchor, 'Customer')
  assert.throws(() => readOrcaGrid('x,Order\nfeelings,Happy\n', { prefix: 'shop', owners: [...owners], source }), /labelled "feelings"/)
  assert.throws(() => readOrcaGrid('x,Order\nnested objects,Invoice\n', { prefix: 'shop', owners: [...owners], source }), /nests "Invoice"/)
  assert.throws(() => readOrcaGrid('x,Order\ncta,Cancel\ncta,cancel\n', { prefix: 'shop', owners: [...owners], source }), /twice/)
})

test('declared ties become shows links; names suggest the rest unless a person dismissed them', () => {
  const objects = readOrcaGrid(grid, { prefix: 'shop', owners: [...owners], source })
  const targets = [screen('checkout', 'Checkout', 'journey'), screen('history', 'Order history'), screen('basket', 'Your basket'), screen('orders', 'Past orders'), screen('profile', 'Customer profile'), screen('help', 'Help')]
  const file: ObjectTiesFile = {
    schema: 'civic.object-ties/0',
    ties: [
      { targets: ['target:shop.checkout'], object: 'object:shop.order' },
      { targets: ['target:shop.history'], object: 'object:shop.order', view: 'card', attributes: ['total'], actions: ['reorder'] },
    ],
    dismissed: [{ target: 'target:shop.profile', object: 'object:shop.customer' }],
  }
  const links = tieObjects(objects, targets, file, { source: { tool: 'civic', importer: 'object-ties', revision: 'r1' } })
  assert.deepEqual(links.map((link) => [link.from, link.to, link.status, link.source?.anchor]), [
    ['target:shop.checkout', 'object:shop.order', 'declared', 'ties[0]'],
    ['target:shop.history', 'object:shop.order', 'declared', 'ties[1]'],
    // A synonym, and a plural; the journey and the dismissed pair get no suggestion.
    ['target:shop.basket', 'object:shop.order', 'inferred', 'suggested by the name "basket"'],
    ['target:shop.orders', 'object:shop.order', 'inferred', 'suggested by the name "order"'],
  ])
  assert.deepEqual(links[1], { from: 'target:shop.history', relation: 'shows', to: 'object:shop.order', status: 'declared', view: 'card', attributes: ['total'], actions: ['reorder'], source: { tool: 'civic', importer: 'object-ties', revision: 'r1', anchor: 'ties[1]' } })
  const document = assemble(fragment(targets), fragment(objects, links))
  assert.deepEqual(validateGraph(document).filter((issue) => issue.severity === 'error'), [])

  const bad = (tie: ObjectTiesFile['ties'][number]) => () => tieObjects(objects, targets, { schema: 'civic.object-ties/0', ties: [tie] }, { source: { tool: 'civic', importer: 'object-ties', revision: 'r1' } })
  assert.throws(bad({ targets: ['target:shop.nowhere'], object: 'object:shop.order' }), /not a target/)
  assert.throws(bad({ targets: ['target:shop.help'], object: 'object:shop.invoice' }), /not in the object map/)
  assert.throws(bad({ targets: ['target:shop.help'], object: 'object:shop.order', attributes: ['colour'] }), /no attribute "colour"/)
  assert.throws(bad({ targets: ['target:shop.help', 'target:shop.help'], object: 'object:shop.order' }), /more than once/)
})

test('a crawl keeps the controls it blocked, and a blocked "Remove project" proves the way back exists (decision 0015)', () => {
  const objects = readOrcaGrid('x,Project\ncalls to action,Add project\n', { prefix: 'app', owners: [...owners], source })
  const crawl = {
    schema: 'civic.crawl/0', seed: 'index.html', platform: 'web', driver: 'playwright-core', revision: 'abc123',
    states: [{ id: 'projects', location: 'projects.html', title: 'Projects', hash: 'h1' }],
    transitions: [],
    blocked: [{ from: 'projects', action: { role: 'button', name: 'Remove project' }, reason: 'destructive action' }],
    unreached: [{ from: 'projects', action: { role: 'button', name: 'Add project' }, reason: 'no allowlisted value for Name' }],
  }
  const crawled = readCrawl(crawl, { prefix: 'app', owners: [...owners], path: 'crawl.json' })
  const projects = crawled.records[0] as Target
  assert.deepEqual(projects.controls, [{ role: 'button', name: 'Remove project', outcome: 'blocked' }, { role: 'button', name: 'Add project', outcome: 'unreached' }])
  const links = tieObjects(objects, [projects], { schema: 'civic.object-ties/0', ties: [{ targets: [projects.id], object: 'object:app.project' }] }, { source: { tool: 'civic', importer: 'object-ties', revision: 'r1' } })
  const graph = assemble(fragment([...crawled.records, ...objects] as never, [...crawled.links, ...links]))
  assert.deepEqual(validateGraph(graph).filter((issue) => issue.severity === 'error'), [])
  assert.deepEqual(objectMapOf(indexGraph(graph)).gaps.filter((gap) => gap.kind === 'object-action-no-inverse'), [])
  // Without the blocked control, the same app has an object that can be added and never removed.
  const without = readCrawl({ ...crawl, blocked: [] }, { prefix: 'app', owners: [...owners], path: 'crawl.json' })
  const bare = assemble(fragment([...without.records, ...objects] as never, [...without.links, ...links]))
  assert.deepEqual(objectMapOf(indexGraph(bare)).gaps.filter((gap) => gap.kind === 'object-action-no-inverse').map((gap) => gap.detail), ['add-project'])
})

test('a call to action may declare its kind, and a decision that makes it one-way', () => {
  const [project] = readOrcaGrid('x,Project\ncalls to action,Lagg till projekt [add]\ncalls to action,Ta bort projekt [remove]\ncalls to action,Add forever [add; one-way docs/decisions/0042.md: Permanent records]\ncalls to action,Plain\n', { prefix: 'app', owners: [...owners], source })
  assert.deepEqual(project!.actions, [
    { key: 'lagg-till-projekt', title: 'Lagg till projekt', kind: 'add' },
    { key: 'ta-bort-projekt', title: 'Ta bort projekt', kind: 'remove' },
    { key: 'add-forever', title: 'Add forever', kind: 'add', oneWay: { decision: 'docs/decisions/0042.md', reason: 'Permanent records' } },
    { key: 'plain', title: 'Plain' },
  ])
  assert.throws(() => readOrcaGrid('x,Project\ncalls to action,Add [add\n', { prefix: 'app', owners: [...owners], source }), /bracket CIVIC can't read/)
})
