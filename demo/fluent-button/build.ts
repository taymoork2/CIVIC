#!/usr/bin/env node
// Builds the Fluent Button demo graph (roadmap step 2) from what each tool produced:
// the declared contract and mappings, Fluent's vendored web, iOS and Android source, the
// DTCG tokens exported from @fluentui/tokens, the Android Figma kit export, and the
// Playwright report. Deterministic: the same inputs always give byte-identical outputs,
// and nothing here makes a model call (D30).
//
//   node build.ts           write out/
//   node build.ts --check   fail if out/ is not what the inputs produce

import { readFileSync, writeFileSync } from 'node:fs'
import { assertValid, contextFor, gapsIn, indexGraph, renderGaps, renderWorkOrder, type DecisionFile, type Evidence, type GraphRecord, type Link, type SemanticComponent, type SourceRef } from '../../graph/src/index.ts'
import {
  applyDecisions,
  assemble,
  compareDesignKit,
  contentHash,
  fragment,
  jsDestructuredDefault,
  jsTokenReferences,
  kotlinEnumCases,
  kotlinFunctionParameters,
  kotlinStyleArms,
  readDtcgTokens,
  readFigmaComponentSet,
  readPlatformComponent,
  readPlaywrightReport,
  swiftEnumCases,
  swiftPropertyDefault,
  swiftPublicMembers,
  swiftStyleArms,
  tsPropUnion,
  tsTypeKeys,
  type DesignKitMapping,
  type PlatformMapping,
  type StyleArm,
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
const mappings = json<{ semanticId: string; platforms: PlatformMapping[]; designKits: DesignKitMapping[] }>('contract/mappings.json')
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
  const body = text(path)
  return { tool: 'civic', importer, revision: contentHash(body), path: `demo/fluent-button/${path}` }
}

function platformMapping(platform: string): PlatformMapping {
  const found = mappings.platforms.find((candidate) => candidate.platform === platform)
  if (!found) throw new Error(`mappings.json has no ${platform} platform.`)
  return found
}

function backgroundEvidence(mapping: PlatformMapping, arms: StyleArm[], source: SourceRef, what: string): Evidence {
  const described = arms.map((arm) => `${arm.cases.join(', ')} ${arm.tokens.length > 0 ? `reads ${arm.tokens.join(', ')}` : 'reads no background token'}`)
  return {
    id: `evidence:${mapping.id.slice('platform:'.length)}.background-tokens`,
    kind: 'evidence',
    title: `${mapping.title} background tokens by style`,
    subjectIds: [mapping.id],
    tier: 'static-analysis',
    method: 'token-analysis',
    platform: mapping.platform,
    outcome: 'finding',
    finding: `${what}: ${described.join('; ')}.`,
    capturedAt,
    source,
  }
}

// --- The contract, declared by people -------------------------------------------------

const contractFile = json<{ records: GraphRecord[]; links: Link[] }>('contract/button.json')
const contractSource = localSource('contract/button.json', 'contract')
const contract = fragment(
  contractFile.records.map((record) => ({ ...record, source: contractSource })),
  contractFile.links,
)
const semantic = contractFile.records.find((record): record is SemanticComponent => record.id === mappings.semanticId && record.kind === 'semantic-component')
if (!semantic) throw new Error(`contract/button.json does not define ${mappings.semanticId}.`)

// --- Web: Fluent React v9 -------------------------------------------------------------

const webMapping = platformMapping('web')
const dts = vendored('react-button', 'index.d.ts', 'react-types')
const useButton = vendored('react-button', 'useButton.js', 'react-types')
const styles = vendored('react-button', 'useButtonStyles.styles.raw.js', 'style-tokens')
const web = readPlatformComponent(
  semantic.id,
  webMapping,
  {
    variants: tsPropUnion(dts.text, 'ButtonProps', 'appearance').map((name) => ({ name, deprecated: false })),
    defaultVariant: jsDestructuredDefault(useButton.text, 'appearance'),
    members: [...tsTypeKeys(dts.text, 'ButtonProps'), ...tsTypeKeys(dts.text, 'ButtonSlots')],
    source: dts.source,
    capturedAt,
  },
  { package: '@fluentui/react-button', version: '9.11.1' },
)

const tokensDocument = json<{ $extensions: { 'civic.source': { revision: string } } }>('tokens/fluent-web-light.tokens.json')
const tokens = readDtcgTokens(tokensDocument, {
  tool: 'npm',
  importer: 'dtcg',
  revision: tokensDocument.$extensions['civic.source'].revision,
  path: 'demo/fluent-button/tokens/fluent-web-light.tokens.json',
  contentHash: contentHash(text('tokens/fluent-web-light.tokens.json')),
})
const referenced = jsTokenReferences(styles.text)
const unknownTokens = referenced.filter((name) => !tokens.has(name))
if (unknownTokens.length > 0) throw new Error(`The web Button styles read tokens the DTCG file lacks: ${unknownTokens.join(', ')}.`)
const webTokens = fragment(
  referenced.map((name) => tokens.get(name)!),
  referenced.map((name): Link => ({ from: webMapping.id, relation: 'uses-token', to: `token:${name}`, status: 'declared', source: styles.source })),
)
const webRuns = fragment(readPlaywrightReport(json('evidence/playwright-report.json'), 'web'))

// --- iOS: fluentui-apple --------------------------------------------------------------

const iosMapping = platformMapping('ios')
const tokenSet = vendored('fluentui-apple', 'ButtonTokenSet.swift', 'swift-source')
const button = vendored('fluentui-apple', 'Button.swift', 'swift-source')
const ios = readPlatformComponent(
  semantic.id,
  iosMapping,
  {
    variants: swiftEnumCases(tokenSet.text, 'ButtonStyle'),
    defaultVariant: swiftPropertyDefault(button.text, 'style'),
    members: swiftPublicMembers(button.text),
    source: tokenSet.source,
    capturedAt,
  },
  { package: 'microsoft/fluentui-apple', version: sources.inputs['fluentui-apple']!.revision.slice(0, 12) },
)
const iosTokens = fragment([backgroundEvidence(iosMapping, swiftStyleArms(tokenSet.text, 'backgroundColor'), { ...tokenSet.source, importer: 'swift-token-set' }, 'ButtonTokenSet backgroundColor by ButtonStyle')])

// --- Android: fluentui-android Compose ------------------------------------------------

const androidMapping = platformMapping('android')
const buttonTokens = vendored('fluentui-android', 'ButtonTokens.kt', 'kotlin-source')
const composeButton = vendored('fluentui-android', 'Button.kt', 'kotlin-source')
const parameters = kotlinFunctionParameters(composeButton.text, 'Button')
const styleDefault = parameters.find((parameter) => parameter.name === 'style')?.default
if (!styleDefault) throw new Error('Compose Button has no default style parameter.')
const android = readPlatformComponent(
  semantic.id,
  androidMapping,
  {
    variants: kotlinEnumCases(buttonTokens.text, 'ButtonStyle'),
    defaultVariant: styleDefault.replace(/^ButtonStyle\./, ''),
    members: parameters.map((parameter) => parameter.name),
    source: buttonTokens.source,
    capturedAt,
  },
  { package: 'microsoft/fluentui-android', version: sources.inputs['fluentui-android']!.revision.slice(0, 12) },
)
const androidTokens = fragment([
  backgroundEvidence(androidMapping, kotlinStyleArms(buttonTokens.text, 'backgroundBrush', 'ButtonStyle'), { ...buttonTokens.source, importer: 'kotlin-control-tokens' }, 'ButtonTokens backgroundBrush by ButtonStyle'),
])

// --- Design: the Android and iOS Figma kits, and the comparison -----------------------

// Each kit is its own Figma file, trimmed to design/<kit id>.figma.json by design/trim.ts.
const kits = mappings.designKits.map((kit) => {
  const kitFile = json<{ lastModified: string }>(`design/${kit.id}.figma.json`)
  return readFigmaComponentSet(kitFile, kit, semantic.id, kitFile.lastModified)
})
const components = { web, ios, android }
const conflicts = kits.flatMap((design) => {
  const part = components[design.kit.platform as keyof typeof components]
  const component = part?.records.find((record) => record.kind === 'platform-component')
  if (!component || component.kind !== 'platform-component') throw new Error(`No ${design.kit.platform} component to compare ${design.kit.title} with.`)
  return compareDesignKit(semantic, design, component, `evidence:${component.id.slice('platform:'.length)}.variants`)
})
const design = fragment([...kits.map((kit) => kit.evidence), ...conflicts])

// --- Assemble, decide, export ---------------------------------------------------------

const raised = assemble(contract, web, webTokens, webRuns, ios, iosTokens, android, androidTokens, design)
const resolved = applyDecisions(raised, json<DecisionFile>('contract/decisions.json'))
assertValid(raised)
assertValid(resolved)

const exportFor = (document: typeof raised) => {
  const graph = indexGraph(document)
  return {
    context: `${renderWorkOrder(contextFor(graph, semantic.id, { platform: 'android', variant: 'brand-outline' }))}\n`,
    gaps: `${renderGaps(gapsIn(graph, { scope: semantic.id }))}\n`,
  }
}
const raisedExport = exportFor(raised)
const resolvedExport = exportFor(resolved)
const outputs: Record<string, string> = {
  'out/raised.graph.json': `${JSON.stringify(raised, null, 2)}\n`,
  'out/resolved.graph.json': `${JSON.stringify(resolved, null, 2)}\n`,
  'out/raised.context.android.brand-outline.md': raisedExport.context,
  'out/raised.gaps.md': raisedExport.gaps,
  'out/resolved.context.android.brand-outline.md': resolvedExport.context,
  'out/resolved.gaps.md': resolvedExport.gaps,
}

if (process.argv.includes('--check')) {
  const stale = Object.entries(outputs).filter(([path, body]) => {
    try {
      return text(path) !== body
    } catch {
      return true
    }
  })
  if (stale.length > 0) {
    console.error(`Out of date: ${stale.map(([path]) => path).join(', ')}. Run node demo/fluent-button/build.ts and commit the result.`)
    process.exitCode = 1
  } else {
    console.log(`demo/fluent-button/out is current: ${raised.records.length} records, ${raised.links.length} links, ${conflicts.length} conflict(s) raised.`)
  }
} else {
  for (const [path, body] of Object.entries(outputs)) writeFileSync(here(path), body)
  console.log(`Wrote demo/fluent-button/out: ${raised.records.length} records, ${raised.links.length} links, ${conflicts.length} conflict(s) raised.`)
}
