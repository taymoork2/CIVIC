import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { SemanticComponent } from '../../graph/src/index.ts'
import { designLibraryRelease, designReleaseBreaks, fragment, renderDesignRelease, type LibraryComponentMapping, type ProductManifest } from '../src/index.ts'

// A design library publish is a release (decision 0011, point 8).

const mapping: LibraryComponentMapping = {
  semanticId: 'semantic:card',
  componentSet: 'Card',
  key: 'card-key',
  file: 'kit',
  variantProperty: 'Appearance',
  variants: { Filled: 'filled' },
  stateProperty: 'State',
  states: { Rest: 'rest' },
  properties: { 'Show footer': { property: 'actions', change: 'add-content' }, Title: { content: true } },
  styleFields: {},
  owners: [{ role: 'design', who: 'ds' }],
}
const semantic: SemanticComponent = { id: 'semantic:card', kind: 'semantic-component', title: 'Card', purpose: 'Group.', variants: [{ key: 'filled', title: 'Filled' }], states: ['rest'], owners: [{ role: 'design', who: 'ds' }] }
const product: ProductManifest = {
  product: 'shop',
  title: 'Shop',
  platforms: ['web'],
  owners: [{ role: 'design', who: 'shop-design' }],
  designFiles: [{ tool: 'figma', file: 'shop', title: 'Shop', layers: ['product'], consumes: ['kit'] }],
}

const kit = (version: string, footer: boolean, sets: Record<string, { key: string; name: string }>) => ({
  name: 'Kit',
  version,
  lastModified: 'now',
  document: {
    id: '0:0', name: 'Document', type: 'DOCUMENT', children: [{
      id: '1:0', name: 'Components', type: 'CANVAS', children: [{
        id: '1:1', name: 'Card', type: 'COMPONENT_SET', children: [],
        componentPropertyDefinitions: {
          Appearance: { type: 'VARIANT', defaultValue: 'Filled', variantOptions: ['Filled'] },
          State: { type: 'VARIANT', defaultValue: 'Rest', variantOptions: ['Rest'] },
          'Show footer#1:2': { type: 'BOOLEAN', defaultValue: footer },
          'Title#1:3': { type: 'TEXT', defaultValue: 'Title' },
        },
      }],
    }],
  },
  componentSets: sets,
})
const sets = { '1:1': { key: 'card-key', name: 'Card' }, '1:9': { key: 'button-key', name: 'Button' }, '1:8': { key: 'badge-key', name: 'Badge' } }

const shop = (footer: boolean) => ({
  name: 'Shop',
  version: '1',
  lastModified: 'now',
  document: { id: '0:0', name: 'Document', type: 'DOCUMENT', children: [{ id: '2:0', name: 'Checkout', type: 'CANVAS', flowStartingPoints: [{ nodeId: '2:1', name: 'Checkout' }], children: [
    { id: '2:1', name: 'Summary', type: 'FRAME', children: [
      { id: '2:2', name: 'Card', type: 'INSTANCE', componentId: '9:1', componentProperties: { Appearance: { type: 'VARIANT', value: 'Filled' }, State: { type: 'VARIANT', value: 'Rest' }, 'Show footer#1:2': { type: 'BOOLEAN', value: footer } } },
      { id: '2:3', name: 'Pay', type: 'INSTANCE', componentId: '9:2' },
      { id: '2:4', name: 'New', type: 'INSTANCE', componentId: '9:3' },
    ] },
  ] }] },
  components: {
    '9:1': { key: 'k1', name: 'Appearance=Filled, State=Rest', componentSetId: '9:0', remote: true },
    '9:2': { key: 'k2', name: 'Primary', componentSetId: '9:5', remote: true },
    '9:3': { key: 'k3', name: 'Info', componentSetId: '9:6', remote: true },
  },
  componentSets: { '9:0': { key: 'card-key', name: 'Card', remote: true }, '9:5': { key: 'button-key', name: 'Button', remote: true }, '9:6': { key: 'badge-key', name: 'Badge', remote: true } },
})

const options = { file: 'kit', mapping, semantic, platforms: [], context: [fragment([semantic])], capturedAt: 'now' }

test('a removed key orphans the instances that use it, and a renamed one keeps them, because products match by key', () => {
  const next = { '1:1': sets['1:1'], '1:8': { key: 'badge-key', name: 'Status badge' }, '1:7': { key: 'chip-key', name: 'Chip' } }
  const release = designLibraryRelease({ export: kit('1', false, sets) }, { export: kit('2', false, next) }, [{ product, file: 'shop', export: shop(false) }], options)
  assert.deepEqual(release.published, {
    removed: [{ key: 'button-key', name: 'Button' }],
    added: [{ key: 'chip-key', name: 'Chip' }],
    renamed: [{ key: 'badge-key', before: 'Badge', after: 'Status badge' }],
  })
  assert.deepEqual(release.products[0]!.orphaned.map((orphan) => orphan.title), ['"Pay" on Summary is an instance of Button, which the new version no longer publishes'])
  assert.deepEqual([release.products[0]!.told, release.asked], [[{ role: 'design', who: 'shop-design' }], [{ role: 'design', who: 'ds' }]])
  assert.equal(designReleaseBreaks(release), true)
})

test('a changed default makes a new override where the product kept its setting, and absorbs one where it now matches', () => {
  const kept = designLibraryRelease({ export: kit('1', true, sets) }, { export: kit('2', false, sets) }, [{ product, file: 'shop', export: shop(true) }], options)
  assert.deepEqual(kept.defaults, [{ property: 'Show footer', before: true, after: false }])
  assert.deepEqual(kept.products[0]!.newOverrides.map(({ override, forecasts }) => [override.id, forecasts.map((forecast) => forecast.outcome)]), [['override:shop.summary.card.actions', ['needs-library-change']]])
  assert.equal(designReleaseBreaks(kept), true)

  const absorbed = designLibraryRelease({ export: kit('1', true, sets) }, { export: kit('2', false, sets) }, [{ product, file: 'shop', export: shop(false) }], options)
  assert.deepEqual(absorbed.products[0]!.goneOverrides.map((override) => override.id), ['override:shop.summary.card.actions'])
  assert.deepEqual(absorbed.products[0]!.newOverrides, [])
  assert.equal(designReleaseBreaks(absorbed), false)
  assert.match(renderDesignRelease(absorbed), /Overrides the release absorbs, because the product now matches the library:\n\n- Show footer set to false on instance:shop\.summary\.card\./)
})

test('a release without the mapped component orphans every instance of it; a product that does not consume the library is not read', () => {
  const gone = { '1:9': sets['1:9'] }
  const other: ProductManifest = { ...product, product: 'blog', title: 'Blog', designFiles: [{ tool: 'figma', file: 'blog', title: 'Blog', layers: ['product'], consumes: ['other-kit'] }] }
  const release = designLibraryRelease({ export: kit('1', false, sets) }, { export: kit('2', false, gone) }, [{ product, file: 'shop', export: shop(false) }, { product: other, file: 'blog', export: shop(false) }], options)
  assert.match(release.componentMissing!, /publishes no component set with key card-key/)
  assert.deepEqual(release.products.map((impact) => impact.product), ['shop'])
  assert.ok(release.products[0]!.orphaned.some((orphan) => orphan.evidenceId === 'instance:shop.summary.card'))
  assert.equal(designReleaseBreaks(release), true)
})

test('an unchanged library changes nothing', () => {
  const release = designLibraryRelease({ export: kit('1', false, sets) }, { export: kit('1', false, sets) }, [{ product, file: 'shop', export: shop(false) }], options)
  assert.equal(designReleaseBreaks(release), false)
  assert.match(renderDesignRelease(release), /The same components, under the same keys and names\.[\s\S]*Nothing changes for this product\./)
})
