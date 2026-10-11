import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { SemanticComponent } from '../../graph/src/index.ts'
import { raiseOverrideDrift, readFigmaLibraryComponent, readFigmaProductFile, tsExportedComponents, type LibraryComponentMapping, type ProductManifest } from '../src/index.ts'

const mapping: LibraryComponentMapping = {
  semanticId: 'semantic:card',
  componentSet: 'Card',
  variantProperty: 'Appearance',
  variants: { Filled: 'filled' },
  stateProperty: 'State',
  states: { Rest: 'rest', Loading: 'loading' },
  properties: { 'Show footer': { property: 'actions', change: 'add-content' }, Title: { content: true } },
  styleFields: { cornerRadius: 'corner-radius' },
}
const product: ProductManifest = { product: 'shop', title: 'Shop', platforms: ['web', 'ios'], owners: [{ role: 'design', who: 'shop-design' }, { role: 'qa', who: 'shop-qa' }] }

const libraryFile = () => ({
  name: 'Library',
  version: '7',
  lastModified: 'now',
  document: {
    id: '0:0', name: 'Document', type: 'DOCUMENT', children: [{
      id: '1:0', name: 'Components', type: 'CANVAS', children: [{
        id: '1:1', name: 'Card', type: 'COMPONENT_SET', children: [],
        componentPropertyDefinitions: {
          Appearance: { type: 'VARIANT', defaultValue: 'Filled', variantOptions: ['Filled', 'Outline'] },
          State: { type: 'VARIANT', defaultValue: 'Rest', variantOptions: ['Rest', 'Loading'] },
          'Show footer#1:2': { type: 'BOOLEAN', defaultValue: false },
          'Title#1:3': { type: 'TEXT', defaultValue: 'Title' },
        },
      }],
    }],
  },
})

const instance = (id: string, state: string, extra: Record<string, unknown> = {}) => ({
  id, name: 'Card', type: 'INSTANCE', componentId: '9:1',
  componentProperties: { Appearance: { type: 'VARIANT', value: 'Filled' }, State: { type: 'VARIANT', value: state }, 'Show footer#1:2': { type: 'BOOLEAN', value: false }, 'Title#1:3': { type: 'TEXT', value: 'Your order' } },
  ...extra,
})

const productFile = (frames: unknown[], flow = '2:1') => ({
  name: 'Shop',
  version: '42',
  lastModified: 'now',
  document: { id: '0:0', name: 'Document', type: 'DOCUMENT', children: [{ id: '2:0', name: 'Checkout', type: 'CANVAS', flowStartingPoints: [{ nodeId: flow, name: 'Checkout flow' }], children: frames }] },
  components: { '9:1': { key: 'k', name: 'Appearance=Filled, State=Rest', componentSetId: '9:0', remote: true } },
  componentSets: { '9:0': { key: 'card', name: 'Card', remote: true } },
})

const library = () => readFigmaLibraryComponent(libraryFile(), mapping, 'now')

test('reads library defaults by bare property name, and refuses an undeclared option or property', () => {
  assert.deepEqual(library().defaults, { 'Show footer': false, Title: 'Title' })
  assert.throws(() => readFigmaLibraryComponent(libraryFile(), { ...mapping, states: { Rest: 'rest', Error: 'error' } }, 'now'), /State has no option Error/)
  assert.throws(() => readFigmaLibraryComponent(libraryFile(), { ...mapping, properties: { Badge: { content: true } } }, 'now'), /no component property Badge/)
})

test('reads screens, state frames, prototype paths, instances and their overrides', () => {
  const file = productFile([
    { id: '2:1', name: 'Order Summary', type: 'FRAME', children: [
      instance('2:2', 'Rest', { cornerRadius: 20, overrides: [{ id: '2:2', overriddenFields: ['cornerRadius', 'strokes'] }], componentProperties: { ...instance('2:2', 'Rest').componentProperties, 'Show footer#1:2': { type: 'BOOLEAN', value: true } } }),
      { id: '2:3', name: 'Pay', type: 'INSTANCE', componentId: '8:1', reactions: [{ trigger: { type: 'ON_CLICK' }, actions: [{ type: 'URL', url: '/pay' }] }] },
      { id: '2:4', name: 'Done', type: 'INSTANCE', componentId: '8:1', reactions: [{ trigger: { type: 'ON_CLICK' }, actions: [{ type: 'NODE', destinationId: '2:6', navigation: 'NAVIGATE' }] }] },
    ] },
    { id: '2:5', name: 'Order Summary / Loading', type: 'FRAME', children: [instance('2:7', 'Loading')] },
    { id: '2:6', name: 'Thanks', type: 'FRAME', children: [] },
  ])
  const { records, links } = readFigmaProductFile(file, library(), product, 'now')
  const byId = Object.fromEntries(records.map((record) => [record.id, record]))
  assert.deepEqual(Object.keys(byId).sort(), [
    'evidence:figma.shop.shop',
    'instance:shop.order-summary.card',
    'instance:shop.order-summary.loading.card',
    'override:shop.order-summary.card.actions',
    'override:shop.order-summary.card.corner-radius',
    'override:shop.order-summary.card.unmapped-strokes',
    'target:shop.checkout',
    'target:shop.order-summary',
    'target:shop.order-summary.loading',
    'target:shop.thanks',
  ])
  assert.deepEqual(byId['target:shop.checkout'], { ...byId['target:shop.checkout'], scale: 'journey', title: 'Checkout flow', entry: ['target:shop.order-summary'] })
  assert.equal((byId['target:shop.order-summary.loading'] as { scale: string }).scale, 'state')
  assert.deepEqual([(byId['instance:shop.order-summary.card'] as { state: string }).state, (byId['instance:shop.order-summary.loading.card'] as { state: string }).state], ['rest', 'loading'])
  assert.deepEqual(byId['override:shop.order-summary.card.corner-radius'], { ...byId['override:shop.order-summary.card.corner-radius'], property: 'corner-radius', change: 'local-style', value: 20 })
  assert.equal((byId['override:shop.order-summary.card.unmapped-strokes'] as { property: string }).property, 'unmapped.strokes')
  const paths = links.filter((link) => link.relation === 'navigates').map((link) => [link.from, link.to ?? link.unmapped, link.action])
  assert.deepEqual(paths, [['target:shop.order-summary', '/pay', 'Pay'], ['target:shop.order-summary', 'target:shop.thanks', 'Done']])
  assert.ok(links.some((link) => link.from === 'target:shop.order-summary' && link.relation === 'contains' && link.to === 'target:shop.order-summary.loading'))
  assert.ok(links.some((link) => link.from === 'target:shop.checkout' && link.relation === 'contains' && link.to === 'target:shop.thanks'))
})

test('setting a content property, or a property to its library default, is not an override', () => {
  const { records } = readFigmaProductFile(productFile([{ id: '2:1', name: 'Order Summary', type: 'FRAME', children: [instance('2:2', 'Rest')] }]), library(), product, 'now')
  assert.deepEqual(records.filter((record) => record.kind === 'override'), [])
})

test('undeclared names, misnamed frames and flows that start nowhere fail the import', () => {
  const read = (file: unknown) => readFigmaProductFile(file, library(), product, 'now')
  const undeclared = instance('2:2', 'Rest')
  undeclared.componentProperties = { ...undeclared.componentProperties, 'Badge#1:9': { type: 'BOOLEAN', value: true } } as typeof undeclared.componentProperties
  assert.throws(() => read(productFile([{ id: '2:1', name: 'Order Summary', type: 'FRAME', children: [undeclared] }])), /sets Badge, which the Card mapping does not declare/)
  assert.throws(() => read(productFile([{ id: '2:1', name: 'Order Summary', type: 'FRAME', children: [instance('2:2', 'Hover')] }])), /State=Hover/)
  assert.throws(() => read(productFile([{ id: '2:1', name: 'A / B / C', type: 'FRAME', children: [] }])), /not named <Screen>/)
  assert.throws(() => read(productFile([{ id: '2:1', name: 'Order Summary', type: 'FRAME', children: [] }, { id: '2:5', name: 'Cart / Empty', type: 'FRAME', children: [] }])), /no screen frame for target:shop.cart/)
  assert.throws(() => read(productFile([{ id: '2:1', name: 'Order Summary', type: 'FRAME', children: [] }], '2:9')), /starts on 2:9/)
})

test('each override is raised as open, unreviewed drift that asks its maker and the contract owners', () => {
  const semantic: SemanticComponent = { id: 'semantic:card', kind: 'semantic-component', title: 'Card', purpose: 'Group.', variants: [{ key: 'filled', title: 'Filled' }], states: ['rest'], owners: [{ role: 'design', who: 'ds' }, { role: 'qa', who: 'q' }] }
  const [conflict] = raiseOverrideDrift(semantic, [{ id: 'override:shop.x.card.actions', kind: 'override', title: 'Footer', instanceId: 'instance:shop.x.card', property: 'actions', change: 'add-content', madeBy: { role: 'design', who: 'shop-design' } }], { design: 'evidence:a', contract: 'evidence:b' })
  assert.equal(conflict!.id, 'conflict:shop.x.card.actions')
  assert.deepEqual([conflict!.alignment, conflict!.classification], ['unreviewed-drift', 'unclassified'])
  assert.deepEqual(conflict!.owners.map((owner) => owner.who), ['shop-design', 'ds'])
})

test('reads the components a declaration file exports', () => {
  const dts = 'export declare const Card: ForwardRefComponent<CardProps>;\nexport declare const cardClassNames: SlotClassNames<CardSlots>;\nexport declare const CardFooter: ForwardRefComponent<CardFooterProps>;\n'
  assert.deepEqual(tsExportedComponents(dts), ['Card', 'CardFooter'])
})
