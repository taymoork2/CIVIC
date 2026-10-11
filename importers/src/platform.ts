import type { Evidence, ExtensionPoint, Link, Owner, Platform, PlatformComponent, SourceRef, VariantMapping } from '../../graph/src/index.ts'
import { fragment, type Fragment } from './fragment.ts'
import type { EnumCase } from './source.ts'

/**
 * A platform's declared mapping, as Design Engineering writes it in a mapping manifest:
 * which native variant expresses each semantic variant, and which public API is an
 * extension point. The importer checks every name against the source it read.
 */
export interface PlatformMapping {
  id: string
  title: string
  platform: Platform
  symbol: string
  owners?: Owner[]
  variantProperty: string
  variants: Record<string, { mapping: VariantMapping['mapping']; expression?: string; note?: string }>
  extensionPoints?: { name: string; mechanism: ExtensionPoint['mechanism']; expresses: string[] }[]
}

/** What a source reader found in a platform's code. */
export interface SourceFacts {
  /** Native variants the source declares, such as an enum's cases or a prop's union. */
  variants: EnumCase[]
  /** The native variant used when none is given. */
  defaultVariant: string
  /** Public API names an extension point may refer to. */
  members: string[]
  source: SourceRef
  capturedAt: string
}

/**
 * Builds a platform component from its declared mapping and what its source declares.
 * A mapping that names a variant or extension point the source lacks fails the import:
 * the manifest has drifted from the library and a person must fix it. Native variants
 * the mapping doesn't use become `extraVariants`, so they stay visible.
 */
export function readPlatformComponent(semanticId: string, mapping: PlatformMapping, facts: SourceFacts, library: { package: string; version?: string }): Fragment {
  const native = new Map(facts.variants.map((variant) => [variant.name, variant]))
  const problems: string[] = []
  const variants: VariantMapping[] = Object.entries(mapping.variants).map(([semanticVariant, declared]) => {
    if (declared.expression && !native.has(declared.expression)) problems.push(`${mapping.variantProperty} has no ${declared.expression} (declared for ${semanticVariant})`)
    if (declared.expression && native.get(declared.expression)?.deprecated) problems.push(`${declared.expression} is deprecated (declared for ${semanticVariant})`)
    return { semanticVariant, mapping: declared.mapping, ...(declared.expression ? { expression: declared.expression } : {}), ...(declared.note ? { note: declared.note } : {}) }
  })
  for (const point of mapping.extensionPoints ?? []) {
    if (!facts.members.includes(point.name)) problems.push(`no public ${point.name} for the declared extension point`)
  }
  if (problems.length > 0) throw new Error(`${mapping.id}: the mapping no longer matches ${facts.source.path ?? facts.source.revision}: ${problems.join('; ')}.`)

  const used = new Set(variants.flatMap((variant) => (variant.expression ? [variant.expression] : [])))
  const extraVariants = facts.variants.filter((variant) => !variant.deprecated && !used.has(variant.name)).map((variant) => ({ expression: variant.name }))
  const defaultVariant = variants.find((variant) => variant.expression === facts.defaultVariant)?.semanticVariant
  const path = mapping.id.slice('platform:'.length)

  const component: PlatformComponent = {
    id: mapping.id,
    kind: 'platform-component',
    title: mapping.title,
    platform: mapping.platform,
    library,
    symbol: mapping.symbol,
    ...(mapping.owners ? { owners: mapping.owners } : {}),
    variants,
    ...(defaultVariant ? { defaultVariant } : {}),
    ...(extraVariants.length > 0 ? { extraVariants } : {}),
    source: facts.source,
  }
  const points: ExtensionPoint[] = (mapping.extensionPoints ?? []).map((point) => ({
    id: `extension:${path}.${point.name}`,
    kind: 'extension-point',
    title: `${mapping.title} ${point.name}`,
    platformComponentId: mapping.id,
    mechanism: point.mechanism,
    name: point.name,
    expresses: point.expresses,
    source: facts.source,
  }))
  const deprecated = facts.variants.filter((variant) => variant.deprecated).map((variant) => variant.name)
  const evidence: Evidence = {
    id: `evidence:${path}.variants`,
    kind: 'evidence',
    title: `${mapping.title} variants read from source`,
    subjectIds: [mapping.id],
    tier: 'static-analysis',
    method: 'source-analysis',
    platform: mapping.platform,
    outcome: 'finding',
    finding:
      `${mapping.variantProperty} declares ${facts.variants.filter((variant) => !variant.deprecated).map((variant) => variant.name).join(', ')}` +
      `${deprecated.length > 0 ? ` (deprecated: ${deprecated.join(', ')})` : ''}; the default is ${facts.defaultVariant}.`,
    capturedAt: facts.capturedAt,
    source: facts.source,
  }
  const links: Link[] = [{ from: mapping.id, relation: 'implements', to: semanticId, status: 'declared', evidenceIds: [evidence.id] }]
  return fragment([component, ...points, evidence], links)
}
