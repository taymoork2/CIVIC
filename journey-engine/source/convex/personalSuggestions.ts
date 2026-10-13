import { getPlan } from './planStorage'
import { ConvexError, v } from 'convex/values'
import { personalContextKey, personalPlannerPolicyVersion, personalSuggestionGuidance, personalSuggestionRank, plan, plannerVersion, productBenefit, sha256, stableJson, type PersonalOutcomeContext } from '@washcloset/planner'
import { mutation, query } from './_generated/server'
import type { Id } from './_generated/dataModel'
import { authorize, related, type Action, type ReadCtx } from './access'
import { fail } from './errors'
import { canonicalPlannerInput, planResult, storedPass } from './plans'
import { outcomeDimension, outcomeStage } from './outcomeValues'
import { personalSummaryView } from './personalAdaptation'
import { proposedOutcomeContext } from './personalOutcomeContext'
import { loadPersonalHistory, summarizeHistory } from './personalOutcomeHistory'

const proposalPolicyVersion = 'personal-proposals-1'
const benefitView = v.object({ supplyId: v.id('supplies'), status: v.union(v.literal('suggested'), v.literal('unnecessary'), v.literal('preference_only'), v.literal('unknown'), v.literal('excluded')),
  compatibility: v.union(v.literal('allowed'), v.literal('unknown'), v.literal('excluded')), reason: v.string(), evidence: v.array(v.string()), policyVersion: v.string() })
const guidanceView = v.object({ direction: v.union(v.literal('withhold'), v.literal('reported_improvement'), v.literal('prefer_simple'), v.literal('disabled'), v.literal('evidence_only')), explanation: v.string() })
const candidateSummaryView = v.object({ ...personalSummaryView.fields, textileId: v.id('textiles'), contextKey: v.union(v.string(), v.null()),
  influencingObservationCount: v.number(), influencingObservationsTruncated: v.boolean() })

const comparisonArgs = v.object({ planId: v.id('plans'), loadId: v.string(), supplyIds: v.array(v.id('supplies')), dimension: outcomeDimension, checkedWhen: outcomeStage })
const comparisonView = v.object({ proposalPolicyVersion: v.literal(proposalPolicyVersion), inputHash: v.string(), recordsConsidered: v.number(),
    candidates: v.array(v.object({ supplyId: v.id('supplies'), eligible: v.boolean(), proposalHash: v.string(), benefit: benefitView,
      guidance: guidanceView, summaries: v.array(candidateSummaryView) })) })

async function compareForPlan(ctx: ReadCtx, action: Action, args: import('convex/values').Infer<typeof comparisonArgs>) {
    const stored = await getPlan(ctx, args.planId)
    if (stored === null) fail('not_found', 'Plan not found')
    const actor = (await authorize(ctx, action, { householdId: stored.householdId })).actor
    if (stored.plannerVersion !== plannerVersion || stored.status === 'stale' || stored.status === 'retired' || stored.textileIds === undefined) fail('stale', 'Review the current plan before comparing optional choices')
    const base = planResult(stored).loads.find((load) => load.id === args.loadId)
    if (base === undefined) fail('not_found', 'Load not found')
    const ids = base.textileIds.map((id) => id as Id<'textiles'>).sort()
    if (ids.length === 0 || ids.length > 16) fail('invalid', 'Compare a load of at most 16 clothing entries')
    const supplyIds = [...new Set(args.supplyIds)].sort()
    if (supplyIds.length === 0 || supplyIds.length > 4 || supplyIds.length !== args.supplyIds.length) fail('invalid', 'Compare between 1 and 4 distinct optional products')
    const sessions = await Promise.all((['planned', 'running', 'completed'] as const).flatMap((status) => [args.loadId, undefined].map((loadId) => ctx.db.query('sessions')
      .withIndex('by_plan_load_status', (q) => q.eq('planId', stored._id).eq('loadId', loadId).eq('status', status)).first())))
    if (sessions.some((session) => session !== null)) fail('conflict', 'This load already has a session; its recipe remains as recorded')
    const textiles = await Promise.all(ids.map(async (id) => (await authorize(ctx, action, { textileId: id })).textile))
    if (textiles.some((textile) => textile.householdId !== stored.householdId)) fail('forbidden', 'Forbidden')
    await related(ctx, stored.householdId, { supplyIds })
    if (supplyIds.some((id) => !base.productRecommendations?.some((decision) => decision.supplyId === id))) fail('invalid', 'Choose an optional washer product from this load')
    const input = await canonicalPlannerInput(ctx, stored.householdId, stored.textileIds, storedPass(stored))
    if (plan(input).inputHash !== stored.inputHash) fail('stale', 'The plan facts changed; review the current plan first')
    const care = new Map(await Promise.all(ids.map(async (id) => [id, await ctx.db.query('care').withIndex('by_textile', (q) => q.eq('textileId', id)).unique()] as const)))
    const inputIds = new Set<string>(ids)
    const subset = { ...input, textiles: input.textiles?.filter((textile) => textile.id !== undefined && inputIds.has(textile.id)),
      loadPins: input.loadPins?.filter((pin) => inputIds.has(pin.textileId)),
      ...(base.detergent?.chosenId == null ? {} : { detergentId: base.detergent.chosenId }),
      preferences: { ...input.preferences, ...(base.machineId === null ? {} : { preferredMachineId: base.machineId }) } }
    const machine = base.machineId === null ? null : await ctx.db.get(base.machineId as Id<'machines'>)
    const plannedCandidates = supplyIds.map((supplyId) => {
      const candidate = plan({ ...subset, optionalSupplyIds: [...new Set([...(input.optionalSupplyIds ?? []), supplyId])].sort() })
      const load = candidate.loads.find((load) => [...load.textileIds].sort().join() === ids.join())
      const unchangedSettings = load !== undefined && load.machineId === base.machineId && load.cycle === base.cycle && load.temperatureC === base.temperatureC
      const decision = load?.productRecommendations?.find((row) => row.supplyId === supplyId) ?? base.productRecommendations!.find((row) => row.supplyId === supplyId)!
      const compatibility = decision.compatibility === 'excluded' ? 'excluded' : unchangedSettings ? decision.compatibility : 'unknown'
      const evaluated = compatibility === decision.compatibility ? decision : productBenefit(input.supplies!.find((supply) => supply.id === supplyId)!, {
        goals: input.washGoals ?? ['ordinary'], detergent: input.supplies?.find((supply) => supply.id === base.detergent?.chosenId), compatibility })
      const benefit = { ...evaluated, supplyId, evidence: [...evaluated.evidence] }
      const eligible = unchangedSettings && load !== undefined && load.status === 'ready' && benefit.compatibility === 'allowed' && load.treatments.some((step) => step.supplyId === supplyId)
      return { supplyId, benefit, eligible, proposalHash: sha256(stableJson({ policy: proposalPolicyVersion, candidate: candidate.inputHash, settingsUnchanged: unchangedSettings })),
        load, contexts: [] as { textileId: Id<'textiles'>; context: PersonalOutcomeContext | null }[] }
    })
    // All proposal steps need their exact current supply facts, not just the queried addition.
    const usedSupplyIds = [...new Set(plannedCandidates.flatMap((candidate) => candidate.load?.treatments.map((step) => step.supplyId as Id<'supplies'>) ?? []))]
    if (usedSupplyIds.length > 128) fail('invalid', 'Compare a simpler set of product steps')
    const supplies = (await Promise.all(usedSupplyIds.map((id) => ctx.db.get(id)))).filter((row) => row !== null)
    for (const candidate of plannedCandidates) {
      candidate.contexts = textiles.map((textile) => ({ textileId: textile._id,
        context: !candidate.eligible || machine === null || candidate.load === undefined ? null : proposedOutcomeContext({ textile, care: care.get(textile._id)!, machine, load: candidate.load,
          supplies, goals: input.washGoals ?? ['ordinary'], supplyId: candidate.supplyId, dimension: args.dimension, checkedWhen: args.checkedWhen }) }))
    }
    const history = await loadPersonalHistory(ctx, stored.householdId, actor.key, ids, plannedCandidates.some((candidate) => candidate.contexts.some((row) => row.context !== null)))
    const candidates = plannedCandidates.map((candidate) => {
      const full = candidate.contexts.map(({ textileId, context }) => ({ textileId, contextKey: context === null ? null : personalContextKey(context),
        ...summarizeHistory(history, textileId, candidate.supplyId, context) }))
      const guidance = personalSuggestionGuidance(candidate.benefit, full)
      const summaries = full.map((summary) => {
        const ordered = [...summary.observations].sort((a, b) => Number(b.result === 'damage' || b.result === 'irritation') - Number(a.result === 'damage' || a.result === 'irritation')
          || a.independentWashId.localeCompare(b.independentWashId) || a.assessmentId.localeCompare(b.assessmentId))
        return { ...summary, observations: ordered.slice(0, 128), influencingObservationCount: ordered.length, influencingObservationsTruncated: ordered.length > 128 }
      })
      return { supplyId: candidate.supplyId, eligible: candidate.eligible, benefit: candidate.benefit,
        proposalHash: sha256(stableJson({ plannedRecipe: candidate.proposalHash, contexts: candidate.contexts,
          programBaseline: machine?.cycleProfile?.cycles[base.cycle] ?? null })), guidance, summaries }
    }).sort((a, b) => personalSuggestionRank(a.benefit, a.guidance) - personalSuggestionRank(b.benefit, b.guidance) || a.supplyId.localeCompare(b.supplyId))
    return { input, base, householdId: stored.householdId, principalKey: actor.key, evidenceInputHash: stored.inputHash,
      comparison: { proposalPolicyVersion, candidates, recordsConsidered: history.recordsConsidered,
      inputHash: sha256(stableJson({ policy: proposalPolicyVersion, stored: stored.inputHash, actor: actor.key, dimension: args.dimension, checkedWhen: args.checkedWhen, candidates })) } as const }
}

/** Private prospective comparisons. This query never writes a shared plan or an active recipe. */
export const forPlan = query({ args: comparisonArgs, returns: comparisonView,
  handler: async (ctx, args) => (await compareForPlan(ctx, 'plan.read', args)).comparison,
})

/** Reproducible caller-private planner input and result, separate from the shared execution plan. */
async function previewForPlan(ctx: ReadCtx, action: Action, args: import('convex/values').Infer<typeof comparisonArgs>) {
    const { input, base, comparison, householdId, principalKey, evidenceInputHash } = await compareForPlan(ctx, action, args)
    const personalSuggestions = { policyVersion: personalPlannerPolicyVersion, evidenceInputHash,
      comparisonInputHash: comparison.inputHash, loadId: base.id, textileIds: base.textileIds, machineId: base.machineId,
      cycle: base.cycle, temperatureC: base.temperatureC,
      choices: comparison.candidates.map(({ supplyId, eligible, benefit, proposalHash, summaries }) => ({ supplyId, eligible, benefit, proposalHash, summaries })) }
    return { householdId, principalKey, comparison, result: plan({ ...input, personalSuggestions }) }
}
const previewView = v.object({ comparison: comparisonView, result: v.any() })
/** Other loads and raw household inputs stay server-side, including in saved previews. */
function previewResult(result: ReturnType<typeof plan>) {
  const personalSuggestions = result.inputSnapshot.personalSuggestions!
  return { plannerVersion: result.plannerVersion, inputHash: result.inputHash,
    inputSnapshot: { personalSuggestions }, loads: result.loads.filter(load => load.id === personalSuggestions.loadId) }
}
export const plannerPreview = query({ args: comparisonArgs, returns: previewView,
  handler: async (ctx, args) => { const { comparison, result } = await previewForPlan(ctx, 'plan.read', args); return { comparison, result: previewResult(result) } },
})

/** Save only reviewed server-derived influence. The shared evidence input stays on its existing plan. */
export const savePreview = mutation({ args: { ...comparisonArgs.fields, previewInputHash: v.string(), expectedRevision: v.number() },
  returns: v.object({ guidanceId: v.id('personalPlanGuidance'), revision: v.number(), savedAt: v.number(), inputHash: v.string(), replay: v.boolean() }),
  handler: async (ctx, args) => {
    if (!Number.isSafeInteger(args.expectedRevision) || args.expectedRevision < 0) fail('invalid', 'Invalid private guidance revision')
    const { householdId, principalKey, result } = await previewForPlan(ctx, 'plan.edit', args)
    if (result.inputHash !== args.previewInputHash) fail('stale', 'Personal guidance changed; review the latest preview before saving')
    const current = await ctx.db.query('personalPlanGuidance').withIndex('by_plan_principal_load', (q) => q.eq('planId', args.planId).eq('principalKey', principalKey).eq('loadId', args.loadId)).unique()
    const personalInput = result.inputSnapshot.personalSuggestions!
    if (current?.inputHash === result.inputHash && current.plannerVersion === plannerVersion && stableJson(current.personalInput) === stableJson(personalInput)) {
      return { guidanceId: current._id, revision: current.revision, savedAt: current.savedAt, inputHash: current.inputHash, replay: true }
    }
    if (args.expectedRevision !== (current?.revision ?? 0)) fail('conflict', 'Saved personal guidance changed; review it before replacing')
    if (new TextEncoder().encode(JSON.stringify(personalInput)).byteLength > 768_000) fail('invalid', 'Compare fewer optional choices or clothing entries to save this guidance')
    const revision = (current?.revision ?? 0) + 1, savedAt = Date.now()
    const value = { householdId, principalKey, planId: args.planId, loadId: args.loadId, supplyIds: [...args.supplyIds].sort(),
      dimension: args.dimension, checkedWhen: args.checkedWhen, plannerVersion, inputHash: result.inputHash, personalInput, revision, savedAt }
    const guidanceId = current === null ? await ctx.db.insert('personalPlanGuidance', value) : current._id
    if (current !== null) await ctx.db.patch(current._id, value)
    const entries = await ctx.db.query('personalPlanGuidanceEntries').withIndex('by_guidance', (q) => q.eq('guidanceId', guidanceId)).take(17)
    if (entries.length > 16) fail('conflict', 'Private guidance references need reconciliation')
    for (const entry of entries) await ctx.db.delete(entry._id)
    for (const id of personalInput.textileIds) await ctx.db.insert('personalPlanGuidanceEntries', { guidanceId, textileId: id as Id<'textiles'> })
    return { guidanceId, revision, savedAt, inputHash: result.inputHash, replay: false }
  },
})

const savedMetadata = { guidanceId: v.id('personalPlanGuidance'), revision: v.number(), savedAt: v.number(), inputHash: v.string() }
/** Revalidate before returning saved influence; obsolete observations never appear as current guidance. */
export const savedForPlan = query({ args: { planId: v.id('plans'), loadId: v.string() },
  returns: v.union(v.null(), v.object({ ...savedMetadata, status: v.literal('current'), result: v.any() }),
    v.object({ ...savedMetadata, status: v.literal('stale'), reason: v.string() })),
  handler: async (ctx, args) => {
    const stored = await getPlan(ctx, args.planId)
    if (stored === null) return null
    const actor = (await authorize(ctx, 'plan.read', { householdId: stored.householdId })).actor
    const saved = await ctx.db.query('personalPlanGuidance').withIndex('by_plan_principal_load', (q) => q.eq('planId', args.planId).eq('principalKey', actor.key).eq('loadId', args.loadId)).unique()
    if (saved === null) return null
    const metadata = { guidanceId: saved._id, revision: saved.revision, savedAt: saved.savedAt, inputHash: saved.inputHash }
    if (saved.plannerVersion !== plannerVersion) return { ...metadata, status: 'stale' as const, reason: 'Review saved guidance with the current planner' }
    try {
      const fresh = await previewForPlan(ctx, 'plan.read', { ...args, supplyIds: saved.supplyIds, dimension: saved.dimension, checkedWhen: saved.checkedWhen })
      if (fresh.result.inputHash !== saved.inputHash || stableJson(saved.personalInput) !== stableJson(fresh.result.inputSnapshot.personalSuggestions)) {
        return { ...metadata, status: 'stale' as const, reason: 'Reports, controls or saved comparison inputs changed; review the current guidance' }
      }
      const result = plan({ ...stored.inputSnapshot as import('@washcloset/planner').PlannerInput,
        personalSuggestions: saved.personalInput as import('@washcloset/planner').PersonalPlannerInput })
      if (result.inputHash !== saved.inputHash) fail('conflict', 'The saved private input needs reconciliation')
      return { ...metadata, status: 'current' as const, result: previewResult(result) }
    } catch (error) {
      if (error instanceof ConvexError && typeof error.data === 'object' && error.data !== null && 'code' in error.data
        && ['stale', 'conflict', 'not_found'].includes(String(error.data.code))) {
        return { ...metadata, status: 'stale' as const, reason: 'The plan or private input changed, or this load already started; review a new preview' }
      }
      throw error
    }
  },
})
