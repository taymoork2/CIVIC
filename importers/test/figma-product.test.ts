import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validateGraph, type Evidence, type SemanticComponent } from '../../graph/src/index.ts'
import { trimFigmaFile } from '../src/figma-trim.ts'
import { assemble, compareLibraryDefaults, fragment, raiseOverrideDrift, readFigmaLibraryComponent, readFigmaProductFile, tsExportedComponents, type LibraryComponentMapping, type ProductManifest } from '../src/index.ts'

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

test('a nested part\'s properties are read from its own instance, and several can mean one contract property', () => {
  const header = { id: '1:5', name: 'Header', type: 'COMPONENT_SET', children: [], componentPropertyDefinitions: {
    'Checkbox#1:6': { type: 'BOOLEAN', defaultValue: false },
    'Avatar#1:7': { type: 'BOOLEAN', defaultValue: false },
    'Icon#1:8': { type: 'BOOLEAN', defaultValue: true },
  } }
  const withHeader = libraryFile()
  withHeader.document.children[0]!.children.push(header as never)
  const parts = { Header: { Checkbox: { property: 'state.selected', change: 'set-property' as const }, Avatar: { property: 'header.image', change: 'add-content' as const }, Icon: { property: 'header.image', change: 'add-content' as const } } }
  const nested = readFigmaLibraryComponent(withHeader, { ...mapping, parts }, 'now')
  assert.deepEqual(nested.defaults, { 'Show footer': false, Title: 'Title', 'Header / Checkbox': false, 'Header / Avatar': false, 'Header / Icon': true })
  assert.throws(() => readFigmaLibraryComponent(withHeader, { ...mapping, parts: { Header: { Badge: { content: true } } } }, 'now'), /Header has no component property Badge/)
  assert.throws(() => readFigmaLibraryComponent(libraryFile(), { ...mapping, parts }, 'now'), /no component set named Header/)

  const headerInstance = (properties: Record<string, boolean>) => ({ id: '2:9', name: 'Header', type: 'INSTANCE', componentId: '9:2',
    componentProperties: Object.fromEntries(Object.entries(properties).map(([name, value], index) => [`${name}#1:${6 + index}`, { type: 'BOOLEAN', value }])) })
  const file = (properties: Record<string, boolean>) => {
    const base = productFile([{ id: '2:1', name: 'Order Summary', type: 'FRAME', children: [instance('2:2', 'Rest', { children: [{ id: '2:8', name: 'Header container', type: 'FRAME', children: [headerInstance(properties)] }] })] }])
    return { ...base, components: { ...base.components, '9:2': { key: 'h', name: 'Default', componentSetId: '9:3', remote: true } }, componentSets: { ...base.componentSets, '9:3': { key: 'header', name: 'Header', remote: true } } }
  }
  const overrides = readFigmaProductFile(file({ Checkbox: true, Avatar: true, Icon: false }), nested, product, 'now').records.filter((record) => record.kind === 'override')
  assert.deepEqual(overrides.map((override) => [override.id, override.title]), [
    ['override:shop.order-summary.card.state-selected', 'Header / Checkbox set to true'],
    ['override:shop.order-summary.card.header-image', 'Header / Avatar set to true'],
    ['override:shop.order-summary.card.header-image.header-icon', 'Header / Icon set to false'],
  ])
  assert.throws(() => readFigmaProductFile(file({ Checkbox: true, Avatar: false, Icon: true, Badge: true }), nested, product, 'now'), /Header in instance "Card" sets Badge/)
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

test('a trimmed export keeps only the path to its targets, and the components their swaps default to', () => {
  const full = {
    ...libraryFile(),
    schemaVersion: 0,
    components: { '5:1': { key: 'icon', name: 'Icon', componentSetId: '5:0' }, '5:2': { key: 'other', name: 'Other', remote: true }, '5:3': { key: 'logo', name: 'Logo', description: 'Long.' } },
    componentSets: { '1:1': { key: 'card', name: 'Card', description: 'Long.' }, '6:0': { key: 'their-button', name: 'Button', remote: true } },
  }
  const set = full.document.children[0]!.children[0]! as { children: unknown[]; componentPropertyDefinitions: Record<string, unknown> }
  set.children.push({ id: '1:9', name: 'Appearance=Filled, State=Rest', type: 'COMPONENT', cornerRadius: 4, children: [{ id: '1:10', name: 'Art', type: 'VECTOR' }] })
  set.componentPropertyDefinitions['Icon#1:4'] = { type: 'INSTANCE_SWAP', defaultValue: '5:1' }
  full.document.children.push({ id: '3:0', name: 'Artwork', type: 'CANVAS', children: [] } as never)
  const trimmed = trimFigmaFile(full, [{ type: 'COMPONENT_SET', name: 'Card' }]) as { document: { children: { name: string; children: { children: unknown[] }[] }[] }; components: unknown; componentSets: unknown }
  assert.deepEqual(trimmed.document.children.map((page) => page.name), ['Components'])
  assert.deepEqual(trimmed.document.children[0]!.children[0]!.children, [{ id: '1:9', name: 'Appearance=Filled, State=Rest', type: 'COMPONENT' }])
  // The swap default stays whole; everything the file publishes stays as its key and name; what it uses from other libraries goes.
  assert.deepEqual(trimmed.components, { '5:1': { key: 'icon', name: 'Icon', componentSetId: '5:0' }, '5:3': { key: 'logo', name: 'Logo' } })
  assert.deepEqual(trimmed.componentSets, { '1:1': { key: 'card', name: 'Card' } })
  assert.equal(readFigmaLibraryComponent(trimmed, mapping, 'now').defaults.Title, 'Title')
  assert.throws(() => trimFigmaFile(full, [{ type: 'COMPONENT_SET', name: 'Card' }, { type: 'FRAME', name: 'Buttons' }]), /Library has no Buttons/)
})

test('content the library shows by default is raised for each platform with no extension point for it', () => {
  const semantic: SemanticComponent = { id: 'semantic:card', kind: 'semantic-component', title: 'Card', purpose: 'Group.', variants: [{ key: 'filled', title: 'Filled' }], states: ['rest'], owners: [{ role: 'design', who: 'ds' }, { role: 'qa', who: 'q' }] }
  const file = libraryFile()
  const set = file.document.children[0]!.children[0]! as { componentPropertyDefinitions: Record<string, unknown> }
  set.componentPropertyDefinitions['Show footer#1:2'] = { type: 'BOOLEAN', defaultValue: true }
  set.componentPropertyDefinitions['Badge#1:4'] = { type: 'BOOLEAN', defaultValue: false }
  const facts = readFigmaLibraryComponent(file, { ...mapping, properties: { ...mapping.properties, Badge: { property: 'header.action', change: 'add-content' } } }, 'now')
  const component = (platform: 'web' | 'ios') => ({ id: `platform:${platform}.card`, kind: 'platform-component' as const, title: `${platform} Card`, platform, library: { package: 'x' }, symbol: 'Card', variants: [], source: { tool: 't', importer: 'i', revision: 'r', path: 'p' } })
  const web = { component: component('web'), extensionPoints: [{ id: 'extension:web.card.footer', kind: 'extension-point' as const, title: 'Footer', platformComponentId: 'platform:web.card', mechanism: 'slot' as const, name: 'CardFooter', expresses: ['actions'], source: component('web').source }], evidenceId: 'evidence:web' }
  const ios = { component: component('ios'), extensionPoints: [], evidenceId: 'evidence:ios' }
  const conflicts = compareLibraryDefaults(semantic, facts, [web, ios])
  // The footer is on by default and iOS can't express it; the badge is off by default, so nothing inherits it.
  assert.deepEqual(conflicts.map((conflict) => conflict.id), ['conflict:card.ios.default.actions'])
  assert.deepEqual(conflicts[0]!.sides.map((side) => side.evidenceIds), [['evidence:figma.library.card'], ['evidence:ios']])
})

const keyed = (mappingKey?: string) => {
  const file = { ...libraryFile(), components: { '1:5': { key: 'badge', name: 'Badge' } }, componentSets: { '1:1': { key: 'card', name: 'Card' } } }
  return readFigmaLibraryComponent(file, { ...mapping, ...(mappingKey ? { key: mappingKey } : {}), file: 'kit' }, 'now')
}

test('a library mapping with a key finds its component set by that key, and refuses a key the file does not publish', () => {
  const facts = keyed('card')
  assert.match(facts.evidence.finding!, /Found by its published key card\./)
  assert.deepEqual(facts.published, { file: 'kit', title: 'Library', revision: '7', keys: { card: 'Card', badge: 'Badge' } })
  assert.throws(() => keyed('card-v2'), /Library: publishes no component set with key card-v2 \(Card\)/)
  assert.match(keyed().evidence.finding!, /Found by name/)
})

test('instances match the library by published key, so another library\'s Card is not taken for it', () => {
  const file = productFile([{ id: '2:1', name: 'Order Summary', type: 'FRAME', children: [instance('2:2', 'Rest'), { ...instance('2:3', 'Rest'), name: 'Their card', componentId: '7:1' }] }])
  file.components['7:1' as '9:1'] = { key: 'k2', name: 'Appearance=Filled, State=Rest', componentSetId: '7:0', remote: true }
  file.componentSets['7:0' as '9:0'] = { key: 'their-card', name: 'Card', remote: true }
  const byKey = readFigmaProductFile(file, keyed('card'), product, 'now').records.filter((record) => record.kind === 'component-instance')
  assert.deepEqual(byKey.map((record) => [record.id, record.library]), [['instance:shop.order-summary.card', { file: 'kit', key: 'card', matchedBy: 'key' }]])
  // Without a key, both are matched by name, recorded as the weaker match.
  const byName = readFigmaProductFile(file, keyed(), product, 'now')
  assert.deepEqual(byName.records.filter((record) => record.kind === 'component-instance').map((record) => record.library?.matchedBy), ['name', 'name'])
  assert.match(byName.records.find((record) => record.kind === 'evidence')!.finding!, /matched by name, a weaker match/)
})

test('with a declared lineage, every placed component is traced to a consumed library, and one from none is a failing finding', () => {
  const lineage: ProductManifest = {
    ...product,
    designFiles: [
      { tool: 'figma', file: 'shop', title: 'Shop', layers: ['product'], consumes: ['kit', 'patterns'] },
      { tool: 'figma', file: 'patterns', title: 'Patterns', layers: ['product-library'], consumes: ['kit'] },
      { tool: 'figma', file: 'kit', title: 'Kit', layers: ['design-system', 'component-library'] },
    ],
  }
  const patterns = { file: 'patterns', title: 'Patterns', revision: '3', keys: { promo: 'Promo banner' } }
  const placed = (id: string, name: string, componentId: string) => ({ id, name, type: 'INSTANCE', componentId, children: [{ id: `I${id};1`, name: 'Inside', type: 'INSTANCE', componentId: '8:9' }] })
  const file = productFile([{ id: '2:1', name: 'Order Summary', type: 'FRAME', children: [
    instance('2:2', 'Rest'),
    { id: '2:3', name: 'Group', type: 'GROUP', children: [placed('2:4', 'Badge', '8:1'), placed('2:5', 'Promo', '8:2'), placed('2:6', 'Sticker', '8:3'), placed('2:7', 'Local note', '8:4')] },
  ] }])
  Object.assign(file.components, {
    '8:1': { key: 'badge', name: 'Badge', remote: true },
    '8:2': { key: 'promo-success', name: 'Tone=Success', componentSetId: '8:0', remote: true },
    '8:3': { key: 'sticker', name: 'Sticker', remote: true },
    '8:4': { key: 'note', name: 'Note' },
    '8:9': { key: 'unknown-inside', name: 'Inside', remote: true },
  })
  Object.assign(file.componentSets, { '8:0': { key: 'promo', name: 'Promo banner', remote: true } })
  const { records } = readFigmaProductFile(file, keyed('card'), lineage, 'now', { file: 'shop', libraries: [patterns] })
  const failing = records.filter((record): record is Evidence => record.kind === 'evidence' && record.outcome === 'fail')
  assert.deepEqual(failing.map((record) => [record.id, record.subjectIds]), [['evidence:figma.shop.order-summary.unknown-component.sticker', ['target:shop.order-summary']]])
  assert.match(failing[0]!.finding!, /Sticker \(key sticker\), which none of kit, patterns publishes/)
  assert.match((records.find((record) => record.id === 'evidence:figma.shop.shop') as Evidence).finding!, /Consumes kit, patterns; other placements: 1 from kit \(Badge\); 1 from patterns \(Promo banner\)\./)
  const card: SemanticComponent = { id: 'semantic:card', kind: 'semantic-component', title: 'Card', purpose: 'Group.', variants: [{ key: 'filled', title: 'Filled' }], states: ['rest', 'loading'], owners: [{ role: 'design', who: 'ds' }] }
  assert.deepEqual(validateGraph(assemble(fragment([card, ...records]))).filter((issue) => issue.severity === 'error'), [])

  assert.throws(() => readFigmaProductFile(file, keyed('card'), lineage, 'now', { file: 'shop' }), /shop consumes patterns, which was not read/)
  const withoutKit = { ...lineage, designFiles: [{ tool: 'figma', file: 'shop', title: 'Shop', layers: ['product'], consumes: ['patterns'] }] }
  assert.throws(() => readFigmaProductFile(file, keyed('card'), withoutKit, 'now', { file: 'shop', libraries: [patterns] }), /shop does not declare that it consumes kit, the Card library/)
  assert.throws(() => readFigmaProductFile(file, keyed('card'), lineage, 'now', { file: 'checkout' }), /declares no design file checkout/)
})
