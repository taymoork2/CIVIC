import { dryerContextSuggestion, sha256, stableJson, type ComparableDryerOutcome, type DryerHeat, type DryerStartingContext, type DryerProgramMode } from '@washcloset/planner'
import type { Doc, Id } from './_generated/dataModel'
import type { Infer } from 'convex/values'
import { dryerDurationSuggestion } from './dryerContextValues'
import type { ReadCtx } from './access'
import { loadPersonalHistory } from './personalOutcomeHistory'
import { recordedDryerWashRoute } from './personalOutcomeContext'

type Program = { durationMinutes: number; confidence: string; mode?: DryerProgramMode }
/** Legacy mode is unknown, even if a profile happens to be named timed. */
export function recordedDryerProgram(machine: Doc<'machines'>): Program | undefined {
  return machine.cycleProfile?.cycles.timed
}
const checked = (value: string | undefined) => value === 'observed' || value === 'verified'
const positive = (value: number | undefined): value is number => value !== undefined && Number.isFinite(value) && value > 0

/** Retrieval/start timestamps do not change the facts being compared. */
function facts(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(facts)
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([name]) => !['capturedAt', 'retrievedAt', 'usedAt', 'recordedAt', 'startedAt', 'actionId'].includes(name)).map(([name, item]) => [name, facts(item)]))
  return value
}

export async function startingDryerContext(ctx: ReadCtx, machine: Doc<'machines'>, pieces: readonly Doc<'dryingPieces'>[], heat: DryerHeat | null,
  labels: readonly { textileId: string; labelHash: string; bulkUnits: number }[], productIds: readonly Id<'supplies'>[]): Promise<DryerStartingContext> {
  const capacityUnits = machine.capacityConfidence === 'unknown' || !positive(machine.capacityUnits) ? null : machine.capacityUnits
  const capacityConfidence = machine.capacityConfidence ?? 'unknown'
  const bulkUnits = labels.reduce((sum, label) => sum + label.bulkUnits, 0)
  const extraction: DryerStartingContext['extraction'][number][] = []
  const entries: unknown[] = []
  let applicable = pieces.length > 0 && pieces.length <= 96 && labels.length === pieces.length && heat !== null && checked(machine.provenance.confidence)
    && checked(capacityConfidence) && capacityUnits !== null && bulkUnits <= capacityUnits && positive(bulkUnits) && productIds.length === 0
  for (const textileId of new Set(pieces.map((piece) => piece.textileId))) {
    const selected = pieces.filter((piece) => piece.textileId === textileId)
    for (const sessionId of new Set(selected.map((piece) => piece.washSessionId))) {
      const record = await ctx.db.query('washRecords').withIndex('by_textile_session', (q) => q.eq('textileId', textileId).eq('sessionId', sessionId)).unique()
      const activity = record?.activityContext
      const washer = activity?.washer
      const process = record === null ? undefined : washer?.washProcesses?.[record.cycle]
      const spinRpm = process?.spinRpm ?? null
      const spinMinutes = process?.spinMinutes ?? null
      const productRoute = record === null ? null : recordedDryerWashRoute(record)
      const complete = record !== null && activity?.version === 2 && activity.independentWashId === record.sessionId && activity.garment?.textileId === textileId
        && activity.garment.care?.status === 'confirmed' && !!activity.garment.care.material?.trim()
        && positive(activity.load?.bulkUnits) && positive(activity.load?.pieceCount) && positive(activity.cycleMinutesShown)
        && washer !== undefined && checked(washer.provenance.confidence) && !!process?.source.trim() && !!process.programLabel.trim()
        && spinRpm !== null && Number.isFinite(spinRpm) && spinRpm >= 0 && spinMinutes !== null && Number.isFinite(spinMinutes) && spinMinutes >= 0
        && productRoute !== null
      applicable &&= complete
      if (washer !== undefined && record !== null) extraction.push({ washerId: washer.machineId, cycle: record.cycle, source: process?.source ?? '', spinRpm, spinMinutes })
      const count = selected.filter((piece) => piece.washSessionId === sessionId).length
      entries.push({ textileId, count, label: labels.find((label) => label.textileId === textileId)?.labelHash ?? null,
        garment: facts(activity?.garment ?? null), washer: facts(washer ?? null), load: activity?.load ?? null,
        cycle: record?.cycle ?? null, temperature: record?.plannedTemperatureC ?? null, shown: activity?.cycleMinutesShown ?? null,
        productRoute, soaks: facts(record?.soaks ?? null),
        advice: facts(activity?.advice ?? null), goals: activity?.washGoals ?? null })
    }
  }
  const key = applicable ? sha256(stableJson({ version: 1, machine: facts({ id: machine._id, model: machine.model, provenance: machine.provenance,
    catalogBinding: machine.catalogBinding, capacityUnits, capacityConfidence, program: recordedDryerProgram(machine), heat }),
    bulkUnits, pieceCount: pieces.length, entries: entries.sort((a, b) => stableJson(a).localeCompare(stableJson(b))) })) : null
  return { key, pieceCount: pieces.length, bulkUnits, capacityUnits, capacityConfidence,
    extraction: [...new Map(extraction.map((item) => [stableJson(item), item])).values()] }
}

/** Only caller-private current assessments and immutable completed starts support refinement. */
export async function startingDryerSuggestion(ctx: ReadCtx, householdId: Id<'households'>, principalKey: string, machine: Doc<'machines'>,
  pieces: readonly Doc<'dryingPieces'>[], context: DryerStartingContext) {
  const ids = [...new Set(pieces.map((piece) => piece.textileId))]
  if (ids.length > 96 || ids.length === 0) return dryerContextSuggestion(recordedDryerProgram(machine), { ...context, key: null }, [],
    { enabled: true, resetAt: 0, historyTruncated: false, negativeHistoryTruncated: false, now: Date.now() })
  const history = await loadPersonalHistory(ctx, householdId, principalKey, ids, context.key !== null)
  const byRecord = new Map<string, typeof history.rows>()
  for (const row of history.rows) byRecord.set(row.record._id, [...(byRecord.get(row.record._id) ?? []), row])
  const observations: ComparableDryerOutcome[] = []
  for (const rows of byRecord.values()) {
    const record = rows[0]!.record
    const drying = record.drying
    // Old baseline-only history cannot be retroactively supplied with missing load/spin context.
    const suggestion: Infer<typeof dryerDurationSuggestion> | undefined = drying.durationSuggestion
    if (drying.outcome !== 'tumble_dried' || drying.activityContext?.start.machine?.machineId !== machine._id || suggestion?.version !== 2) continue
    const negative = rows.find((row) => ['worse', 'damage', 'irritation'].includes(row.assessment.result ?? ''))
    const overall = rows.find((row) => row.assessment.checkedWhen === 'after_drying' && row.assessment.dimension === 'overall')
    const scope = history.scopes.get(record.textileId)!
    if (!scope.enabled || record.completedAt <= Math.max(scope.resetAt, history.global.resetAt)) continue
    observations.push({ runId: drying.activityContext.runId, washIds: [record.sessionId], contextKey: suggestion.contextKey ?? null,
      minutes: drying.minutes ?? 0, completedAt: record.completedAt, result: negative?.assessment.result ?? overall?.assessment.result ?? null })
  }
  // Partial checks and missing assessments cannot make a completed subset represent the whole run.
  const runIds = [...new Set(observations.map((row) => row.runId))]
  const incompleteRuns = new Set<string>()
  for (const runId of runIds) {
    const run = await ctx.db.get(runId as Id<'dryingRuns'>)
    // Pieces taken out early (design 12.2 item 10) would bias the run's time: it stays out of learning.
    if (run === null || run.householdId !== householdId || run.status !== 'done' || run.earlyChecks?.some((check) => check.dry + check.hung > 0) === true) {
      incompleteRuns.add(runId)
      continue
    }
    const recordedEntries = [...byRecord.values()].filter((entries) => entries[0]!.record.drying.activityContext?.runId === runId)
    const representedTextiles = new Set(recordedEntries.map((entries) => entries[0]!.record.textileId))
    // Exact context key binds selected garment quantities. Every selected garment must have a slot.
    if (ids.some((id) => !representedTextiles.has(id))) incompleteRuns.add(runId)
  }
  // Consult sibling records too: an unassessed or differently configured split dryer is still
  // correlated with this wash, even though it cannot supply a comparable positive outcome.
  for (const sessionId of new Set(observations.flatMap((row) => row.washIds))) {
    const siblings = await ctx.db.query('washRecords').withIndex('by_session', (q) => q.eq('sessionId', sessionId as Id<'sessions'>)).take(97)
    if (siblings.length > 96) {
      for (const row of observations.filter((row) => row.washIds.includes(sessionId))) incompleteRuns.add(row.runId)
      continue
    }
    for (const sibling of siblings) {
      const runId = sibling.drying.activityContext?.runId
      if (runId === undefined || observations.some((row) => row.runId === runId && row.washIds.includes(sessionId))) continue
      observations.push({ runId, washIds: [sessionId], contextKey: null, minutes: 0, completedAt: sibling.completedAt, result: 'unknown' })
    }
  }
  return dryerContextSuggestion(recordedDryerProgram(machine), context, observations.map((row) => incompleteRuns.has(row.runId) && !['worse', 'damage', 'irritation'].includes(row.result ?? '') ? { ...row, result: 'unknown' } : row), {
    enabled: history.global.enabled && ids.every((id) => history.scopes.get(id)!.enabled), resetAt: history.global.resetAt,
    historyTruncated: history.historyTruncated, negativeHistoryTruncated: history.negativeHistoryTruncated, now: Date.now(),
  })
}
