import type { BenefitDecision } from './product-benefits.ts'
import type { PersonalOutcomeSummary } from './personal-outcomes.ts'

export type PersonalSuggestionDirection = 'withhold' | 'reported_improvement' | 'prefer_simple' | 'disabled' | 'evidence_only'
export interface PersonalSuggestionGuidance {
  readonly direction: PersonalSuggestionDirection
  readonly explanation: string
}

/** Rank eligible optional choices without changing evidence, permissions, quantities or selection. */
export function personalSuggestionGuidance(benefit: BenefitDecision, summaries: readonly PersonalOutcomeSummary[]): PersonalSuggestionGuidance {
  if (benefit.compatibility !== 'allowed' || summaries.length === 0) return { direction: 'evidence_only', explanation: 'Recorded compatibility must be established before personal results can influence this choice.' }
  const enabled = summaries.filter((summary) => summary.status !== 'disabled')
  if (enabled.length === 0) return { direction: 'disabled', explanation: 'Personal result influence is disabled. Recorded product evidence still applies.' }
  if (enabled.some((summary) => summary.suppressOptionalSuggestion)) return { direction: 'withhold', explanation: 'Withhold this optional suggestion while the relevant negative reports or incomplete check are reassessed. This does not diagnose a cause.' }
  if (benefit.status === 'unnecessary') return { direction: 'prefer_simple', explanation: 'The recorded goal does not call for an extra product. Personal reports do not establish a need for one.' }
  if (benefit.status === 'preference_only') return { direction: 'evidence_only', explanation: 'This is a preference choice. Personal reports do not turn it into a cleaning-effectiveness claim.' }
  if (enabled.length === summaries.length && enabled.every((summary) => summary.status === 'repeated_pattern'
    && summary.counts.independentWashes >= 3 && summary.counts.improved === summary.counts.independentWashes)) {
    return { direction: 'reported_improvement', explanation: 'You reported repeated improvement with comparable use. This does not establish additional benefit over detergent alone; no addition remains an option.' }
  }
  return { direction: 'prefer_simple', explanation: 'Additional benefit has not been established for all these clothes. Favor the simpler routine; sparse or mixed self-reports do not mean a product is ineffective.' }
}

/** This orders optional choices only. It never selects one or outranks the no-addition option. */
export function personalSuggestionRank(benefit: BenefitDecision, guidance: PersonalSuggestionGuidance): number {
  if (benefit.compatibility === 'excluded') return 4
  return guidance.direction === 'reported_improvement' ? 0 : guidance.direction === 'prefer_simple' ? 1
    : guidance.direction === 'withhold' ? 3 : 2
}
