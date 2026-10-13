#!/usr/bin/env node
// Builds the Card demo graph from what each tool produced: the declared Card contract,
// mappings and product manifest, Fluent's vendored web, iOS and Android Card source, the
// design system's Figma library and the product team's Figma file. A product designer
// changed the Card; CIVIC forecasts each change per platform, raises it as unreviewed
// drift, checks the design for missing states and journey dead ends (D32), and keeps the
// maintainers' decisions. Copies of the Card in design and code are inferred as forks, and
// the one Shop design confirmed is raised as drift too (decision 0011). Deterministic, and nothing here makes a model call (D30).
//
//   node build.ts           write out/
//   node build.ts --check   fail if out/ is not what the inputs produce

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import {
  assertValid,
  completenessOf,
  frameWalk,
  gapsIn,
  indexGraph,
  renderCompleteness,
  renderGaps,
  designAndCode,
  renderDesignAndCode,
  renderInstanceReview,
  renderWalk,
  renderWalkPage,
  reviewInstance,
  type DecisionFile,
  type ExtensionPoint,
  type GraphDocument,
  type GraphRecord,
  type Link,
  type Override,
  type PlatformComponent,
  type SemanticComponent,
  type SourceRef,
} from '../../graph/src/index.ts'
import {
  applyConfirmations,
  applyDecisions,
  assemble,
  compareLibraryDefaults,
  contentHash,
  fragment,
  jsDestructuredDefault,
  kotlinEnumCases,
  kotlinFunctionParameters,
  raiseOverrideDrift,
  readFigmaLibraryComponent,
  readFigmaProductFile,
  readReactProductCode,
  customElementMembers,
  readPublishedComponents,
  readPlatformComponent,
  swiftEnumCases,
  swiftPropertyDefault,
  swiftPublicMembers,
  tsExportedComponents,
  tsPropUnion,
  tsTypeKeys,
  type ConfirmationFile,
  type LibraryComponentMapping,
  type PlatformMapping,
  type ProductManifest,
} from '../../importers/src/index.ts'

const here = (path: string) => new URL(path, import.meta.url)
const text = (path: string) => readFileSync(here(path), 'utf8')
const json = <T>(path: string) => JSON.parse(text(path)) as T

interface SourceInput {
  tool: string
  package: string
  revision: string
  files: Record<string, string>
}
const sources = json<{ retrievedAt: string; inputs: Record<string, SourceInput> }>('sources/sources.json')
const mappings = json<{ semanticId: string; platforms: PlatformMapping[]; library: LibraryComponentMapping }>('contract/mappings.json')
const product = json<ProductManifest>('contract/product.json')
const capturedAt = sources.retrievedAt

/** A vendored file's text and the source reference that pins it to its upstream revision. */
function vendored(input: string, file: string, importer: string): { text: string; source: SourceRef } {
  const spec = sources.inputs[input]
  const upstream = spec?.files[file]
  if (!spec || !upstream) throw new Error(`sources.json has no ${input}/${file}.`)
  const body = text(`sources/${input}/${file}`)
  return { text: body, source: { tool: spec.tool, importer, revision: spec.revision, path: `${spec.package}/${upstream}`, contentHash: contentHash(body) } }
}

function localSource(path: string, importer: string): SourceRef {
  return { tool: 'civic', importer, revision: contentHash(text(path)), path: `demo/card/${path}` }
}

function platformMapping(platform: string, framework?: string): PlatformMapping {
  const found = mappings.platforms.find((candidate) => candidate.platform === platform && (!framework || candidate.framework === framework))
  if (!found) throw new Error(`mappings.json has no ${platform}${framework ? ` ${framework}` : ''} platform.`)
  return found
}

// --- The contract, declared by people -------------------------------------------------

const contractFile = json<{ records: GraphRecord[]; links: Link[] }>('contract/card.json')
const contractSource = localSource('contract/card.json', 'contract')
const contract = fragment(
  contractFile.records.map((record) => ({ ...record, source: contractSource })),
  contractFile.links,
)
const semantic = contractFile.records.find((record): record is SemanticComponent => record.id === mappings.semanticId && record.kind === 'semantic-component')
if (!semantic) throw new Error(`contract/card.json does not define ${mappings.semanticId}.`)

// --- Web: Fluent React v9 Card (slots and props: a flexible library) -------------------

const dts = vendored('react-card', 'index.d.ts', 'react-types')
const useCard = vendored('react-card', 'useCard.js', 'react-types')
const web = readPlatformComponent(
  semantic.id,
  platformMapping('web', 'react'),
  {
    variants: tsPropUnion(dts.text, 'CardProps', 'appearance').map((name) => ({ name, deprecated: false })),
    defaultVariant: jsDestructuredDefault(useCard.text, 'appearance'),
    // Card's own props and slots, the parts it composes with, and CardHeader's slots by part.
    members: [
      ...tsTypeKeys(dts.text, 'CardProps'),
      ...tsTypeKeys(dts.text, 'CardSlots'),
      ...tsExportedComponents(dts.text),
      ...tsTypeKeys(dts.text, 'CardHeaderSlots').map((slot) => `CardHeader.${slot}`),
    ],
    source: dts.source,
    capturedAt,
  },
  { package: '@fluentui/react-card', version: '9.7.3' },
)

// --- Web, second framework: Fluent Web Components <fluent-card> (decision 0011) -------
// One content slot and a fill color: a product building with web components gets its own
// forecast on web, never React's slots.

const cardDefinition = vendored('web-components', 'card.vscode.definition.json', 'custom-elements')
const webComponents = readPlatformComponent(
  semantic.id,
  platformMapping('web', 'web-components'),
  { variants: [], defaultVariant: '', members: customElementMembers(cardDefinition.text, 'fluent-card'), source: cardDefinition.source, capturedAt },
  { package: '@fluentui/web-components', version: '2.6.1' },
)

// --- iOS: fluentui-apple CardView (a UIKit widget with fixed parts: a brittle library) --

const cardView = vendored('fluentui-apple', 'CardView.swift', 'swift-source')
const ios = readPlatformComponent(
  semantic.id,
  platformMapping('ios'),
  {
    variants: swiftEnumCases(cardView.text, 'CardColorStyle'),
    defaultVariant: swiftPropertyDefault(cardView.text, 'colorStyle'),
    members: swiftPublicMembers(cardView.text),
    source: cardView.source,
    capturedAt,
  },
  { package: 'microsoft/fluentui-apple', version: sources.inputs['fluentui-apple']!.revision.slice(0, 12) },
)

// --- Android: fluentui-android BasicCard (an empty container with one content slot) ----

const basicCard = vendored('fluentui-android', 'BasicCard.kt', 'kotlin-source')
const basicCardTokens = vendored('fluentui-android', 'BasicCardTokens.kt', 'kotlin-source')
const parameters = kotlinFunctionParameters(basicCard.text, 'BasicCard')
const typeDefault = parameters.find((parameter) => parameter.name === 'cardType')?.default
if (!typeDefault) throw new Error('BasicCard has no default cardType parameter.')
const android = readPlatformComponent(
  semantic.id,
  platformMapping('android'),
  {
    variants: kotlinEnumCases(basicCardTokens.text, 'CardType'),
    defaultVariant: typeDefault.replace(/^CardType\./, ''),
    members: parameters.map((parameter) => parameter.name),
    source: basicCardTokens.source,
    capturedAt,
  },
  { package: 'microsoft/fluentui-android', version: sources.inputs['fluentui-android']!.revision.slice(0, 12) },
)

// --- Design: the library's Card and the product team's file ---------------------------

const libraryFile = json<{ lastModified: string }>('design/library.figma.json')
const library = readFigmaLibraryComponent(libraryFile, mappings.library, libraryFile.lastModified)
const productFile = json<{ lastModified: string }>('design/shop-checkout.figma.json')
// Shop's own patterns library, the product-level layer of its lineage (decision 0011).
const patterns = readPublishedComponents(json('design/shop-patterns.figma.json'), 'shop-patterns')
const shop = readFigmaProductFile(productFile, library, product, productFile.lastModified, { file: 'shop-checkout', libraries: [patterns] })
const designEvidence = shop.records.find((record) => record.kind === 'evidence')!.id
// What the library's Card shows by default, against what each platform's component can express.
const libraryDefaults = fragment(
  compareLibraryDefaults(
    semantic,
    library,
    [web, webComponents, ios, android].map((part) => {
      const component = part.records.find((record): record is PlatformComponent => record.kind === 'platform-component')!
      return {
        component,
        extensionPoints: part.records.filter((record): record is ExtensionPoint => record.kind === 'extension-point'),
        evidenceId: `evidence:${component.id.slice('platform:'.length)}.variants`,
      }
    }),
  ),
)

// --- Code: Shop's React code, read for its uses of the library (decision 0011) ---------

const codeFiles = (readdirSync(here('code/src'), { recursive: true }) as string[])
  .filter((name) => name.endsWith('.tsx'))
  .sort()
  .map((name) => ({ path: `code/src/${name}`, text: text(`code/src/${name}`) }))
const libraryComponents = [web, webComponents].map((part) => ({
  component: part.records.find((record): record is PlatformComponent => record.kind === 'platform-component')!,
  extensionPoints: part.records.filter((record): record is ExtensionPoint => record.kind === 'extension-point'),
  semanticId: semantic.id,
}))
const shopCode = readReactProductCode(codeFiles, {
  product: product.product,
  owners: product.owners,
  components: libraryComponents,
  screens: Object.fromEntries((product.codeScreens ?? []).filter((screen) => screen.platform === 'web').map((screen) => [screen.path, screen.target])),
  alongside: shop,
  source: { tool: 'civic', importer: 'react-code', revision: contentHash(codeFiles.map((file) => file.text).join('\n')) },
  evidenceId: `evidence:${product.product}.web.code`,
  capturedAt,
})

// --- Forks: a person's call on the copies CIVIC inferred, then every override as drift ---

const confirmationsText = text('contract/confirmations.json')
const shopProduct = applyConfirmations(fragment([...shop.records, ...shopCode.records], [...shop.links, ...shopCode.links]), JSON.parse(confirmationsText) as ConfirmationFile, 'demo/card/contract/confirmations.json', confirmationsText)
const overrides = shopProduct.records.filter((record): record is Override => record.kind === 'override')
const drift = fragment(raiseOverrideDrift(semantic, overrides, { design: designEvidence, contract: library.evidence.id }))

// --- Assemble, decide, export ---------------------------------------------------------

const raised = assemble(contract, web, webComponents, ios, android, fragment([library.evidence]), shopProduct, drift, libraryDefaults)
const resolved = applyDecisions(raised, json<DecisionFile>('contract/decisions.json'))
assertValid(raised)
assertValid(resolved)

const INSTANCE = `instance:${product.product}.order-summary.card`
const JOURNEY = `target:${product.product}.checkout`
const exportFor = (document: GraphDocument) => {
  const graph = indexGraph(document)
  return {
    review: `${renderInstanceReview(graph, reviewInstance(graph, INSTANCE))}\n`,
    gaps: `${renderGaps(gapsIn(graph, { scope: semantic.id }))}\n`,
  }
}
const raisedExport = exportFor(raised)
const resolvedExport = exportFor(resolved)
const raisedGraph = indexGraph(raised)
const outputs: Record<string, string> = {
  'out/raised.graph.json': `${JSON.stringify(raised, null, 2)}\n`,
  'out/resolved.graph.json': `${JSON.stringify(resolved, null, 2)}\n`,
  'out/raised.overrides.md': raisedExport.review,
  'out/resolved.overrides.md': resolvedExport.review,
  'out/raised.gaps.md': raisedExport.gaps,
  'out/resolved.gaps.md': resolvedExport.gaps,
  'out/design-and-code.md': `# Design and code\n\nWhat Shop's React code builds of each design change, screen by screen, and where either uses a copy of the Card (decision 0011). Read from the stand-in code in \`code/src\` and the design file; static analysis, not behavior.\n\n${renderDesignAndCode(indexGraph(resolved), ['target:shop.order-summary', 'target:shop.gift-options', 'target:shop.promo-applied'].flatMap((screen) => designAndCode(indexGraph(resolved), screen)))}\n`,
  'out/completeness.md': `${renderCompleteness(raisedGraph, completenessOf(raisedGraph, JOURNEY))}\n`,
  // The frame walk (D33): Shop's checkout frames along their prototype links, as design intent.
  'out/walk.md': `${renderWalk(frameWalk(indexGraph(resolved), JOURNEY))}\n`,
  'out/walk.html': renderWalkPage(frameWalk(indexGraph(resolved), JOURNEY)),
}

const summary = `${raised.records.length} records, ${raised.links.length} links, ${overrides.length} override(s) raised as drift, ${libraryDefaults.records.length} library default(s) a platform can't build`
if (process.argv.includes('--check')) {
  const stale = Object.entries(outputs).filter(([path, body]) => {
    try {
      return text(path) !== body
    } catch {
      return true
    }
  })
  if (stale.length > 0) {
    console.error(`Out of date: ${stale.map(([path]) => path).join(', ')}. Run node demo/card/build.ts and commit the result.`)
    process.exitCode = 1
  } else {
    console.log(`demo/card/out is current: ${summary}.`)
  }
} else {
  for (const [path, body] of Object.entries(outputs)) writeFileSync(here(path), body)
  console.log(`Wrote demo/card/out: ${summary}.`)
}
