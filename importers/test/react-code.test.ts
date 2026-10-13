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

test('a product file that exports a library component\'s name, imported from the product\'s own code, is an inferred fork wherever it renders', () => {
  const copy = `// Copied from @ds/card to add an illustration.\nexport default function Card({ children }) { return <div>{children}</div> }`
  const named = `export const Card = ({ children }) => <section>{children}</section>`
  const screen = `import Card from '../vendor/card/Card'\nimport { Card as Plain } from '../../shared/card'\nexport function Promo() { return <><Card>One</Card><Card>Two</Card><Plain /></> }`
  // A wrapper renders the library component itself, so it is no copy even under the same name.
  const wrapper = `import { Card as Library } from '@ds/card'\nexport function Card() { return <Library /> }`
  const files = [
    { path: 'src/vendor/card/Card.tsx', text: copy },
    { path: 'shared/card/index.tsx', text: named },
    { path: 'src/pages/Promo.tsx', text: screen },
    { path: 'src/Wrapped.tsx', text: wrapper },
  ]
  const { records, links } = readReactProductCode(files, options({ 'src/pages/Promo.tsx': 'target:shop.promo' }))
  const forks = records.filter((record) => record.kind === 'component-instance' && record.fork)
  assert.deepEqual(forks.map((record) => record.id), ['instance:shop.promo.web.card.fork', 'instance:shop.promo.web.card.fork.2', 'instance:shop.promo.web.card.fork.3'])
  assert.deepEqual(forks.map((record) => record.kind === 'component-instance' && [record.fork!.status, record.library, record.source?.anchor]), [
    ['inferred', { file: '@ds/card', key: 'Card', matchedBy: 'inferred' }, 'L3'],
    ['inferred', { file: '@ds/card', key: 'Card', matchedBy: 'inferred' }, 'L3'],
    ['inferred', { file: '@ds/card', key: 'Card', matchedBy: 'inferred' }, 'L3'],
  ])
  assert.equal(forks[0]!.kind === 'component-instance' && forks[0]!.fork!.basis, "renders src/vendor/card/Card.tsx, which exports Card, the name of @ds/card's component; mentions @ds/card; lives in a vendored folder")
  assert.equal(forks[2]!.kind === 'component-instance' && forks[2]!.fork!.basis, "renders shared/card/index.tsx, which exports Card, the name of @ds/card's component")
  assert.ok(forks.every((record) => record.kind === 'component-instance' && !record.uses && record.owners?.every((owner) => owner.role === 'engineering')))
  assert.equal(links.filter((link) => link.from === 'target:shop.promo').length, 3)
  // The wrapper is still a wrapper.
  assert.ok(records.some((record) => record.id === 'target:shop.component.card'))
  assert.match((records.find((record) => record.kind === 'evidence') as { finding: string }).finding, /2 copies of a library component \(src\/vendor\/card\/Card\.tsx, shared\/card\/index\.tsx\), rendered 3 time\(s\), inferred for a person to confirm/)
})
