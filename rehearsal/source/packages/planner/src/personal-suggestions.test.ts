import assert from 'node:assert/strict'
import { personalSuggestionGuidance, personalSuggestionRank } from './personal-suggestions.ts'
import { summarizePersonalOutcomes, type PersonalOutcomeContext } from './personal-outcomes.ts'
import type { BenefitDecision } from './product-benefits.ts'

const context: PersonalOutcomeContext = { problemKey: 'odor', garmentKey: 'plain-cotton', profileKey: 'owner', routineKey: 'recorded',
  productRevisionKey: 'exact-revision', routeKey: '20ml-before-wash', machineKey: 'verified-40min', finishingKey: 'wash-only', dimension: 'odor', checkedWhen: 'after_wash' }
const benefit: BenefitDecision = { supplyId: 'addition', status: 'unknown', compatibility: 'allowed', reason: 'Incremental benefit is unproven', evidence: [], policyVersion: '1' }
const observations = Array.from({ length: 3 }, (_, index) => ({ assessmentId: `a-${index}`, recordId: `r-${index}`, independentWashId: `w-${index}`,
  completedAt: 100, revision: 1, result: 'improved' as const, context }))
const options = { enabled: true, resetAt: 0, historyTruncated: false, negativeHistoryTruncated: false }
const summary = summarizePersonalOutcomes(context, observations, options)
const before = structuredClone(benefit)
const improvement = personalSuggestionGuidance(benefit, [summary])
assert.equal(improvement.direction, 'reported_improvement')
assert.match(improvement.explanation, /does not establish additional benefit.*no addition/)
assert.deepEqual(benefit, before)
assert.equal(personalSuggestionGuidance({ ...benefit, compatibility: 'unknown' }, [summary]).direction, 'evidence_only')
assert.equal(personalSuggestionGuidance({ ...benefit, compatibility: 'excluded' }, [summary]).direction, 'evidence_only')
assert.equal(personalSuggestionGuidance({ ...benefit, status: 'unnecessary' }, [summary]).direction, 'prefer_simple')
assert.equal(personalSuggestionGuidance({ ...benefit, status: 'preference_only' }, [summary]).direction, 'evidence_only')
const sparse = summarizePersonalOutcomes(context, observations.slice(0, 1), options)
assert.equal(personalSuggestionGuidance(benefit, [summary, sparse]).direction, 'prefer_simple')
assert.equal(personalSuggestionGuidance(benefit, [summarizePersonalOutcomes(context, observations, { ...options, enabled: false })]).direction, 'disabled')
const negative = summarizePersonalOutcomes(context, [...observations, { ...observations[0]!, revision: 2, result: 'damage' as const }], options)
assert.equal(personalSuggestionGuidance(benefit, [summary, negative]).direction, 'withhold')
const incomplete = summarizePersonalOutcomes(context, observations, { ...options, negativeHistoryTruncated: true })
assert.equal(personalSuggestionGuidance(benefit, [incomplete]).direction, 'withhold')
assert.ok(personalSuggestionRank(benefit, improvement) < personalSuggestionRank(benefit, personalSuggestionGuidance(benefit, [sparse])))
assert.ok(personalSuggestionRank({ ...benefit, compatibility: 'excluded' }, improvement) > personalSuggestionRank(benefit, personalSuggestionGuidance(benefit, [negative])))
console.log('personal optional-choice ranking, simpler fallback and evidence boundaries passed')
