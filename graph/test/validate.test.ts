import assert from 'node:assert/strict'
import { test } from 'node:test'
import { conflictState, decisionFor, indexGraph, validateGraph, type Issue } from '../src/index.ts'
import type { ContractConflict, Decision, GraphDocument, GraphRecord } from '../src/schema.ts'
import { decide, edited, example, record } from './helpers.ts'

const PROOF = ['evidence:compose-source.button.styles']

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
  ['a default variant the semantic component does not define', 'fluent-button', (d) => {
    record(d, 'platform:fluent-apple.button').defaultVariant = 'floating'
  }, 'unknown-variant'],
  ['an extra variant without its expression', 'fluent-button', (d) => {
    record(d, 'platform:fluent-apple.button').extraVariants = [{ note: 'floating' }]
  }, 'shape'],
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
  ['a conflict that still carries an inline resolution', 'fluent-button', (d) => { record(d, 'conflict:button.android.neutral-default').status = 'resolved' }, 'decision-inline'],
  ['a decision on something that is not a conflict', 'fluent-button', (d) => { decide(d, 'conflict:button.android.neutral-default', { evidenceIds: PROOF }).conflictId = 'semantic:button' }, 'reference-kind'],
  ['a decision that leaves the conflict unclassified', 'fluent-button', (d) => { decide(d, 'conflict:button.android.neutral-default', { evidenceIds: PROOF, classification: 'unclassified' }) }, 'decision-unclassified'],
  ['an expiry on a decision that is not an exception', 'fluent-button', (d) => { decide(d, 'conflict:button.android.neutral-default', { evidenceIds: PROOF, expires: '2027-01-01' }) }, 'decision-expires'],
  ['two decisions in force on one conflict', 'fluent-button', (d) => {
    decide(d, 'conflict:button.android.neutral-default', { evidenceIds: PROOF })
    decide(d, 'conflict:button.android.neutral-default', { evidenceIds: PROOF, id: 'decision:button.android.neutral-default.2' })
  }, 'decisions-in-force'],
  ['one decision superseded by two later ones', 'fluent-button', (d) => {
    decide(d, 'conflict:button.android.neutral-default', { evidenceIds: PROOF })
    decide(d, 'conflict:button.android.neutral-default', { evidenceIds: PROOF, id: 'decision:button.android.neutral-default.2', supersedes: 'decision:button.android.neutral-default' })
    decide(d, 'conflict:button.android.neutral-default', { evidenceIds: PROOF, id: 'decision:button.android.neutral-default.3', supersedes: 'decision:button.android.neutral-default' })
  }, 'supersedes-twice'],
  ['a decision superseding one on another conflict', 'fluent-button', (d) => {
    decide(d, 'conflict:button.android.neutral-default', { evidenceIds: PROOF })
    d.records.push({ ...record(d, 'conflict:button.android.neutral-default'), id: 'conflict:button.android.other' } as GraphRecord)
    decide(d, 'conflict:button.android.other', { evidenceIds: PROOF, supersedes: 'decision:button.android.neutral-default' })
  }, 'supersedes-other-conflict'],
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

test('a decision needs evidence for the decided outcome', () => {
  const resolve = (fields: Partial<Decision> & Pick<Decision, 'evidenceIds'>) =>
    edited('fluent-button', (d) => { decide(d, 'conflict:button.android.neutral-default', fields) })
  assert.deepEqual(errorCodes(resolve({ outcome: 'update-design', evidenceIds: PROOF })), [])
  assert.ok(errorCodes(resolve({ outcome: 'update-design', evidenceIds: [] })).includes('decision-evidence'))
  assert.ok(errorCodes(resolve({ outcome: 'approve-exception', alignment: 'accepted-limitation', evidenceIds: PROOF })).includes('exception-revisit'))
  assert.deepEqual(errorCodes(resolve({ outcome: 'approve-exception', alignment: 'accepted-limitation', evidenceIds: PROOF, revisitTrigger: 'Compose ships a neutral style' })), [])
  assert.ok(errorCodes(resolve({ outcome: 'approve-exception', alignment: 'aligned', evidenceIds: PROOF, revisitTrigger: 'later' })).includes('alignment-inconsistent'))
})

test('a later decision supersedes an earlier one, and only the later one is in force', () => {
  const document = edited('fluent-button', (d) => {
    decide(d, 'conflict:button.android.neutral-default', { evidenceIds: PROOF })
    decide(d, 'conflict:button.android.neutral-default', {
      id: 'decision:button.android.neutral-default.2',
      at: '2026-10-13T00:00:00Z',
      outcome: 'approve-exception',
      classification: 'temporary-gap',
      alignment: 'accepted-limitation',
      revisitTrigger: 'Compose ships a neutral style.',
      supersedes: 'decision:button.android.neutral-default',
      evidenceIds: PROOF,
    })
  })
  assert.deepEqual(errorCodes(document), [])
  const graph = indexGraph(document)
  assert.equal(decisionFor(graph, 'conflict:button.android.neutral-default')?.id, 'decision:button.android.neutral-default.2')
  const state = conflictState(graph, record<ContractConflict>(document, 'conflict:button.android.neutral-default'))
  assert.deepEqual([state.status, state.classification, state.alignment], ['decided', 'temporary-gap', 'accepted-limitation'])
})

test('a decision by someone who does not own the conflict is a warning', () => {
  const document = edited('fluent-button', (d) => { decide(d, 'conflict:button.android.neutral-default', { evidenceIds: PROOF, decidedBy: { role: 'qa', who: 'someone' } }) })
  assert.ok(validateGraph(document).some((issue) => issue.severity === 'warning' && issue.code === 'decision-not-owner'))
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
