import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validateGraph, type ComponentInstance, type GraphRecord, type SemanticComponent } from '../../graph/src/index.ts'
import { applyConfirmations, assemble, fragment, type ConfirmationFile } from '../src/index.ts'

// A person's call on the forks the importers inferred (decision 0011, point 5).

const card: SemanticComponent = { id: 'semantic:card', kind: 'semantic-component', title: 'Card', purpose: 'Group.', variants: [{ key: 'filled', title: 'Filled' }], states: ['rest'] }
const screen: GraphRecord = { id: 'target:shop.promo', kind: 'target', title: 'Promo', scale: 'screen', presence: 'expected', platforms: ['web'] }
const fork = (id: string, origin: ComponentInstance['origin']): ComponentInstance => ({
  id,
  kind: 'component-instance',
  title: `Copy ${id}`,
  semanticId: card.id,
  placedOn: screen.id,
  product: 'shop',
  origin,
  ...(origin === 'code' ? { platform: 'web' as const } : {}),
  library: { file: 'ds', key: 'Card', matchedBy: 'inferred' },
  fork: { status: 'inferred', basis: 'named "Card"' },
  owners: [{ role: origin === 'design' ? 'design' : 'engineering', who: `shop-${origin}` }],
})
const imported = () =>
  fragment(
    [card, screen, fork('instance:shop.promo.card.fork', 'design'), fork('instance:shop.promo.web.card.fork', 'code')],
    ['instance:shop.promo.card.fork', 'instance:shop.promo.web.card.fork'].map((to) => ({ from: screen.id, relation: 'contains' as const, to, status: 'declared' as const })),
  )
const file = (calls: Partial<ConfirmationFile>): ConfirmationFile => ({ schema: 'civic.confirmations/0', by: { role: 'design', who: 'shop-design' }, at: 'now', ...calls })

test('a confirmed fork gets a detach override its maker owns; a dismissed one is dropped with its links', () => {
  const result = applyConfirmations(imported(), file({ forks: ['instance:shop.promo.card.fork'], notForks: ['instance:shop.promo.web.card.fork'] }), 'confirmations.json', '{}')
  const confirmed = result.records.find((record) => record.id === 'instance:shop.promo.card.fork') as ComponentInstance
  assert.deepEqual(confirmed.fork, { status: 'confirmed', basis: 'named "Card"', confirmedBy: { role: 'design', who: 'shop-design' } })
  const override = result.records.find((record) => record.kind === 'override')
  assert.deepEqual(override && { ...override, source: undefined }, {
    id: 'override:shop.promo.card.fork.detach',
    kind: 'override',
    title: 'Copy instance:shop.promo.card.fork is a copy of the library component',
    instanceId: 'instance:shop.promo.card.fork',
    property: 'component',
    change: 'detach',
    madeBy: { role: 'design', who: 'shop-design' },
    source: undefined,
  })
  assert.equal(override?.source?.importer, 'confirmations')
  assert.ok(!result.records.some((record) => record.id === 'instance:shop.promo.web.card.fork'))
  assert.deepEqual(result.links.map((link) => link.to), ['instance:shop.promo.card.fork'])
  assert.deepEqual(validateGraph(assemble(result)), [])
})

test('a confirmation for something no importer inferred as a fork, or both calls at once, fails', () => {
  assert.throws(() => applyConfirmations(imported(), file({ forks: ['instance:shop.promo.gone.fork'] }), 'c.json', '{}'), /no importer inferred as a fork: instance:shop\.promo\.gone\.fork/)
  assert.throws(() => applyConfirmations(imported(), file({ forks: ['instance:shop.promo.card.fork'], notForks: ['instance:shop.promo.card.fork'] }), 'c.json', '{}'), /Confirmed and dismissed as a fork at once/)
  // Confirming twice: the second run finds a confirmed fork, not an inferred one.
  const once = applyConfirmations(imported(), file({ forks: ['instance:shop.promo.card.fork'] }), 'c.json', '{}')
  assert.throws(() => applyConfirmations(once, file({ forks: ['instance:shop.promo.card.fork'] }), 'c.json', '{}'), /no importer inferred as a fork/)
})

test('a fork is matched by inference and says why; a confirmed one names who confirmed it', () => {
  const codes = (records: GraphRecord[]) => validateGraph(assemble(fragment([card, screen, ...records], []))).map((issue) => issue.code)
  assert.deepEqual(codes([{ ...fork('instance:shop.promo.card.fork', 'design'), fork: { status: 'confirmed', basis: 'x' } }]), ['instance-fork'])
  assert.deepEqual(codes([{ ...fork('instance:shop.promo.card.fork', 'design'), fork: undefined }]), ['instance-fork'])
  assert.deepEqual(codes([{ ...fork('instance:shop.promo.card.fork', 'design'), fork: { status: 'maybe' as never, basis: 'x' } }]), ['instance-fork'])
})
