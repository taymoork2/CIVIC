/** Benefit evidence never supplies compatibility, placement, amounts or permissions. */
export const productCapabilities = ['oxygen_bleaching', 'optical_brightening', 'hardness_management', 'protease', 'lipase', 'amylase', 'soil_dispersal', 'fragrance'] as const
export type ProductCapability = typeof productCapabilities[number]
export const washGoals = ['ordinary', 'dull_grey', 'visible_stain', 'suspected_color_transfer', 'faded_dye', 'odor', 'feel', 'fragrance'] as const
export type WashGoal = typeof washGoals[number]
export const benefitPolicyVersion = '1'
export interface CapabilityEvidence {
  readonly kind: ProductCapability
  readonly status: 'present' | 'absent' | 'unknown'
  readonly variant: string
  readonly market: string
  readonly formulationRevision: string
  readonly source: string
  readonly retrievedAt: number
  readonly scope: 'ingredient_disclosure' | 'manufacturer_claim' | 'explicit_absence'
}
export interface BenefitProduct { readonly id: string; readonly capabilities?: readonly CapabilityEvidence[] }
export interface BenefitDecision {
  readonly supplyId: string
  readonly status: 'suggested' | 'unnecessary' | 'preference_only' | 'unknown' | 'excluded'
  readonly compatibility: 'allowed' | 'unknown' | 'excluded'
  readonly reason: string
  readonly evidence: readonly string[]
  readonly policyVersion: string
}
const relevant: Partial<Record<WashGoal, readonly ProductCapability[]>> = {
  dull_grey: ['oxygen_bleaching', 'optical_brightening', 'soil_dispersal'],
  visible_stain: ['oxygen_bleaching', 'protease', 'lipase', 'amylase'],
  suspected_color_transfer: ['oxygen_bleaching'],
  fragrance: ['fragrance'],
}
export function productBenefit(product: BenefitProduct, context: {
  readonly goals: readonly WashGoal[]
  readonly detergent?: BenefitProduct
  readonly compatibility: BenefitDecision['compatibility']
}): BenefitDecision {
  const facts = (product.capabilities ?? []).filter((fact) => fact.status === 'present' && fact.variant.trim() && fact.market.trim() && fact.formulationRevision.trim() && fact.source.trim() && Number.isFinite(fact.retrievedAt) && fact.retrievedAt > 0 && fact.scope !== 'explicit_absence')
  const references = [...new Set(facts.map((fact) => fact.source))].sort()
  const answer = (status: BenefitDecision['status'], reason: string): BenefitDecision => ({ supplyId: product.id, status, compatibility: context.compatibility, reason, evidence: references, policyVersion: benefitPolicyVersion })
  if (context.compatibility === 'excluded') return answer('excluded', 'Recorded garment or product constraints exclude this addition.')
  const goals = context.goals.filter((goal) => goal !== 'ordinary')
  if (goals.length === 0) return answer('unnecessary', 'No extra product is needed for the recorded ordinary-wash goal.')
  if (goals.every((goal) => goal === 'faded_dye')) return answer('unnecessary', 'These capabilities do not establish restoration of lost dye.')
  const matched = facts.filter((fact) => goals.some((goal) => relevant[goal]?.includes(fact.kind)))
  if (matched.length === 0) return answer('unknown', 'The recorded evidence does not establish a benefit for this goal. Unknown does not mean ineffective.')
  if (context.compatibility === 'unknown') return answer('unknown', 'A possible benefit is recorded, but compatibility still needs review before use.')
  if (matched.every((fact) => fact.kind === 'fragrance')) return answer('preference_only', 'Scent is an optional preference; it is not evidence of better cleaning.')
  const detergentFacts = context.detergent?.capabilities ?? []
  const overlap = matched.some((fact) => detergentFacts.some((other) => other.kind === fact.kind && other.status === 'present' && other.variant.trim() && other.market.trim() && other.formulationRevision.trim() && other.source.trim() && Number.isFinite(other.retrievedAt) && other.retrievedAt > 0 && other.scope !== 'explicit_absence'))
  if (overlap) return answer('unknown', 'The detergent has an overlapping recorded capability. Additional benefit has not been compared; overlap alone does not prove redundancy.')
  return answer('suggested', 'Recorded capabilities may address this goal. Incremental benefit over detergent alone is unproven; choosing no addition remains available.')
}
