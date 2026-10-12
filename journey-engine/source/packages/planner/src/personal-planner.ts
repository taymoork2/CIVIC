import type { LoadPlan } from './index.ts'
import type { BenefitDecision } from './product-benefits.ts'
import { personalOutcomePolicyVersion, type PersonalOutcomeSummary } from './personal-outcomes.ts'
import { personalSuggestionGuidance, personalSuggestionRank, type PersonalSuggestionGuidance } from './personal-suggestions.ts'

export const personalPlannerPolicyVersion = 'personal-planner-1' as const
export interface PersonalPlannerSummary extends PersonalOutcomeSummary {
  readonly textileId: string
  readonly inputHash: string
  readonly contextKey: string | null
  readonly influencingObservationCount: number
  readonly influencingObservationsTruncated: boolean
}
export interface PersonalPlannerInput {
  readonly policyVersion: typeof personalPlannerPolicyVersion
  readonly evidenceInputHash: string
  readonly comparisonInputHash: string
  readonly loadId: string
  readonly textileIds: readonly string[]
  readonly machineId: string | null
  readonly cycle: string
  readonly temperatureC: number | null
  readonly choices: readonly {
    readonly supplyId: string
    readonly eligible: boolean
    readonly benefit: BenefitDecision
    readonly proposalHash: string
    readonly summaries: readonly PersonalPlannerSummary[]
  }[]
}
export interface PersonalPlannerGuidance {
  readonly policyVersion: typeof personalPlannerPolicyVersion
  readonly noAdditionAvailable: true
  readonly choices: readonly {
    readonly supplyId: string
    readonly selected: boolean
    readonly suppressed: boolean
    readonly guidance: PersonalSuggestionGuidance
  }[]
}

/** Canonical bounded derived inputs; callers supply already-authorized, indexed summaries. */
export function canonicalPersonalPlannerInput(input: PersonalPlannerInput): PersonalPlannerInput {
  if (input.policyVersion !== personalPlannerPolicyVersion || !input.evidenceInputHash || !input.comparisonInputHash
    || input.textileIds.length === 0 || input.textileIds.length > 16 || new Set(input.textileIds).size !== input.textileIds.length
    || input.choices.length === 0 || input.choices.length > 4 || new Set(input.choices.map((choice) => choice.supplyId)).size !== input.choices.length) {
    throw new Error('Invalid personal planner comparison')
  }
  const textileIds = [...input.textileIds].sort()
  const choices = input.choices.map((choice) => {
    if (choice.benefit.supplyId !== choice.supplyId || choice.summaries.length !== textileIds.length
      || new Set(choice.summaries.map((summary) => summary.textileId)).size !== textileIds.length
      || choice.summaries.some((summary) => summary.policyVersion !== personalOutcomePolicyVersion
        || !textileIds.includes(summary.textileId) || summary.observations.length > 128)) {
      throw new Error('Personal summaries must cover exactly the selected clothing entries')
    }
    return { ...choice, summaries: choice.summaries.map((summary) => ({ ...summary,
      observations: [...summary.observations].sort((a, b) => a.independentWashId.localeCompare(b.independentWashId) || a.assessmentId.localeCompare(b.assessmentId)),
    })).sort((a, b) => a.textileId.localeCompare(b.textileId)) }
  }).sort((a, b) => a.supplyId.localeCompare(b.supplyId))
  return { ...input, textileIds, choices }
}

/** Changes the optional suggestion surface only; explicit choices and execution facts are preserved. */
export function applyPersonalPlannerInput(loads: readonly LoadPlan[], input: PersonalPlannerInput, evidenceInputHash: string): readonly LoadPlan[] {
  if (input.evidenceInputHash !== evidenceInputHash) throw new Error('Personal comparison belongs to different planner inputs')
  const target = loads.find((load) => load.id === input.loadId)
  if (target === undefined || JSON.stringify([...target.textileIds].sort()) !== JSON.stringify(input.textileIds)
    || target.machineId !== input.machineId || target.cycle !== input.cycle || target.temperatureC !== input.temperatureC
    || input.choices.some((choice) => !target.productRecommendations?.some((decision) => decision.supplyId === choice.supplyId))) {
    throw new Error('Personal comparison belongs to a different load or optional choice')
  }
  const choices = input.choices.map((choice) => {
    const recorded = target.productRecommendations!.find((decision) => decision.supplyId === choice.supplyId)!
    // A derived summary can never overturn the evidence planner's prohibition.
    const benefit = recorded.compatibility === 'excluded' ? recorded : !choice.eligible ? { ...recorded, compatibility: 'unknown' as const } : choice.benefit
    const guidance = personalSuggestionGuidance(benefit, choice.summaries)
    return { supplyId: choice.supplyId, selected: target.treatments.some((step) => step.supplyId === choice.supplyId),
      suppressed: guidance.direction === 'withhold', guidance, rank: personalSuggestionRank(benefit, guidance) }
  })
  const bySupply = new Map(choices.map((choice) => [choice.supplyId, choice]))
  const ordered = [...(target.productRecommendations ?? [])].sort((a, b) => (bySupply.get(a.supplyId)?.rank ?? 2) - (bySupply.get(b.supplyId)?.rank ?? 2) || a.supplyId.localeCompare(b.supplyId))
  const withheld = ordered.filter((decision) => bySupply.get(decision.supplyId)?.suppressed)
  return loads.map((load) => load.id !== input.loadId ? load : { ...load,
    productRecommendations: ordered.filter((decision) => !bySupply.get(decision.supplyId)?.suppressed),
    ...(withheld.length === 0 ? {} : { withheldProductRecommendations: withheld }),
    personalSuggestions: { policyVersion: personalPlannerPolicyVersion, noAdditionAvailable: true,
      choices: choices.sort((a, b) => a.rank - b.rank || a.supplyId.localeCompare(b.supplyId)).map(({ rank: _rank, ...choice }) => choice) },
  })
}
