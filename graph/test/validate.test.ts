import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validateGraph, type Issue } from '../src/index.ts'
import type { GraphDocument } from '../src/schema.ts'
import { edited, example, record } from './helpers.ts'

const errorCodes = (document: unknown) =>
  validateGraph(document).filter((issue: Issue) => issue.severity === 'error').map((issue) => issue.code)

test('both examples are valid graphs with no warnings', () => {
  assert.deepEqual(validateGraph(example('fluent-button')), [])
  assert.deepEqual(validateGraph(example('card-override')), [])
})

test('rejects a document that is not schema v0', () => {
  assert.deepEqual(errorCodes({ schema: 'civic.graph/1', records: [], links: [] }), ['schema-version'])
  assert.deepEqual(errorCodes([]), ['shape'])
})

const cases: [string, 'fluent-button' | 'card-override', (document: GraphDocument) => void, string][] = [
  ['an ID without a kind prefix', 'fluent-button', (d) => { record(d, 'semantic:button').id = 'button' }, 'id-format'],
  ['an ID whose prefix names another kind', 'fluent-button', (d) => { record(d, 'semantic:button').id = 'platform:button' }, 'id-kind'],
  ['a duplicate ID', 'fluent-button', (d) => { d.records.push({ ...d.records[0]! }) }, 'duplicate-id'],
  ['an unknown record kind', 'fluent-button', (d) => { record(d, 'semantic:button').kind = 'widget' }, 'shape'],
  ['a token whose ID is not its path', 'fluent-button', (d) => { record(d, 'token:colorBrandBackground').path = 'color.brand' }, 'token-id'],
  ['a reference to a missing record', 'card-override', (d) => { record(d, 'override:shop.order-summary.card.radius').instanceId = 'instance:gone' }, 'dangling-reference'],
  ['a reference to the wrong kind', 'card-override', (d) => { record(d, 'instance:shop.order-summary.card').placedOn = 'semantic:card' }, 'reference-kind'],
  ['a variant the semantic component does not define', 'fluent-button', (d) => {
    record<{ variants: { semanticVariant: string }[] }>(d, 'platform:fluent-apple.button').variants[0]!.semanticVariant = 'floating'
  }, 'unknown-variant'],
  ['a mapped variant with no expression', 'fluent-button', (d) => {
    delete record<{ variants: { expression?: string }[] }>(d, 'platform:fluent-apple.button').variants[0]!.expression
  }, 'shape'],
  ['a code instance with no platform', 'card-override', (d) => { record(d, 'instance:shop.order-summary.card').origin = 'code' }, 'instance-platform'],
  ['evidence with no revision', 'fluent-button', (d) => { delete record(d, 'evidence:compose-source.button.styles').source }, 'evidence-revision'],
  ['source analysis claiming to be automated evidence', 'fluent-button', (d) => { record(d, 'evidence:compose-source.button.styles').tier = 'automated' }, 'evidence-overclaims'],
  ['a finding that says nothing', 'fluent-button', (d) => { delete record(d, 'evidence:compose-source.button.styles').finding }, 'finding-missing'],
  ['a conflict with one side', 'fluent-button', (d) => { record<{ sides: unknown[] }>(d, 'conflict:button.android.neutral-default').sides.pop() }, 'conflict-sides'],
  ['a conflict with no owners', 'fluent-button', (d) => { record(d, 'conflict:button.android.neutral-default').owners = [] }, 'conflict-owners'],
  ['an open conflict marked aligned', 'fluent-button', (d) => { record(d, 'conflict:button.android.neutral-default').alignment = 'aligned' }, 'alignment-inconsistent'],
  ['a resolved conflict with no resolution', 'fluent-button', (d) => { record(d, 'conflict:button.android.neutral-default').status = 'resolved' }, 'resolution-missing'],
  ['an observed link with only static evidence', 'card-override', (d) => {
    d.records.push({ id: 'evidence:promo.source', kind: 'evidence', title: 'Promo route in source', subjectIds: ['target:shop.order-summary'], tier: 'static-analysis', method: 'source-analysis', outcome: 'finding', finding: 'A route exists.', capturedAt: '2026-10-11T00:00:00Z', source: { tool: 'github', importer: 'test', revision: 'abc' } })
    const link = d.links.find((l) => l.action === 'Apply promotion')!
    link.status = 'observed'
    link.evidenceIds = ['evidence:promo.source']
  }, 'observed-without-run'],
  ['an observed link backed by a failed run', 'card-override', (d) => {
    d.records.push({ id: 'evidence:promo.run', kind: 'evidence', title: 'Promo run', subjectIds: ['target:shop.order-summary'], tier: 'automated', method: 'playwright', outcome: 'fail', capturedAt: '2026-10-11T00:00:00Z', source: { tool: 'playwright', importer: 'test', revision: 'abc' } })
    const link = d.links.find((l) => l.action === 'Apply promotion')!
    link.status = 'observed'
    link.evidenceIds = ['evidence:promo.run']
  }, 'observed-without-run'],
  ['a link with no destination that is not navigation', 'card-override', (d) => { delete d.links[0]!.to }, 'unmapped-edge'],
  ['a mapped link that also carries an unmapped hint', 'card-override', (d) => { d.links[0]!.unmapped = '/x' }, 'unmapped-edge'],
  ['navigation fields on a non-navigation link', 'card-override', (d) => { d.links[0]!.route = '/x' }, 'shape'],
  ['the same link twice', 'card-override', (d) => { d.links.push({ ...d.links[0]! }) }, 'duplicate-link'],
  ['a relation joining the wrong kinds', 'card-override', (d) => { d.links[0]!.to = 'target:shop.checkout' }, 'reference-kind'],
]

for (const [name, base, edit, code] of cases) {
  test(`rejects ${name}`, () => {
    assert.ok(errorCodes(edited(base, edit)).includes(code), `expected ${code} in ${JSON.stringify(errorCodes(edited(base, edit)))}`)
  })
}

test('a resolved conflict needs evidence for the decided outcome', () => {
  const resolve = (resolution: Record<string, unknown>, alignment: string) => edited('fluent-button', (d) => {
    const conflict = record(d, 'conflict:button.android.neutral-default')
    conflict.status = 'resolved'
    conflict.alignment = alignment
    conflict.resolution = { decidedBy: { role: 'design', who: 'design-system-maintainers' }, at: '2026-10-12T00:00:00Z', rationale: 'Compose is the source of truth.', ...resolution }
  })
  const proof = ['evidence:compose-source.button.styles']
  assert.deepEqual(errorCodes(resolve({ outcome: 'update-design', evidenceIds: proof }, 'awaiting-adoption')), [])
  assert.ok(errorCodes(resolve({ outcome: 'update-design', evidenceIds: [] }, 'awaiting-adoption')).includes('resolution-evidence'))
  assert.ok(errorCodes(resolve({ outcome: 'approve-exception', evidenceIds: proof }, 'accepted-limitation')).includes('exception-revisit'))
  assert.deepEqual(errorCodes(resolve({ outcome: 'approve-exception', evidenceIds: proof, revisitTrigger: 'Compose ships a neutral style' }, 'accepted-limitation')), [])
  assert.ok(errorCodes(resolve({ outcome: 'approve-exception', evidenceIds: proof, revisitTrigger: 'later' }, 'aligned')).includes('alignment-inconsistent'))
})

test('a re-anchored ID is kept and references to it must be updated explicitly', () => {
  const moved = edited('card-override', (d) => {
    const screen = record(d, 'target:shop.order-summary')
    screen.id = 'target:shop.review-order'
    screen.formerIds = [{ id: 'target:shop.order-summary', reason: 'Screen renamed', by: { role: 'design', who: 'shop-design' }, at: '2026-10-11T00:00:00Z' }]
  })
  const issues = validateGraph(moved).filter((issue) => issue.severity === 'error')
  assert.ok(issues.length > 0)
  assert.ok(issues.every((issue) => issue.code === 'reanchor-needed'), JSON.stringify(issues))

  const reused = edited('card-override', (d) => {
    record(d, 'target:shop.checkout').formerIds = [{ id: 'target:shop.order-summary', reason: 'Merged', by: { role: 'design', who: 'shop-design' }, at: '2026-10-11T00:00:00Z' }]
  })
  assert.ok(errorCodes(reused).includes('former-id-collision'))
})

test('warns when a platform component is not linked or leaves a variant unmapped', () => {
  const unlinked = edited('fluent-button', (d) => { d.links = d.links.filter((l) => l.from !== 'platform:fluent-apple.button') })
  assert.ok(validateGraph(unlinked).some((issue) => issue.code === 'unimplemented' && issue.severity === 'warning'))

  const proposedOnly = edited('fluent-button', (d) => { d.links.find((l) => l.from === 'platform:fluent-apple.button')!.status = 'proposed' })
  assert.ok(validateGraph(proposedOnly).some((issue) => issue.code === 'unimplemented'))

  const missing = edited('fluent-button', (d) => { record<{ variants: unknown[] }>(d, 'platform:fluent-apple.button').variants.pop() })
  assert.ok(validateGraph(missing).some((issue) => issue.code === 'unmapped-variant' && issue.severity === 'warning'))
})
