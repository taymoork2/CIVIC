import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assertValid, indexGraph, type GraphRecord, type Link } from '../../graph/src/index.ts'
import { assemble, compareTokenSets, fragment, rebrandDivergences, rebrandImpact, renderRebrand } from '../src/index.ts'

// A rebrand is a token release (decision 0012).

const before = { radius: { $type: 'dimension', medium: { $value: '4px' }, large: { $value: '6px' } }, brand: { $type: 'color', $value: '#0f6cbd' }, gone: { $type: 'color', $value: '#000000' } }
const after = { radius: { $type: 'dimension', medium: { $value: '8px' }, large: { $value: '6px' } }, brand: { $type: 'color', $value: '#117b88' }, fresh: { $type: 'color', $value: '#ffffff' } }

test('compareTokenSets lists changed, added and removed tokens by path', () => {
  assert.deepEqual(compareTokenSets(before, after), [
    { path: 'brand', type: 'color', status: 'changed', before: '#0f6cbd', after: '#117b88' },
    { path: 'fresh', type: 'color', status: 'added', after: '#ffffff' },
    { path: 'gone', type: 'color', status: 'removed', before: '#000000' },
    { path: 'radius.medium', type: 'dimension', status: 'changed', before: '4px', after: '8px' },
  ])
})

const ds = [{ role: 'design' as const, who: 'ds' }]
const shop = [{ role: 'design' as const, who: 'shop-design' }]
const instance = (id: string, extra: Record<string, unknown>) => ({ id, kind: 'component-instance', title: id, semanticId: 'semantic:card', placedOn: 'target:screen', product: 'shop', origin: 'design', library: { file: 'kit', key: 'k', matchedBy: 'key' }, owners: shop, ...extra })
const records = [
  { id: 'semantic:card', kind: 'semantic-component', title: 'Card', purpose: 'Group.', variants: [{ key: 'filled', title: 'Filled' }], states: ['rest'], owners: ds },
  { id: 'platform:web.card', kind: 'platform-component', title: 'Web Card', platform: 'web', framework: 'react', library: { package: 'web-card' }, symbol: 'Card', variants: [], owners: ds },
  { id: 'platform:ios.card', kind: 'platform-component', title: 'iOS Card', platform: 'ios', framework: 'uikit', library: { package: 'ios-card' }, symbol: 'Card', variants: [], owners: ds },
  { id: 'token:radius.medium', kind: 'token', title: 'radius.medium', path: 'radius.medium', type: 'dimension' },
  { id: 'token:brand', kind: 'token', title: 'brand', path: 'brand', type: 'color' },
  { id: 'target:screen', kind: 'target', title: 'Screen', scale: 'screen', presence: 'expected', owners: shop },
  instance('instance:plain', {}),
  instance('instance:pinned', {}),
  instance('instance:code', { origin: 'code', platform: 'web', library: { file: 'web-card', key: 'Card', matchedBy: 'key' }, owners: [{ role: 'engineering', who: 'shop-eng' }] }),
  instance('instance:fork', { library: { file: 'kit', key: 'k', matchedBy: 'inferred' }, fork: { status: 'confirmed', basis: 'copied', confirmedBy: shop[0] } }),
  instance('instance:maybe', { library: { file: 'kit', key: 'k', matchedBy: 'inferred' }, fork: { status: 'inferred', basis: 'named Card' } }),
  { id: 'override:pinned.radius', kind: 'override', title: 'Local radius 12', instanceId: 'instance:pinned', property: 'corner-radius', change: 'local-style', value: 12, madeBy: shop[0] },
] as unknown as GraphRecord[]
const links: Link[] = [
  { from: 'platform:web.card', relation: 'implements', to: 'semantic:card', status: 'declared' },
  { from: 'platform:ios.card', relation: 'implements', to: 'semantic:card', status: 'declared' },
  { from: 'platform:web.card', relation: 'uses-token', to: 'token:radius.medium', status: 'declared' },
]

test('rebrandImpact follows uses-token to instances, and lists what does not follow', () => {
  const graph = indexGraph(assemble(fragment(records, links)))
  const rebrand = rebrandImpact(graph, compareTokenSets(before, after), { propertyTokens: { 'semantic:card': { 'corner-radius': 'radius.medium' } }, designLibraries: { kit: 'web' } })
  assert.equal(rebrand.reach.length, 1)
  assert.deepEqual(rebrand.reach[0]!.instances, ['instance:code', 'instance:plain'], 'the pinned instance and the forks do not follow')
  assert.deepEqual(rebrand.reach[0]!.screens, ['target:screen'])
  assert.deepEqual(rebrand.unread.map((change) => change.path), ['brand', 'fresh', 'gone'])
  assert.deepEqual(rebrand.notRead.map((component) => component.id), ['platform:ios.card'], 'a platform whose styles were not read is never counted as unaffected')
  assert.deepEqual(rebrand.hidden.map((entry) => [entry.instance.id, entry.reason, entry.action]), [
    ['instance:fork', 'fork', 'reattach'],
    ['instance:pinned', 'literal', 'keep-with-exception'],
  ])
  assert.deepEqual(rebrand.unconfirmed.map((entry) => [entry.instance.id, entry.action]), [['instance:maybe', 'confirm-fork']])

  const divergences = rebrandDivergences(rebrand, { brand: 'Harbor', slug: 'harbor', raisedBy: ds[0]!, at: '2026-10-13T00:00:00Z' })
  assert.deepEqual(divergences.map((record) => record.id), ['collab:divergence.harbor.fork', 'collab:divergence.harbor.pinned.corner-radius'])
  assert.ok(divergences.every((record) => record.type === 'divergence' && record.status === 'open' && record.owners[0]!.who === 'shop-design'))
  assertValid(assemble(fragment(records, links), fragment(divergences)))
  const table = renderRebrand(graph, rebrand, { title: 'T', brand: 'Harbor', from: 'a', to: 'b' })
  assert.match(table, /\| `radius.medium` \| 4px \| 8px \| Web Card \|/)
  assert.match(table, /iOS Card \(ios\)/)
})

test('a literal equal to the old or new token value is replaced with the token', () => {
  const pinnedToOld = records.map((record) => (record.id === 'override:pinned.radius' ? { ...record, value: 4 } : record)) as GraphRecord[]
  const rebrand = rebrandImpact(indexGraph(assemble(fragment(pinnedToOld, links))), compareTokenSets(before, after), { propertyTokens: { 'semantic:card': { 'corner-radius': 'radius.medium' } }, designLibraries: { kit: 'web' } })
  assert.equal(rebrand.hidden.find((entry) => entry.reason === 'literal')!.action, 'replace-literal')
})
