#!/usr/bin/env node
// Builds the rebrand demo (decision 0012): a stand-in second brand, Harbor, over Fluent 2 web
// light, read as a token release. It reads the Button and Card demos' graphs, adds the web
// Card's token links from its vendored styles, and writes the blast radius, the migration
// table and an open divergence for each hidden override. Deterministic, and nothing here
// makes a model call (D30).
//
//   node build.ts           write out/
//   node build.ts --check   fail if out/ is not what the inputs produce

import { readFileSync, writeFileSync } from 'node:fs'
import { assertValid, indexGraph, type GraphDocument, type Link, type Owner } from '../../graph/src/index.ts'
import { assemble, compareTokenSets, contentHash, fragment, jsDestructuredDefault, jsTokenReferences, readDtcgTokens, rebrandDivergences, rebrandImpact, renderRebrand } from '../../importers/src/index.ts'

const here = (path: string) => new URL(path, import.meta.url)
const text = (path: string) => readFileSync(here(path), 'utf8')
const json = <T>(path: string) => JSON.parse(text(path)) as T

const sources = json<{ retrievedAt: string; inputs: Record<string, { tool: string; package: string; revision: string; files: Record<string, string> }> }>('sources/sources.json')
const at = sources.retrievedAt

// --- The two brands ------------------------------------------------------------------

const FLUENT = '../fluent-button/tokens/fluent-web-light.tokens.json'
type DtcgFile = Record<string, unknown> & { $extensions: { 'civic.source': { revision: string } } }
const fluent = json<DtcgFile>(FLUENT)
const theme = json<{ brandRamp: Record<string, [string, string]>; tokens: Record<string, string> }>('tokens/harbor.theme.json')

// Harbor swaps each Fluent brand ramp slot for its own and sets the radius scale, the way a
// Fluent theme is made from a brand ramp. Every token whose value is a ramp slot moves with it.
const ramp = new Map(Object.values(theme.brandRamp).map(([from, to]) => [from.toLowerCase(), to]))
const harbor: Record<string, unknown> = {
  $description: 'Harbor, a made-up second brand over Fluent 2 web light, built by demo/rebrand/build.ts from tokens/harbor.theme.json. Not a real company\'s theme.',
  $extensions: { 'civic.source': { tool: 'civic', revision: contentHash(text('tokens/harbor.theme.json')), theme: 'harbor', base: fluent.$extensions['civic.source'].revision } },
}
for (const [path, token] of Object.entries(fluent)) {
  if (path.startsWith('$')) continue
  const { $type, $value } = token as { $type: string; $value: unknown }
  const swapped = $type === 'color' && typeof $value === 'string' ? ramp.get($value.toLowerCase()) : undefined
  harbor[path] = { $type, $value: theme.tokens[path] ?? swapped ?? $value }
}
const unknownTokens = Object.keys(theme.tokens).filter((path) => !(path in fluent))
if (unknownTokens.length > 0) throw new Error(`harbor.theme.json sets tokens Fluent web light lacks: ${unknownTokens.join(', ')}.`)
const harborText = `${JSON.stringify(harbor, null, 2)}\n`
const changes = compareTokenSets(fluent, harbor)

// --- The graph: the Button and Card demos, and the Card's web token links ---------------

const button = json<GraphDocument>('../fluent-button/out/resolved.graph.json')
const card = json<GraphDocument>('../card/out/resolved.graph.json')

const styles = sources.inputs['react-card']!
const stylesText = text('sources/react-card/useCardStyles.styles.raw.js')
const stylesSource = { tool: styles.tool, importer: 'style-tokens', revision: styles.revision, path: `${styles.package}/${styles.files['useCardStyles.styles.raw.js']}`, contentHash: contentHash(stylesText) }
const tokens = readDtcgTokens(fluent, { tool: 'npm', importer: 'dtcg', revision: fluent.$extensions['civic.source'].revision, path: 'demo/fluent-button/tokens/fluent-web-light.tokens.json', contentHash: contentHash(text(FLUENT)) })
// Fluent's z-index tokens aren't part of a theme, so the theme's token file doesn't have them.
const referenced = jsTokenReferences(stylesText).filter((name) => !name.startsWith('zIndex'))
const missing = referenced.filter((name) => !tokens.has(name))
if (missing.length > 0) throw new Error(`The web Card styles read tokens the DTCG file lacks: ${missing.join(', ')}.`)
const WEB_CARD = 'platform:fluent-react-v9.card'
if (!card.records.some((record) => record.id === WEB_CARD)) throw new Error(`The Card graph has no ${WEB_CARD}.`)
const known = new Set(button.records.map((record) => record.id))
const cardTokens = fragment(
  referenced.map((name) => tokens.get(name)!).filter((token) => !known.has(token.id)),
  referenced.map((name): Link => ({ from: WEB_CARD, relation: 'uses-token', to: `token:${name}`, status: 'declared', source: stylesSource })),
)

// The Card's corner radius is the `--fui-Card--border-radius` variable, which each size sets
// from its own radius token. The default size picks the token a Card on a screen reads.
const size = jsDestructuredDefault(text('../card/sources/react-card/useCard.js'), 'size')
const radiusToken = `borderRadius${size[0]!.toUpperCase()}${size.slice(1)}`
if (!new RegExp(`cardBorderRadiusVar\\]:\\s*tokens\\.${radiusToken}\\b`).test(stylesText)) throw new Error(`The web Card's ${size} size doesn't set its radius from ${radiusToken}.`)

const base = assemble(fragment(button.records, button.links), fragment(card.records, card.links), cardTokens)
const graph = indexGraph(base)
const rebrand = rebrandImpact(graph, changes, {
  propertyTokens: { 'semantic:card': { 'corner-radius': radiusToken } },
  // Shop's design file uses the Fluent 2 web kit, whose variables follow the web tokens.
  designLibraries: { 'fluent-2-web': 'web' },
})

const maintainers: Owner = card.records.find((record) => record.id === 'semantic:card')?.owners?.find((owner) => owner.role === 'design') ?? { role: 'design', who: 'design-system-maintainers' }
const divergences = rebrandDivergences(rebrand, { brand: 'Harbor', slug: 'harbor', raisedBy: maintainers, at })
const document = assemble(fragment(base.records, base.links), fragment(divergences))
assertValid(document)

const migration = renderRebrand(graph, rebrand, { title: 'Harbor rebrand: blast radius and migration', brand: 'Harbor', from: 'Fluent 2 web light', to: 'Harbor (a stand-in brand)' })
const outputs: Record<string, string> = {
  'out/harbor.tokens.json': harborText,
  'out/rebrand.md': migration,
  'out/graph.json': `${JSON.stringify(document, null, 2)}\n`,
}
const summary = `${changes.length} changed tokens, ${rebrand.reach.length} read here, ${rebrand.hidden.length} hidden overrides, ${rebrand.unconfirmed.length} awaiting confirmation, ${rebrand.notRead.length} components not read`

if (process.argv.includes('--check')) {
  const stale = Object.entries(outputs).filter(([path, body]) => {
    try {
      return text(path) !== body
    } catch {
      return true
    }
  })
  if (stale.length > 0) {
    console.error(`Out of date: ${stale.map(([path]) => path).join(', ')}. Run node demo/rebrand/build.ts and commit the result.`)
    process.exitCode = 1
  } else {
    console.log(`demo/rebrand/out is current: ${summary}.`)
  }
} else {
  for (const [path, body] of Object.entries(outputs)) writeFileSync(here(path), body)
  console.log(`Wrote demo/rebrand/out: ${summary}.`)
}
