import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { finishSteps, intakeHousehold, joinHousehold, keyOf, newBackend, planFor, signedIn, startLoad, type Caller } from './harness.testing'
import { removePrincipalData } from './identity'

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(Date.UTC(2026, 9, 4, 23, 0)) })
afterEach(() => { vi.useRealTimers() })
type Home = Awaited<ReturnType<typeof homeFor>>
async function homeFor(as: Caller) {
  const home = await intakeHousehold(as)
  await as.mutation(api.inventory.updateTextile, { textileId: home.shirt, kind: 't_shirt', status: 'dirty', soilLevel: 'normal' })
  await as.mutation(api.garmentAdvice.setDecoration, { textileIds: [home.shirt], facts: { kind: 'none', method: 'unknown', manufacturer: '', source: 'synthetic plain clothing', confidence: 'observed' }, expectedRevisions: [{ textileId: home.shirt, revision: 0 }] })
  const capabilities = [{ kind: 'soil_dispersal' as const, status: 'present' as const, variant: 'Synthetic exact pack', market: 'US', formulationRevision: 'fixture-1', source: 'synthetic disclosure', retrievedAt: Date.now(), scope: 'ingredient_disclosure' as const }]
  const safety = { bleachKind: 'none' as const, incompatibleSupplyIds: [], incompatibleMaterials: [], capabilities }
  await as.mutation(api.inventory.updateSupply, { supplyId: home.detergent, safety })
  const addition = await as.mutation(api.inventory.createSupply, { householdId: home.householdId, name: 'Synthetic addition', kind: 'chemical', use: 'booster', formulation: { name: 'Synthetic exact formula', form: 'liquid' }, safety, provenance: { confidence: 'verified', source: 'synthetic exact pack' } })
  const rule = await as.mutation(api.inventory.saveRule, { supplyId: addition, stage: 'wash', placement: 'direct_to_drum', timing: 'before loading garments', dose: { amount: 20, unit: 'ml' }, provenance: { confidence: 'verified', source: 'synthetic exact directions' } })
  return { ...home, addition, additionRule: rule, safety }
}
async function wash(as: Caller, home: Home) {
  vi.advanceTimersByTime(1000)
  await as.mutation(api.inventory.updateTextile, { textileId: home.shirt, status: 'dirty', soilLevel: 'normal' })
  const planned = await planFor(as, home.householdId, [home.shirt], { optionalSupplyIds: [home.addition], washGoals: ['odor'] })
  const idempotencyKey = `prospective-wash-${Date.now()}`
  const { sessionId } = await startLoad(as, { planId: planned.planId, loadId: planned.result.loads[0]!.id, idempotencyKey })
  await finishSteps(as, sessionId, 'medium', 40)
  await as.mutation(api.sessions.complete, { sessionId, planInputHash: planned.inputHash, idempotencyKey })
  const recordId = (await as.query(api.sessions.washRecordsForTextile, { textileId: home.shirt }))[0]!._id
  await as.mutation(api.outcomeAssessments.save, { recordId, dimension: 'odor', checkedWhen: 'after_wash', result: 'improved', expectedRevision: 0, receiptId: `prospective-result-${Date.now()}` })
  return recordId
}
async function upcoming(as: Caller, home: Home) {
  await as.mutation(api.inventory.updateTextile, { textileId: home.shirt, status: 'dirty', soilLevel: 'normal' })
  return planFor(as, home.householdId, [home.shirt], { washGoals: ['odor'] })
}
const request = (planned: Awaited<ReturnType<typeof upcoming>>, supplyIds: Id<'supplies'>[]) => ({ planId: planned.planId, loadId: planned.result.loads[0]!.id,
  supplyIds, dimension: 'odor' as const, checkedWhen: 'after_wash' as const })

test('live and saved guidance contain only the authorized load, never another private garment’s inputs', async () => {
  const t = newBackend(), owner = signedIn(t, 'preview-owner'), home = await homeFor(owner)
  const member = await joinHousehold(t, owner, home.householdId, 'preview-private', 'Sam')
  const wearerId = await member.mutation(api.inventory.createWearer, { householdId: home.householdId, name: 'Sam', kind: 'adult', self: true })
  await owner.mutation(api.inventory.updateTextile, { textileId: home.towel, wearerId, color: 'Private violet proof', colorGroup: 'dark', soilLevel: 'normal' })
  const planned = await planFor(owner, home.householdId, [home.shirt, home.towel], { washGoals: ['odor'] })
  const load = planned.result.loads.find(row => row.textileIds.includes(home.shirt))!
  expect(load.textileIds).not.toContain(home.towel)
  await member.mutation(api.inventory.setPrivacy, { textileIds: [home.towel], private: true })
  const args = { ...request(planned, [home.addition]), loadId: load.id }
  const preview = await owner.query(api.personalSuggestions.plannerPreview, args)
  expect(preview.result.loads.map((row: { id: string }) => row.id)).toEqual([load.id])
  expect(Object.keys(preview.result.inputSnapshot)).toEqual(['personalSuggestions'])
  expect(JSON.stringify(preview)).not.toContain('Private violet proof')
  expect(JSON.stringify(preview)).not.toContain(home.towel)
  await owner.mutation(api.personalSuggestions.savePreview, { ...args, previewInputHash: preview.result.inputHash, expectedRevision: 0 })
  const saved = await owner.query(api.personalSuggestions.savedForPlan, { planId: planned.planId, loadId: load.id })
  expect(saved).toMatchObject({ status: 'current', result: preview.result })
  expect(JSON.stringify(saved)).not.toContain(home.towel)
})

test('upcoming unselected choices compare three actual washes privately without changing a shared plan', async () => {
  const t = newBackend(), as = signedIn(t, 'prospective-private'), home = await homeFor(as)
  const records = [await wash(as, home), await wash(as, home), await wash(as, home)]
  const second = await as.mutation(api.inventory.createSupply, { householdId: home.householdId, name: 'Synthetic alternative', kind: 'chemical', use: 'booster', formulation: { name: 'Other exact formula', form: 'liquid' }, safety: home.safety, provenance: { confidence: 'verified', source: 'synthetic other pack' } })
  await as.mutation(api.inventory.saveRule, { supplyId: second, stage: 'wash', placement: 'direct_to_drum', timing: 'before loading garments', dose: { amount: 20, unit: 'ml' }, provenance: { confidence: 'verified', source: 'synthetic other directions' } })
  const planned = await upcoming(as, home)
  const before = await t.run((ctx) => ctx.db.get(planned.planId))
  const args = request(planned, [home.addition, second])
  const compared = await as.query(api.personalSuggestions.forPlan, args)
  expect(compared.recordsConsidered).toBe(3)
  expect(compared.candidates[0]).toMatchObject({ supplyId: home.addition, eligible: true, guidance: { direction: 'reported_improvement' } })
  expect(compared.candidates[0]!.summaries[0]).toMatchObject({ status: 'repeated_pattern', counts: { independentWashes: 3, improved: 3 }, influencingObservationsTruncated: false })
  expect(compared.candidates[1]).toMatchObject({ supplyId: second, guidance: { direction: 'prefer_simple' } })
  expect(await as.query(api.personalSuggestions.forPlan, { ...args, supplyIds: [second, home.addition] })).toEqual(compared)
  expect(await t.run((ctx) => ctx.db.get(planned.planId))).toEqual(before)
  expect((await as.query(api.plans.get, { planId: planned.planId }))!.pass.optionalSupplyIds).toEqual([])
  const preview = await as.query(api.personalSuggestions.plannerPreview, args)
  expect(preview.comparison).toEqual(compared)
  expect(Object.keys(preview.result.inputSnapshot)).toEqual(['personalSuggestions'])
  expect(preview.result.inputSnapshot.personalSuggestions).toMatchObject({ evidenceInputHash: planned.inputHash, comparisonInputHash: compared.inputHash })
  expect(preview.result.loads[0]!.treatments).toEqual(planned.result.loads[0]!.treatments)
  expect(preview.result.loads[0]!.personalSuggestions!.choices.find((choice) => choice.supplyId === home.addition)).toMatchObject({ selected: false, suppressed: false, guidance: { direction: 'reported_improvement' } })
  const member = await joinHousehold(t, as, home.householdId, 'prospective-other', 'Sam')
  const other = await member.query(api.personalSuggestions.forPlan, args)
  expect(other.candidates.every((candidate) => candidate.summaries.every((summary) => summary.observations.length === 0))).toBe(true)
  expect(other.inputHash).not.toBe(compared.inputHash)
  expect((await member.query(api.personalSuggestions.plannerPreview, args)).result.inputHash).not.toBe(preview.result.inputHash)
  await as.mutation(api.outcomeAssessments.save, { recordId: records[0]!, dimension: 'damage', checkedWhen: 'after_wearing', result: 'damage', expectedRevision: 0, receiptId: 'prospective-later-negative' })
  expect((await as.query(api.personalSuggestions.forPlan, args)).candidates.find((candidate) => candidate.supplyId === home.addition)!.guidance.direction).toBe('withhold')
  const held = await as.query(api.personalSuggestions.plannerPreview, args)
  expect(held.result.loads[0]!.productRecommendations!.some((decision) => decision.supplyId === home.addition)).toBe(false)
  expect(held.result.loads[0]!.withheldProductRecommendations!.map((decision) => decision.supplyId)).toContain(home.addition)
  expect(held.result.loads[0]!.treatments).toEqual(planned.result.loads[0]!.treatments)
  expect(held.result.inputHash).not.toBe(preview.result.inputHash)
  expect((await member.query(api.personalSuggestions.plannerPreview, args)).result.loads[0].withheldProductRecommendations).toBeUndefined()
  expect((await member.query(api.personalSuggestions.forPlan, args)).candidates.every((candidate) => candidate.guidance.direction === 'prefer_simple')).toBe(true)
  expect(await t.run((ctx) => ctx.db.get(planned.planId))).toEqual(before)
  await as.mutation(api.personalAdaptation.change, { householdId: home.householdId, textileId: home.shirt, expectedRevision: 0, action: { kind: 'reset' } })
  expect((await as.query(api.personalSuggestions.forPlan, args)).candidates.every((candidate) => candidate.summaries.every((summary) => summary.observations.length === 0))).toBe(true)
  expect((await as.query(api.personalSuggestions.plannerPreview, args)).result.loads[0].withheldProductRecommendations).toBeUndefined()
})

test('proposed native doses compare only with the same recorded qualifier', async () => {
  const t = newBackend(), as = signedIn(t, 'prospective-native'), home = await homeFor(as)
  const measure = { kind: 'cap' as const, marks: [{ label: 'Bar 2' }] }
  await as.mutation(api.inventory.updateSupply, { supplyId: home.addition, measure })
  const directions = { supplyId: home.addition, measure, stage: 'wash' as const, placement: 'direct_to_drum' as const,
    timing: 'before loading garments', provenance: { confidence: 'verified' as const, source: 'synthetic native directions' } }
  await as.mutation(api.inventory.saveLabelDirections, { ...directions, rows: [{ cells: [{ amount: 1, unit: 'cap', mark: 'Bar 2', target: 'below' }] }] })
  await wash(as, home)
  const checked = await upcoming(as, home)
  expect((await as.query(api.personalSuggestions.forPlan, request(checked, [home.addition]))).candidates[0]!.summaries[0]!.counts.independentWashes).toBe(1)
  await as.mutation(api.inventory.saveLabelDirections, { ...directions, rows: [{ cells: [{ amount: 1, unit: 'cap', mark: 'Bar 2' }] }] })
  const fullMark = await upcoming(as, home)
  expect((await as.query(api.personalSuggestions.forPlan, request(fullMark, [home.addition]))).candidates[0]!.summaries[0]!.counts.independentWashes).toBe(0)
})

test('unknown program timing and later-stage proposals do not invent execution or promote a product', async () => {
  const t = newBackend(), as = signedIn(t, 'prospective-unknown'), home = await homeFor(as)
  await wash(as, home)
  const planned = await upcoming(as, home), args = request(planned, [home.addition])
  const specified = await as.query(api.personalSuggestions.forPlan, args)
  expect(specified.candidates[0]!.summaries[0]!.counts.independentWashes).toBe(1)
  await t.run((ctx) => ctx.db.patch(home.machine, { cycleProfile: { cycles: { normal: { durationMinutes: 45, confidence: 'verified' } } } }))
  const otherProgram = await as.query(api.personalSuggestions.forPlan, args)
  expect(otherProgram.candidates[0]!.summaries[0]!.counts.independentWashes).toBe(0)
  expect(otherProgram.inputHash).not.toBe(specified.inputHash)
  expect((await as.query(api.personalSuggestions.forPlan, { ...args, checkedWhen: 'after_drying' })).candidates[0]!.summaries[0]).toMatchObject({ status: 'insufficient_context', contextKey: null, observations: [] })
  await t.run((ctx) => ctx.db.patch(home.machine, { cycleProfile: undefined }))
  const compared = await as.query(api.personalSuggestions.forPlan, args)
  expect(compared).toMatchObject({ recordsConsidered: 0 })
  expect(compared.candidates[0]).toMatchObject({ eligible: true, guidance: { direction: 'prefer_simple' } })
  expect(compared.candidates[0]!.summaries[0]).toMatchObject({ status: 'insufficient_context', contextKey: null, observations: [] })
})

test('stale, in-progress and foreign requests are refused; result changes never rewrite active recipes', async () => {
  const t = newBackend(), as = signedIn(t, 'prospective-guards'), home = await homeFor(as)
  const recordId = await wash(as, home)
  const planned = await upcoming(as, home), args = request(planned, [home.addition])
  await expect(as.query(api.personalSuggestions.forPlan, { ...args, supplyIds: [home.addition, home.addition] })).rejects.toThrow('distinct')
  await expect(as.query(api.personalSuggestions.forPlan, { ...args, supplyIds: [home.detergent] })).rejects.toThrow('optional')
  const outsider = signedIn(t, 'prospective-outsider'), outside = await homeFor(outsider)
  await expect(outsider.query(api.personalSuggestions.forPlan, args)).rejects.toThrow('Forbidden')
  await expect(as.query(api.personalSuggestions.forPlan, { ...args, supplyIds: [outside.addition] })).rejects.toThrow('Forbidden')
  const { sessionId } = await startLoad(as, { planId: planned.planId, loadId: args.loadId, idempotencyKey: 'prospective-active-guard' })
  const before = await as.query(api.execution.sessionDetail, { sessionId })
  await as.mutation(api.outcomeAssessments.save, { recordId, dimension: 'odor', checkedWhen: 'after_wash', result: 'irritation', expectedRevision: 1, receiptId: 'prospective-active-report' })
  await expect(as.query(api.personalSuggestions.forPlan, args)).rejects.toThrow('already has a session')
  await expect(as.query(api.personalSuggestions.plannerPreview, args)).rejects.toThrow('already has a session')
  expect(await as.query(api.execution.sessionDetail, { sessionId })).toEqual(before)
  await as.mutation(api.inventory.updateSupply, { supplyId: home.addition, formulation: { name: 'Changed formula', form: 'liquid' } })
  await expect(as.query(api.personalSuggestions.forPlan, args)).rejects.toThrow('current plan')
})

test('reviewed private guidance saves once, replays its input and becomes stale after corrections and controls', async () => {
  const t = newBackend(), as = signedIn(t, 'saved-guidance-replay'), home = await homeFor(as)
  const records = [await wash(as, home), await wash(as, home), await wash(as, home)]
  const planned = await upcoming(as, home), args = request(planned, [home.addition])
  const shared = await t.run((ctx) => ctx.db.get(planned.planId))
  expect(await as.query(api.personalSuggestions.savedForPlan, { planId: planned.planId, loadId: args.loadId })).toBeNull()
  const preview = await as.query(api.personalSuggestions.plannerPreview, args)
  const saveArgs = { ...args, previewInputHash: preview.result.inputHash, expectedRevision: 0 }
  const saved = await as.mutation(api.personalSuggestions.savePreview, saveArgs)
  expect(saved).toMatchObject({ revision: 1, replay: false })
  expect(await as.mutation(api.personalSuggestions.savePreview, saveArgs)).toEqual({ ...saved, replay: true })
  const restored = await as.query(api.personalSuggestions.savedForPlan, { planId: planned.planId, loadId: args.loadId })
  expect(restored?.status).toBe('current')
  if (restored?.status !== 'current') throw new Error('Expected current private guidance')
  expect(restored.result).toEqual(preview.result)
  expect(Object.keys(restored.result.inputSnapshot)).toEqual(['personalSuggestions'])
  expect(await t.run((ctx) => ctx.db.get(planned.planId))).toEqual(shared)
  expect(await t.run((ctx) => ctx.db.query('personalPlanGuidanceEntries').collect())).toHaveLength(1)
  await as.mutation(api.outcomeAssessments.save, { recordId: records[0]!, dimension: 'odor', checkedWhen: 'after_wash', result: null, expectedRevision: 1, receiptId: 'saved-guidance-clear-report' })
  const stale = await as.query(api.personalSuggestions.savedForPlan, { planId: planned.planId, loadId: args.loadId })
  expect(stale).toMatchObject({ status: 'stale', revision: 1 })
  expect(stale).not.toHaveProperty('result')
  await expect(as.mutation(api.personalSuggestions.savePreview, saveArgs)).rejects.toThrow('latest preview')
  const current = await as.query(api.personalSuggestions.plannerPreview, args)
  await expect(as.mutation(api.personalSuggestions.savePreview, { ...saveArgs, previewInputHash: current.result.inputHash, expectedRevision: 0 })).rejects.toThrow('before replacing')
  const next = await as.mutation(api.personalSuggestions.savePreview, { ...saveArgs, previewInputHash: current.result.inputHash, expectedRevision: 1 })
  expect(next).toMatchObject({ guidanceId: saved.guidanceId, revision: 2 })
  await as.mutation(api.personalAdaptation.change, { householdId: home.householdId, expectedRevision: 0, action: { kind: 'set_enabled', enabled: false } })
  expect(await as.query(api.personalSuggestions.savedForPlan, { planId: planned.planId, loadId: args.loadId })).toMatchObject({ status: 'stale' })
  const disabled = await as.query(api.personalSuggestions.plannerPreview, args)
  const disabledSave = await as.mutation(api.personalSuggestions.savePreview, { ...saveArgs, previewInputHash: disabled.result.inputHash, expectedRevision: 2 })
  expect(disabledSave.revision).toBe(3)
  await as.mutation(api.personalAdaptation.change, { householdId: home.householdId, expectedRevision: 1, action: { kind: 'reset' } })
  expect(await as.query(api.personalSuggestions.savedForPlan, { planId: planned.planId, loadId: args.loadId })).toMatchObject({ status: 'stale' })
  const { sessionId } = await startLoad(as, { planId: planned.planId, loadId: args.loadId, idempotencyKey: 'saved-guidance-start' })
  const session = await as.query(api.execution.sessionDetail, { sessionId })
  const afterStart = await as.query(api.personalSuggestions.savedForPlan, { planId: planned.planId, loadId: args.loadId })
  expect(afterStart).toMatchObject({ status: 'stale' })
  expect(afterStart).not.toHaveProperty('result')
  await expect(as.mutation(api.personalSuggestions.savePreview, { ...saveArgs, expectedRevision: 3 })).rejects.toThrow('already has a session')
  expect(await as.query(api.execution.sessionDetail, { sessionId })).toEqual(session)
})

test('saved guidance remains reporter-private and is erased with an account or referenced clothing entry', async () => {
  const t = newBackend(), as = signedIn(t, 'saved-guidance-owner'), home = await homeFor(as)
  await wash(as, home)
  const planned = await upcoming(as, home), args = request(planned, [home.addition])
  const preview = await as.query(api.personalSuggestions.plannerPreview, args)
  const saved = await as.mutation(api.personalSuggestions.savePreview, { ...args, previewInputHash: preview.result.inputHash, expectedRevision: 0 })
  const member = await joinHousehold(t, as, home.householdId, 'saved-guidance-other', 'Sam')
  expect(await member.query(api.personalSuggestions.savedForPlan, { planId: planned.planId, loadId: args.loadId })).toBeNull()
  const otherPreview = await member.query(api.personalSuggestions.plannerPreview, args)
  const other = await member.mutation(api.personalSuggestions.savePreview, { ...args, previewInputHash: otherPreview.result.inputHash, expectedRevision: 0 })
  expect(other.guidanceId).not.toBe(saved.guidanceId)
  const memberships = await as.query(api.households.members, { householdId: home.householdId })
  await as.mutation(api.households.removeMember, { membershipId: memberships.find((row) => row.displayName === 'Sam')!.membershipId })
  await expect(member.query(api.personalSuggestions.savedForPlan, { planId: planned.planId, loadId: args.loadId })).rejects.toThrow('Forbidden')
  await expect(member.mutation(api.personalSuggestions.savePreview, { ...args, previewInputHash: otherPreview.result.inputHash, expectedRevision: 1 })).rejects.toThrow('Forbidden')
  const memberKey = await keyOf(member)
  await t.run((ctx) => removePrincipalData(ctx, memberKey))
  await t.finishAllScheduledFunctions(vi.runAllTimers)
  expect(await t.run((ctx) => ctx.db.get(other.guidanceId))).toBeNull()
  expect(await t.run((ctx) => ctx.db.get(saved.guidanceId))).not.toBeNull()
  await as.mutation(api.inventory.deleteTextile, { textileId: home.shirt })
  await t.finishAllScheduledFunctions(vi.runAllTimers)
  expect(await t.run((ctx) => ctx.db.query('personalPlanGuidance').collect())).toEqual([])
  expect(await t.run((ctx) => ctx.db.query('personalPlanGuidanceEntries').collect())).toEqual([])
})

test('replacing a shared plan removes its private guidance and entry references', async () => {
  const t = newBackend(), as = signedIn(t, 'saved-guidance-retire'), home = await homeFor(as)
  const planned = await upcoming(as, home), args = request(planned, [home.addition])
  const preview = await as.query(api.personalSuggestions.plannerPreview, args)
  await as.mutation(api.personalSuggestions.savePreview, { ...args, previewInputHash: preview.result.inputHash, expectedRevision: 0 })
  const replaced = await planFor(as, home.householdId, [home.shirt], { washGoals: ['odor'], optionalSupplyIds: [home.addition] })
  expect(replaced.planId).not.toBe(planned.planId)
  await t.finishAllScheduledFunctions(vi.runAllTimers)
  expect(await t.run((ctx) => ctx.db.query('personalPlanGuidance').collect())).toEqual([])
  expect(await t.run((ctx) => ctx.db.query('personalPlanGuidanceEntries').collect())).toEqual([])
})

test('entry deletion continues beyond the eight-snapshot cleanup batch without leaving private references', async () => {
  const t = newBackend(), as = signedIn(t, 'saved-guidance-batches'), home = await homeFor(as)
  const planned = await upcoming(as, home), args = request(planned, [home.addition])
  const preview = await as.query(api.personalSuggestions.plannerPreview, args)
  const saved = await as.mutation(api.personalSuggestions.savePreview, { ...args, previewInputHash: preview.result.inputHash, expectedRevision: 0 })
  // Nine valid private inputs on distinct identical synthetic plans exercise the deletion boundary.
  await t.run(async (ctx) => {
    const { _id: _planId, _creationTime: _planTime, ...planValue } = (await ctx.db.get(planned.planId))!
    const { _id: _guidanceId, _creationTime: _guidanceTime, ...guidanceValue } = (await ctx.db.get(saved.guidanceId))!
    for (let index = 0; index < 8; index++) {
      const planId = await ctx.db.insert('plans', { ...planValue, selectionKey: undefined })
      const guidanceId = await ctx.db.insert('personalPlanGuidance', { ...guidanceValue, planId })
      await ctx.db.insert('personalPlanGuidanceEntries', { guidanceId, textileId: home.shirt })
    }
  })
  expect(await t.run((ctx) => ctx.db.query('personalPlanGuidance').collect())).toHaveLength(9)
  await as.mutation(api.inventory.deleteTextile, { textileId: home.shirt })
  expect(await t.run((ctx) => ctx.db.query('personalPlanGuidance').collect())).toHaveLength(1)
  await t.finishAllScheduledFunctions(vi.runAllTimers)
  expect(await t.run((ctx) => ctx.db.query('personalPlanGuidance').collect())).toEqual([])
  expect(await t.run((ctx) => ctx.db.query('personalPlanGuidanceEntries').collect())).toEqual([])
})

test('a changed stored private input cannot reuse its hash and can be replaced only after a fresh reviewed save', async () => {
  const t = newBackend(), as = signedIn(t, 'saved-guidance-integrity'), home = await homeFor(as)
  const planned = await upcoming(as, home), args = request(planned, [home.addition])
  const preview = await as.query(api.personalSuggestions.plannerPreview, args)
  const saveArgs = { ...args, previewInputHash: preview.result.inputHash, expectedRevision: 0 }
  const saved = await as.mutation(api.personalSuggestions.savePreview, saveArgs)
  await t.run(async (ctx) => {
    const row = (await ctx.db.get(saved.guidanceId))!
    await ctx.db.patch(row._id, { personalInput: { ...row.personalInput, comparisonInputHash: 'changed-after-save' } })
  })
  const invalid = await as.query(api.personalSuggestions.savedForPlan, { planId: planned.planId, loadId: args.loadId })
  expect(invalid).toMatchObject({ status: 'stale' })
  expect(invalid).not.toHaveProperty('result')
  await expect(as.mutation(api.personalSuggestions.savePreview, saveArgs)).rejects.toThrow('before replacing')
  const fixed = await as.mutation(api.personalSuggestions.savePreview, { ...saveArgs, expectedRevision: 1 })
  expect(fixed).toMatchObject({ guidanceId: saved.guidanceId, revision: 2, replay: false })
  expect(await as.query(api.personalSuggestions.savedForPlan, { planId: planned.planId, loadId: args.loadId })).toMatchObject({ status: 'current', result: preview.result })
})
