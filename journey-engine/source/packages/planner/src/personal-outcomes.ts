/** Comparable self-reports refine optional advice; they never establish permissions or causation. */
export const personalOutcomePolicyVersion = 'personal-outcomes-2'
export type OutcomeDimension = 'overall' | 'stain' | 'appearance' | 'odor' | 'feel' | 'damage'
export type OutcomeStage = 'after_wash' | 'after_drying' | 'after_wearing'
export type PersonalResult = 'unknown' | 'improved' | 'unchanged' | 'worse' | 'irritation' | 'damage' | null

/** Keys bind recorded facts, not names or an inferred chemical formulation. Null means incomplete. */
export interface PersonalOutcomeContext {
  readonly problemKey: string
  readonly garmentKey: string
  readonly profileKey: string
  readonly routineKey: string
  readonly productRevisionKey: string
  readonly routeKey: string
  readonly machineKey: string
  readonly finishingKey: string
  readonly dimension: OutcomeDimension
  readonly checkedWhen: OutcomeStage
}
export interface PersonalObservation {
  readonly assessmentId: string
  readonly revision: number
  readonly recordId: string
  readonly independentWashId: string
  readonly completedAt: number
  readonly result: PersonalResult
  readonly context: PersonalOutcomeContext | null
}
export interface PersonalOutcomeSummary {
  readonly policyVersion: typeof personalOutcomePolicyVersion
  readonly status: 'disabled' | 'insufficient_context' | 'sparse' | 'repeated_pattern' | 'reassess'
  readonly counts: { readonly independentWashes: number; readonly improved: number; readonly unchanged: number; readonly worse: number; readonly mixed: number; readonly unknown: number }
  readonly suppressOptionalSuggestion: boolean
  readonly historyTruncated: boolean
  readonly negativeHistoryTruncated: boolean
  readonly explanation: string
  readonly observations: readonly { readonly assessmentId: string; readonly revision: number; readonly recordId: string; readonly independentWashId: string; readonly result: PersonalResult }[]
}

export function personalContextKey(context: PersonalOutcomeContext): string {
  return JSON.stringify([personalOutcomePolicyVersion, context.problemKey, context.garmentKey, context.profileKey,
    context.routineKey, context.productRevisionKey, context.routeKey, context.machineKey, context.finishingKey,
    context.dimension, context.checkedWhen])
}
const complete = (context: PersonalOutcomeContext | null): context is PersonalOutcomeContext => context !== null
  && [context.problemKey, context.garmentKey, context.profileKey, context.routineKey, context.productRevisionKey, context.routeKey, context.machineKey, context.finishingKey].every((key) => key.trim().length > 0)

/** Damage/irritation need reassessment even if reported at another stage or dimension. */
function sameUse(left: PersonalOutcomeContext, right: PersonalOutcomeContext): boolean {
  return left.problemKey === right.problemKey && left.garmentKey === right.garmentKey && left.profileKey === right.profileKey
    && left.routineKey === right.routineKey && left.productRevisionKey === right.productRevisionKey
    && left.routeKey === right.routeKey && left.machineKey === right.machineKey
}

export function summarizePersonalOutcomes(target: PersonalOutcomeContext | null, observations: readonly PersonalObservation[], options: {
  readonly enabled: boolean
  readonly resetAt: number
  readonly historyTruncated: boolean
  readonly negativeHistoryTruncated: boolean
}): PersonalOutcomeSummary {
  const counts = { independentWashes: 0, improved: 0, unchanged: 0, worse: 0, mixed: 0, unknown: 0 }
  const result = (status: PersonalOutcomeSummary['status'], explanation: string, used: readonly PersonalObservation[] = [], suppress = false): PersonalOutcomeSummary => ({
    policyVersion: personalOutcomePolicyVersion, status, counts, suppressOptionalSuggestion: suppress,
    historyTruncated: options.historyTruncated, negativeHistoryTruncated: options.negativeHistoryTruncated, explanation,
    observations: used.map(({ assessmentId, revision, recordId, independentWashId, result }) => ({ assessmentId, revision, recordId, independentWashId, result })),
  })
  if (!options.enabled) return result('disabled', 'Personal result influence is disabled. Recorded instructions and evidence still apply.')
  if (!complete(target)) return result('insufficient_context', 'The recorded context is incomplete; use the product evidence without a personal effectiveness claim.')
  const current = new Map<string, PersonalObservation>()
  for (const row of observations) {
    if (!Number.isFinite(row.completedAt) || row.completedAt <= options.resetAt || !Number.isSafeInteger(row.revision) || row.revision < 1) continue
    const prior = current.get(row.assessmentId)
    if (prior === undefined || row.revision > prior.revision) current.set(row.assessmentId, row)
    else if (row.revision === prior.revision && JSON.stringify([row.recordId, row.independentWashId, row.completedAt, row.result, row.context === null ? null : personalContextKey(row.context)])
      !== JSON.stringify([prior.recordId, prior.independentWashId, prior.completedAt, prior.result, prior.context === null ? null : personalContextKey(prior.context)])) {
      // Conflicting copies of the same revision cannot supply a repeatable observation.
      throw new Error('Conflicting personal observation revision')
    }
  }
  const used = [...current.values()].filter((row) => complete(row.context) && row.result !== null
    && (personalContextKey(row.context) === personalContextKey(target)
      || (row.result === 'damage' || row.result === 'irritation') && sameUse(row.context, target)))
    .sort((a, b) => a.independentWashId.localeCompare(b.independentWashId) || a.assessmentId.localeCompare(b.assessmentId))
  const sessions = new Map<string, Set<PersonalResult>>()
  for (const row of used) {
    if (personalContextKey(row.context!) !== personalContextKey(target)) continue
    const session = sessions.get(row.independentWashId) ?? new Set<PersonalResult>()
    session.add(row.result)
    sessions.set(row.independentWashId, session)
  }
  for (const values of sessions.values()) {
    const known = [...values].filter((value) => value !== 'unknown')
    if (known.length === 0) { counts.unknown++; continue }
    counts.independentWashes++
    if (known.includes('worse') || known.includes('damage') || known.includes('irritation')) counts.worse++
    else if (known.length > 1) counts.mixed++
    else if (known[0] === 'improved') counts.improved++
    else counts.unchanged++
  }
  const negative = used.some((row) => row.result === 'damage' || row.result === 'irritation')
  if (negative) return result('reassess', 'You reported damage or irritation with comparable recorded use. Avoid repeating this optional suggestion until you reassess it; this does not diagnose a cause or prescribe a replacement.', used, true)
  if (options.negativeHistoryTruncated) return result('sparse', 'The bounded check could not review all current damage or irritation reports. Withhold this optional suggestion until those reports can be reviewed; no cause is inferred.', used, true)
  if (options.historyTruncated) return result('sparse', 'Only a bounded recent history window was checked. Do not promote an optional suggestion from this incomplete summary.', used)
  if (counts.independentWashes < 3) return result('sparse', 'Fewer than three comparable assessed washes are recorded. Use the product evidence without a repeated-pattern claim.', used)
  return result('repeated_pattern', `You reported improvement after ${counts.improved} of ${counts.independentWashes} comparable washes. These self-reports do not show that an additive outperforms detergent alone.`, used)
}
