import { expect, test, vi } from 'vitest'
import { getFunctionName, type FunctionReference, type FunctionReturnType } from 'convex/server'
import { ConvexError } from 'convex/values'
import { api } from '@/api'
import type { Supply, Textile } from '@/household/inventory-types'
import { ControlStatus, GuidanceObservations, PersonalProductGuidance, guidanceSaveReady, influenceGroups, guidanceScopeIssue, savedGuidanceLabel, savedRecommendationView } from '@/closet/personal-product-guidance'
import { renderToStaticMarkup } from '@/test/markup'

const queryFailure = vi.hoisted(() => ({ active: false, saved: undefined as unknown, controls: undefined as unknown }))
vi.mock('convex/react', async (importOriginal) => ({
  ...await importOriginal<typeof import('convex/react')>(),
  useConvex: () => ({ mutation: vi.fn() }),
  useQueries: (requests: Record<string, { query: FunctionReference<'query'> }>) => Object.fromEntries(Object.entries(requests).map(([key, request]) => [key, queryFailure.active ? new ConvexError({ code: 'conflict', message: 'This load already has a session' }) : getFunctionName(request.query).endsWith('savedForPlan') ? queryFailure.saved : getFunctionName(request.query).endsWith(':controls') ? queryFailure.controls : undefined])),
}))

type Comparison = FunctionReturnType<typeof api.personalSuggestions.forPlan>
const summary: Comparison['candidates'][number]['summaries'][number] = {
  textileId: 'tee' as never, contextKey: null, policyVersion: 'personal-outcomes-2', status: 'sparse',
  counts: { independentWashes: 1, improved: 0, unchanged: 0, worse: 0, mixed: 0, unknown: 1 },
  suppressOptionalSuggestion: false, historyTruncated: false, negativeHistoryTruncated: false,
  explanation: 'Not enough comparable washes. Not sure is an observation, not a failure.',
  observations: [{ assessmentId: 'report' as never, recordId: 'record' as never, independentWashId: 'wash' as never, revision: 2, result: 'unknown' }],
  inputHash: 'summary', recordsConsidered: 1, influencingObservationCount: 1, influencingObservationsTruncated: false,
}
const comparison: Comparison = { inputHash: 'comparison', proposalPolicyVersion: 'personal-proposals-1', recordsConsidered: 1,
  candidates: [{ supplyId: 'addition' as never, eligible: false, proposalHash: 'proposal',
    benefit: { supplyId: 'addition' as never, status: 'unknown', compatibility: 'unknown', reason: 'Compatibility unknown.', evidence: [], policyVersion: '1' },
    guidance: { direction: 'evidence_only', explanation: 'Personal reports do not establish extra benefit.' }, summaries: [summary] }] }
const supplies = [{ supplyId: 'addition', name: 'Optional addition' }] as unknown as Supply[]
const textiles = [{ textileId: 'tee', name: 'Matching tees' }] as unknown as Textile[]
const markup = (value = comparison, selected: string[] = []) => renderToStaticMarkup(<GuidanceObservations comparison={value} supplies={supplies} textiles={textiles} selected={selected} />)

test('unknown reports show independent counts, correction revision, uncertainty and no implicit choice', () => {
  const output = markup()
  for (const text of ['1 independent wash', '1 not sure', 'Independent wash 1', 'Not sure', 'report revision 2', 'Not selected for this wash.', 'Not eligible under the current recipe.', 'Each wash counts once']) expect(output).toContain(text)
  expect(output).not.toContain('1 independent washes')
  expect(output).not.toContain('wash wash')
})

test('withheld guidance preserves explicit choice feedback and discloses incomplete evidence', () => {
  const candidate = comparison.candidates[0]!
  const output = markup({ ...comparison, candidates: [{ ...candidate, guidance: { direction: 'withhold', explanation: 'A negative report needs review.' }, summaries: [{ ...summary, historyTruncated: true, negativeHistoryTruncated: true, influencingObservationsTruncated: true, influencingObservationCount: 130 }] }] }, ['addition'])
  for (const text of ['Suggestion withheld', 'A negative report needs review.', 'Selected for this wash.', 'Remove it under Extra products.', 'Showing 1 of 130', 'This comparison uses a partial history.']) expect(output).toContain(text)
})

test('matching pieces share one influence control with a count and a Mixed state', () => {
  const twins = [{ textileId: 'tee', name: 'White T-shirt', color: 'White', colorGroup: 'light' }, { textileId: 'tee2', name: 'White T-shirt', color: 'White', colorGroup: 'light' }] as unknown as Textile[]
  const members = [{ textileId: 'tee' as never, enabled: true, resetAt: 0, revision: 0 }, { textileId: 'tee2' as never, enabled: false, resetAt: 0, revision: 1 }]
  queryFailure.controls = { scope: { enabled: false, resetAt: 0, revision: 1 }, effective: { enabled: false, resetAt: 0 }, members }
  try {
    const output = renderToStaticMarkup(<PersonalProductGuidance householdId="household" planId="plan" loadId="load" inputHash="shared" textileIds={['tee', 'tee2']} textiles={twins} supplyIds={['addition']} supplies={supplies} selected={[]} disabled={false} />)
    expect(output.match(/aria-label="Use my results for White T-shirt ×2"/g)).toHaveLength(1)
    expect(output).not.toContain('Use my results for White T-shirt"')
    expect(output).toContain('aria-checked="mixed"')
    expect(output).toContain('Mixed: your results are used for 1 of 2 pieces. A change here applies to every piece.')
  } finally { queryFailure.controls = undefined }
  expect(influenceGroups(['tee', 'tee2', 'other'], [...twins, { textileId: 'other', name: 'White T-shirt', color: 'Navy', colorGroup: 'dark' } as unknown as Textile]).map((group) => group.label)).toEqual(['White T-shirt ×2', 'White T-shirt'])
  const twinComparison = { ...comparison, candidates: [{ ...comparison.candidates[0]!, summaries: [summary, { ...summary, textileId: 'tee2' as never }] }] }
  const grouped = renderToStaticMarkup(<GuidanceObservations comparison={twinComparison} supplies={supplies} textiles={twins} selected={[]} />)
  expect(grouped).toContain('White T-shirt ×2')
  expect(grouped.match(/1 independent wash/g)).toHaveLength(1)
  const differing = { ...comparison, candidates: [{ ...comparison.candidates[0]!, summaries: [summary, { ...summary, textileId: 'tee2' as never, explanation: 'No comparable washes yet.' }] }] }
  expect(renderToStaticMarkup(<GuidanceObservations comparison={differing} supplies={supplies} textiles={twins} selected={[]} />)).toContain('Piece 2 of 2')
})

test('disabled and reset controls describe effective scope and retained cutoff', () => {
  const output = renderToStaticMarkup(<ControlStatus controls={{ scope: { enabled: true, revision: 1, resetAt: 0 }, effective: { enabled: false, resetAt: 100 }, members: [] }} />)
  expect(output).toContain('off in the household-wide control')
  expect(output).toContain('Earlier washes are excluded after a reset.')
  expect(renderToStaticMarkup(<ControlStatus controls={{ scope: { enabled: false, revision: 1, resetAt: 0 }, effective: { enabled: false, resetAt: 0 }, members: [] }} />)).toContain('off for this scope')
})

test('empty influencing reports and explicit bounds cannot imply a complete comparison', () => {
  expect(markup({ ...comparison, candidates: [{ ...comparison.candidates[0]!, summaries: [{ ...summary, status: 'disabled', observations: [], explanation: 'Personal influence is disabled.' }] }] })).toContain('No influencing observations')
  expect(guidanceScopeIssue(17, 2)).toContain('outside that scope')
  expect(guidanceScopeIssue(16, 5)).toContain('at most four')
  expect(guidanceScopeIssue(16, 0)).toContain('does not select')
  expect(guidanceScopeIssue(16, 4)).toBeNull()
})

test('saving requires the reviewed context, current preview hash and saved revision', () => {
  const review = { context: 'odor/after-wash/products', inputHash: 'private-hash', revision: 2 }
  expect(guidanceSaveReady(review, review.context, review.inputHash, 2)).toBe(true)
  expect(guidanceSaveReady(review, 'feel/after-drying/products', review.inputHash, 2)).toBe(false)
  expect(guidanceSaveReady(review, review.context, 'new-report-hash', 2)).toBe(false)
  expect(guidanceSaveReady(review, review.context, review.inputHash, 3)).toBe(false)
  expect(guidanceSaveReady(review, review.context, review.inputHash, undefined)).toBe(false)
  expect(guidanceSaveReady(null, review.context, review.inputHash, 2)).toBe(false)
})

test('stale saved metadata is never presented as current guidance', () => {
  expect(savedGuidanceLabel({ status: 'stale', guidanceId: 'saved' as never, revision: 1, inputHash: 'old', savedAt: 100, reason: 'Reports changed.' })).toContain('stale')
  expect(savedGuidanceLabel(null)).toBe('No private guidance saved.')
  expect(savedGuidanceLabel(undefined)).toContain('Loading')
})

test('query failures stay inside the private panel while its controls remain accessible', () => {
  queryFailure.active = true
  try {
    const output = renderToStaticMarkup(<PersonalProductGuidance householdId="household" planId="plan" loadId="load" inputHash="shared" textileIds={['tee']} textiles={textiles} supplyIds={['addition']} supplies={supplies} selected={[]} disabled={false} />)
    expect(output).toContain('Saved guidance is unavailable.')
    expect(output).toContain('This load already has a session')
    expect(output).toContain('What result should this comparison use?')
    expect(output).toContain('Compare Optional addition')
    expect(output).not.toContain('Private guidance saved.')
  } finally { queryFailure.active = false }
})

type Saved = FunctionReturnType<typeof api.personalSuggestions.savedForPlan>
const currentSaved = (direction = 'reported_improvement'): NonNullable<Saved> & { status: 'current' } => ({ status: 'current', guidanceId: 'saved' as never, revision: 1, inputHash: 'private', savedAt: 100,
  result: { inputHash: 'private', inputSnapshot: { personalSuggestions: { evidenceInputHash: 'shared', loadId: 'load', choices: [{ supplyId: 'addition', eligible: true, summaries: [summary] }] } },
    loads: [{ id: 'load', productRecommendations: [comparison.candidates[0]!.benefit], personalSuggestions: { policyVersion: 'personal-planner-1', noAdditionAvailable: true,
      choices: [{ supplyId: 'addition', selected: false, suppressed: false, guidance: { direction, explanation: 'Reports describe improvement; additional benefit is not established.' } }] } }] } } as unknown as NonNullable<Saved> & { status: 'current' })

test('main recommendations consume the saved load and influencing observations from its own context', () => {
  const saved = currentSaved()
  const view = savedRecommendationView(saved, 'load', 'shared', false)
  expect(view.guidance?.load).toEqual(saved.result.loads[0])
  expect(view.guidance?.comparison.candidates[0]?.summaries[0]?.observations).toEqual(summary.observations)
  expect(view.status).toContain('No addition remains an option')
  expect(savedRecommendationView(saved, 'other-load', 'shared', false).guidance).toBeUndefined()
  expect(savedRecommendationView(saved, 'load', 'different-shared-plan', false).guidance).toBeUndefined()
  expect(savedRecommendationView({ ...saved, inputHash: 'different-private-result' }, 'load', 'shared', false).guidance).toBeUndefined()
  expect(savedRecommendationView({ ...saved, result: { inputHash: 'private' } } as unknown as Saved, 'load', 'shared', false).guidance).toBeUndefined()
  const missingChoices = { ...saved, result: { ...saved.result, loads: saved.result.loads.map((load) => ({ ...load, personalSuggestions: { ...load.personalSuggestions!, choices: [] } })) } }
  expect(savedRecommendationView(missingChoices, 'load', 'shared', false).guidance).toBeUndefined()
})

test('stale, unavailable, updating, locally invalidated and disabled states never retain a private ranked claim', () => {
  const saved = currentSaved()
  const states = [
    savedRecommendationView(undefined, 'load', 'shared', false),
    savedRecommendationView(null, 'load', 'shared', false),
    savedRecommendationView(new Error('query failed'), 'load', 'shared', false),
    savedRecommendationView({ status: 'stale', guidanceId: 'saved' as never, revision: 1, savedAt: 100, inputHash: 'old', reason: 'Reports changed.' }, 'load', 'shared', false),
    savedRecommendationView(saved, 'load', 'shared', true),
    savedRecommendationView(saved, 'load', 'shared', false, true),
  ]
  states.push(savedRecommendationView(currentSaved('disabled'), 'load', 'shared', false))
  for (const state of states) { expect(state.guidance).toBeUndefined(); expect(state.status).toContain('recorded product evidence') }
  expect(states[3]?.status).toContain('Reports changed.')
  expect(states[6]?.status).toContain('disabled')
})

test('Laundry benefit mount presents current saved observations and falls back when the saved result becomes stale', () => {
  const saved = currentSaved()
  const render = () => renderToStaticMarkup(<PersonalProductGuidance householdId="household" planId="plan" loadId="load" inputHash="shared" textileIds={['tee']} textiles={textiles} supplyIds={['addition']} supplies={supplies} selected={[]}
    disabled={false} benefits={{ decisions: [comparison.candidates[0]!.benefit], goal: 'odor', onGoal: () => undefined, onChoose: () => undefined }} />)
  try {
    queryFailure.saved = saved
    const current = render()
    expect(current).toContain('Current saved private guidance orders optional suggestions only.')
    expect(current).toContain('Why these private suggestions?')
    expect(current).toContain('Independent wash 1')
    expect(current.match(/Any extra product\?/g)).toHaveLength(1)
    expect(current).not.toContain('aria-checked="true"')
    queryFailure.saved = { ...saved, status: 'stale', reason: 'Controls or reports changed.' }
    const stale = render()
    expect(stale).toContain('Saved private suggestions are stale.')
    expect(stale).toContain('Benefit not established')
    expect(stale).not.toContain('Reported improvement')
    expect(stale).not.toContain('Independent wash 1')
    expect(stale).not.toContain('Why these private suggestions?')
  } finally { queryFailure.saved = undefined }
})
