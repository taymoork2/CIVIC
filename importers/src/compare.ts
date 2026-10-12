import { propertyCovers, type ContractConflict, type ExtensionPoint, type Override, type Owner, type PlatformComponent, type SemanticComponent } from '../../graph/src/index.ts'
import type { LibraryFacts } from './figma-product.ts'
import type { DesignKitFacts } from './figma.ts'
import { slug } from './fragment.ts'

/**
 * Compares a platform's design kit with that platform's component, variant by variant
 * (decision 0001). Each disagreement becomes an open, unclassified Contract Conflict that
 * names both sides, their evidence and their owners. Classifying and deciding it is the
 * owners' job; this only raises it.
 */
export function compareDesignKit(semantic: SemanticComponent, design: DesignKitFacts, component: PlatformComponent, componentEvidenceId: string): ContractConflict[] {
  if (design.kit.platform !== component.platform) throw new Error(`${design.kit.title} is for ${design.kit.platform}, ${component.id} for ${component.platform}.`)
  const platform = component.platform
  const owners = dedupe([...(design.kit.owners ?? []), ...(component.owners ?? [])])
  const drawn = new Set(design.semanticVariants)
  const conflicts: ContractConflict[] = []
  for (const variant of semantic.variants) {
    const mapping = component.variants.find((candidate) => candidate.semanticVariant === variant.key)
    const expressed = mapping !== undefined && mapping.mapping !== 'none'
    if (drawn.has(variant.key) === expressed) continue
    const kitSide = drawn.has(variant.key) ? `${variant.title} exists in the ${design.kit.title}.` : `The ${design.kit.title} does not draw ${variant.title}.`
    const codeSide = expressed
      ? `${component.title} expresses ${variant.title} as ${mapping!.expression}.`
      : `${component.title} has no ${variant.title}${mapping?.note ? `: ${mapping.note.replace(/\.$/, '')}` : ''}.`
    conflicts.push({
      id: `conflict:${semantic.id.slice('semantic:'.length)}.${platform}.${variant.key}`,
      kind: 'contract-conflict',
      title: `${variant.title} ${semantic.title} on ${platform}`,
      targetId: semantic.id,
      variant: variant.key,
      platform,
      summary: drawn.has(variant.key)
        ? `The ${design.kit.title} has a ${variant.title} ${semantic.title} that ${component.title} cannot express.`
        : `${component.title} offers ${variant.title}, which the ${design.kit.title} does not draw.`,
      sides: [
        { claim: kitSide, evidenceIds: [design.evidence.id] },
        { claim: codeSide, recordId: component.id, evidenceIds: [componentEvidenceId] },
      ],
      classification: 'unclassified',
      owners,
      alignment: 'unreviewed-drift',
    })
  }
  return conflicts
}

/**
 * Compares what the design system library's component shows by default with what each
 * platform's component can express. A product that uses the library as drawn gets that
 * content without changing anything, so no override flags it; when a platform has no
 * extension point that expresses it, every product shipping there inherits a gap. Each
 * part the library shows by default and a platform can't build becomes one open,
 * unclassified Contract Conflict for that platform. Only content properties that are on by
 * default (`add-content` with a default of true) count.
 */
export function compareLibraryDefaults(
  semantic: SemanticComponent,
  library: LibraryFacts,
  platforms: { component: PlatformComponent; extensionPoints: ExtensionPoint[]; evidenceId: string }[],
): ContractConflict[] {
  const { mapping } = library
  const shown = new Map<string, string>()
  const declarations = [
    ...Object.entries(mapping.properties).map(([name, declared]) => [name, declared] as const),
    ...Object.entries(mapping.parts ?? {}).flatMap(([part, properties]) => Object.entries(properties).map(([name, declared]) => [`${part} / ${name}`, declared] as const)),
  ]
  for (const [label, declared] of declarations) {
    if ('content' in declared || declared.change !== 'add-content' || library.defaults[label] !== true) continue
    if (!shown.has(declared.property)) shown.set(declared.property, label)
  }

  const conflicts: ContractConflict[] = []
  for (const { component, extensionPoints, evidenceId } of platforms) {
    const points = extensionPoints.filter((point) => point.platformComponentId === component.id)
    for (const [property, label] of shown) {
      if (points.some((point) => point.expresses.some((pattern) => propertyCovers(pattern, property)))) continue
      conflicts.push({
        id: `conflict:${semantic.id.slice('semantic:'.length)}.${component.platform}.default.${slug(property)}`,
        kind: 'contract-conflict',
        title: `Default ${property} in the ${semantic.title} on ${component.platform}`,
        targetId: semantic.id,
        platform: component.platform,
        summary: `The library's ${mapping.componentSet} shows ${property} by default (${label}), and ${component.title} has no extension point that expresses it.`,
        sides: [
          { claim: `${mapping.componentSet} turns ${label} on by default, so every product using it as drawn shows ${property}.`, evidenceIds: [library.evidence.id] },
          { claim: `No ${component.title} extension point expresses ${property}.`, recordId: component.id, evidenceIds: [evidenceId] },
        ],
        classification: 'unclassified',
        owners: dedupe([...(mapping.owners ?? []), ...(component.owners ?? [])]),
        alignment: 'unreviewed-drift',
      })
    }
  }
  return conflicts
}

function dedupe(owners: Owner[]): Owner[] {
  const seen = new Set<string>()
  return owners.filter((owner) => {
    const key = `${owner.role}|${owner.who}|${owner.platform ?? ''}`
    return !seen.has(key) && seen.add(key) !== undefined
  })
}

/**
 * Raises each override on a product's instances as Unreviewed drift against the component
 * contract (component change flow, step 2). The designer is never blocked: the design is
 * imported as it is, and the conflict stays open until the contract's owners decide. Each
 * conflict asks the person who made the change and the contract's design owners. Whether
 * each platform can build it is a forecast computed from the graph, never stored here.
 */
export function raiseOverrideDrift(semantic: SemanticComponent, overrides: Override[], evidence: { design: string; contract: string }): ContractConflict[] {
  return overrides.map((override) => ({
    id: `conflict:${override.id.slice('override:'.length)}`,
    kind: 'contract-conflict',
    title: `${override.title} (${semantic.title} override)`,
    targetId: semantic.id,
    summary: `The product design changes the ${semantic.title}'s ${override.property} (${override.change}${override.value !== undefined ? `, ${override.value}` : ''}) and no maintainer has reviewed it.`,
    sides: [
      { claim: `${override.title} on ${override.instanceId}.`, recordId: override.id, evidenceIds: [evidence.design] },
      { claim: `The ${semantic.title} contract and library do not include this change.`, recordId: semantic.id, evidenceIds: [evidence.contract] },
    ],
    classification: 'unclassified',
    owners: dedupe([...(override.madeBy ? [override.madeBy] : []), ...(semantic.owners ?? []).filter((owner) => owner.role === 'design')]),
    alignment: 'unreviewed-drift',
  }))
}
