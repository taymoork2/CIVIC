import assert from 'node:assert/strict'
import { summarizePersonalOutcomes, type PersonalObservation, type PersonalOutcomeContext } from './personal-outcomes.ts'

const context: PersonalOutcomeContext = { problemKey: 'odor-recurring-after-wash', garmentKey: 'cotton-navy-plain', profileKey: 'alex',
  routineKey: 'label-routine', productRevisionKey: 'exact-pack-revision-1', routeKey: 'mainwash-drum-20ml', machineKey: 'washer-normal-30C-45min',
  finishingKey: 'tumble-low-30min', dimension: 'odor', checkedWhen: 'after_drying' }
const observation = (id: string, patch: Partial<PersonalObservation> = {}): PersonalObservation => ({ assessmentId: id, recordId: `record-${id}`, independentWashId: `wash-${id}`,
  revision: 1, completedAt: 100, result: 'improved', context, ...patch })
const options = { enabled: true, resetAt: 0, historyTruncated: false, negativeHistoryTruncated: false }
const rows = [observation('a'), observation('b'), observation('c')]
const summary = summarizePersonalOutcomes(context, rows, options)
assert.equal(summary.status, 'repeated_pattern')
assert.equal(summary.counts.improved, 3)
assert.match(summary.explanation, /do not show.*detergent alone/)
assert.deepEqual(summarizePersonalOutcomes(context, [...rows].reverse(), options), summary)

// A nine-piece matching pack is still only one independent wash, even with several assessment stages.
const pack = Array.from({ length: 9 }, (_, index) => observation(`piece-${index}`, { independentWashId: 'one-pack-wash' }))
const correlated = summarizePersonalOutcomes(context, [...pack, observation('wash-stage', { independentWashId: 'one-pack-wash', context: { ...context, checkedWhen: 'after_wash' } })], options)
assert.equal(correlated.counts.independentWashes, 1)
assert.equal(correlated.status, 'sparse')
assert.equal(correlated.observations.length, 9)

for (const key of ['problemKey', 'garmentKey', 'profileKey', 'routineKey', 'productRevisionKey', 'routeKey', 'machineKey', 'finishingKey', 'dimension', 'checkedWhen'] as const) {
  const different = { ...context, [key]: 'different' } as PersonalOutcomeContext
  assert.equal(summarizePersonalOutcomes(context, [observation('different', { context: different })], options).counts.independentWashes, 0, key)
}
assert.equal(summarizePersonalOutcomes(null, rows, options).status, 'insufficient_context')
assert.equal(summarizePersonalOutcomes({ ...context, productRevisionKey: '' }, rows, options).status, 'insufficient_context')
assert.equal(summarizePersonalOutcomes(context, [observation('missing', { context: null })], options).counts.independentWashes, 0)
assert.equal(summarizePersonalOutcomes(context, rows, { ...options, historyTruncated: true }).status, 'sparse')
const incompleteNegativeCheck = summarizePersonalOutcomes(context, rows, { ...options, negativeHistoryTruncated: true })
assert.equal(incompleteNegativeCheck.status, 'sparse')
assert.equal(incompleteNegativeCheck.suppressOptionalSuggestion, true)
assert.equal(incompleteNegativeCheck.negativeHistoryTruncated, true)
assert.match(incompleteNegativeCheck.explanation, /could not review all.*no cause is inferred/)
assert.equal(summarizePersonalOutcomes(context, rows, { ...options, enabled: false, negativeHistoryTruncated: true }).suppressOptionalSuggestion, false)
assert.equal(summarizePersonalOutcomes(context, rows, { ...options, enabled: false }).observations.length, 0)
assert.equal(summarizePersonalOutcomes(context, rows, { ...options, resetAt: 100 }).counts.independentWashes, 0)

const correction = observation('a', { revision: 2, result: 'unchanged' })
assert.deepEqual(summarizePersonalOutcomes(context, [...rows, correction], options).counts, { independentWashes: 3, improved: 2, unchanged: 1, worse: 0, mixed: 0, unknown: 0 })
assert.deepEqual(summarizePersonalOutcomes(context, [correction, ...rows], options), summarizePersonalOutcomes(context, [...rows, correction], options))
assert.equal(summarizePersonalOutcomes(context, [...rows, observation('a', { revision: 2, result: null })], options).counts.independentWashes, 2)
assert.throws(() => summarizePersonalOutcomes(context, [...rows, observation('a', { result: 'worse' })], options), /Conflicting/)
const unknown = summarizePersonalOutcomes(context, [observation('unknown', { result: 'unknown' })], options)
assert.equal(unknown.counts.unknown, 1)
assert.equal(unknown.counts.worse, 0)
const mixed = summarizePersonalOutcomes(context, [observation('x'), observation('y', { independentWashId: 'wash-x', result: 'unchanged' })], options)
assert.equal(mixed.counts.mixed, 1)
assert.equal(mixed.counts.improved, 0)

const damaged = observation('damaged', { result: 'damage', context: { ...context, dimension: 'damage', checkedWhen: 'after_wearing', finishingKey: 'later-wear-check' } })
const reassess = summarizePersonalOutcomes(context, [...rows, damaged], options)
assert.equal(reassess.status, 'reassess')
assert.equal(reassess.suppressOptionalSuggestion, true)
assert.equal(reassess.counts.independentWashes, 3, 'a later damage check is not another comparable efficacy trial')
assert.equal(summarizePersonalOutcomes(context, [...rows, { ...damaged, context: { ...damaged.context!, productRevisionKey: 'different-pack' } }], options).suppressOptionalSuggestion, false)
assert.equal(summarizePersonalOutcomes(context, [...rows, damaged, { ...damaged, revision: 2, result: null }], options).suppressOptionalSuggestion, false)
console.log('personal outcome comparability, corrections and correlated-session checks passed')
