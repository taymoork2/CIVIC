import type { ContractConflict, Owner, PlatformComponent, SemanticComponent } from '../../graph/src/index.ts'
import type { DesignKitFacts } from './figma.ts'

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
      status: 'open',
    })
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
