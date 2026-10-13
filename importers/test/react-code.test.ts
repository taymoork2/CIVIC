import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ExtensionPoint, PlatformComponent } from '../../graph/src/index.ts'
import { fragment, readReactProductCode, type CodeLibraryComponent } from '../src/index.ts'

const component: PlatformComponent = {
  id: 'platform:ds.card', kind: 'platform-component', title: 'Card', platform: 'web', framework: 'react', library: { package: '@ds/card' }, symbol: 'Card', defaultVariant: 'filled',
  variants: [{ semanticVariant: 'filled', mapping: 'exact', expression: 'filled' }, { semanticVariant: 'outline', mapping: 'exact', expression: 'outline' }],
}
const point = (name: string, mechanism: ExtensionPoint['mechanism'], expresses: string[]): ExtensionPoint => ({ id: `extension:ds.card.${name}`, kind: 'extension-point', title: name, platformComponentId: component.id, mechanism, name, expresses })
const library: CodeLibraryComponent = {
  component,
  semanticId: 'semantic:card',
  extensionPoints: [point('appearance', 'prop', ['variant']), point('selected', 'prop', ['state.selected']), point('CardHeader.header', 'slot', ['header.title']), point('CardFooter', 'slot', ['actions'])],
}
const options = (screens: Record<string, string>) => ({
  product: 'shop',
  owners: [{ role: 'engineering' as const, who: 'eng' }, { role: 'design' as const, who: 'des' }],
  components: [library],
  screens,
  source: { tool: 'git', importer: 'react-code', revision: 'abc' },
  evidenceId: 'evidence:shop.web.code',
  capturedAt: 'now',
})

test('a library component is found by import, with its variant, props and parts read as the extension points they set', () => {
  const screen = `import { Card as DsCard, CardHeader, CardFooter } from '@ds/card'
import { Card } from './local-card'
export function Summary({ open }) {
  return (
    <main>
      <Card title="not the library's" />
      <DsCard appearance="outline" selected={open} onClick={() => go('{')} {...rest}>
        <CardHeader header="Your order" />
        <DsCard>nested</DsCard>
        <CardFooter><button>Pay</button></CardFooter>
      </DsCard>
    </main>
  )
}`
  const { records, links } = readReactProductCode([{ path: 'src/Summary.tsx', text: screen }], options({ 'src/Summary.tsx': 'target:shop.summary' }))
  const instances = records.filter((record) => record.kind === 'component-instance')
  assert.deepEqual(instances.map((record) => [record.id, record.variant, record.origin, record.placedOn, record.source?.anchor]), [
    ['instance:shop.summary.web.card', 'outline', 'code', 'target:shop.summary', 'L7'],
    ['instance:shop.summary.web.card.2', 'filled', 'code', 'target:shop.summary', 'L9'],
  ])
  assert.deepEqual(instances[0]!.uses, [
    { extensionPointId: 'extension:ds.card.selected', property: 'state.selected' },
    { extensionPointId: 'extension:ds.card.CardHeader.header', property: 'header.title', value: 'Your order' },
    { extensionPointId: 'extension:ds.card.CardFooter', property: 'actions' },
  ])
  assert.deepEqual(instances[0]!.owners, [{ role: 'engineering', who: 'eng' }])
  assert.equal(links.length, 2)
  assert.throws(() => readReactProductCode([{ path: 'src/Summary.tsx', text: screen.replace('"outline"', '"subtle"') }], options({ 'src/Summary.tsx': 'target:shop.summary' })), /appearance="subtle" maps to no semantic variant/)
})

test('a wrapper is read once, as a product component its screens contain, and joins a design component of the same name', () => {
  const wrapper = `import { Card } from '@ds/card'\nexport function GiftOption() { return <Card /> }`
  const screen = `import { GiftOption } from './GiftOption'\nexport function Gifts() { return <><GiftOption /><GiftOption /></> }`
  const files = [{ path: 'src/GiftOption.tsx', text: wrapper }, { path: 'src/Gifts.tsx', text: screen }]
  const alone = readReactProductCode(files, options({ 'src/Gifts.tsx': 'target:shop.gifts' }))
  assert.deepEqual(alone.records.filter((record) => record.kind !== 'evidence').map((record) => record.id), ['target:shop.component.gift-option', 'instance:shop.component.gift-option.web.card'])
  assert.deepEqual(alone.links.map((link) => [link.from, link.to]), [['target:shop.component.gift-option', 'instance:shop.component.gift-option.web.card'], ['target:shop.gifts', 'target:shop.component.gift-option']])
  // When the design already has the component placed on that screen, the code adds only its instance.
  const design = fragment(
    [{ id: 'target:shop.gifts', kind: 'target', title: 'Gifts', scale: 'screen', presence: 'expected' }, { id: 'target:shop.component.gift-option', kind: 'target', title: 'Gift option', scale: 'component', presence: 'expected' }],
    [{ from: 'target:shop.gifts', relation: 'contains', to: 'target:shop.component.gift-option', status: 'declared' }],
  )
  const joined = readReactProductCode(files, { ...options({ 'src/Gifts.tsx': 'target:shop.gifts' }), alongside: design })
  assert.deepEqual(joined.records.filter((record) => record.kind !== 'evidence').map((record) => record.id), ['instance:shop.component.gift-option.web.card'])
  assert.equal(joined.links.length, 1)
  assert.throws(() => readReactProductCode(files, { ...options({ 'src/Gifts.tsx': 'target:shop.elsewhere' }), alongside: design }), /name target:shop.elsewhere, which the graph does not have/)
})
