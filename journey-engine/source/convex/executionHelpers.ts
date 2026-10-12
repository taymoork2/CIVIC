import { doorLocksDuringCycle, doseEquivalent, fractionOfMarkText, nativeDoseText, isDryerPhase, machineClasses, markLabels, phaseOrder, planLoadOn, resolveAtMachine, ruleEvidenceUsable, treatmentPhase, washerClasses, type AtMachine as PlannedAtMachine, type Dose as PlannerDose, type EvidenceLevel, type LoadPlan, type StepPhase, type TreatmentStep, type WasherClass } from '@washcloset/planner'
import type { Doc, Id } from './_generated/dataModel'
import { fail } from './errors'
import { machinePlacements, planResult, recordedCycle, stepDose } from './plansHelpers'
import { type AtMachine, type DryingSnapshot, type SupplyMeasure, type TaskAction, type TimelineAction, type TreatmentAction } from './validators'
import type { RecoveryContext, RecoveryPlacement } from './execution'

export type Machine = Doc<'machines'>

/** What has happened at the machines so far; each time is null until it is known. */
export type Times = {
  readonly machineStartedAt: number | null
  /** Recorded as done, or null to use the washer's recorded cycle length. */
  readonly washDoneAt: number | null
  readonly dryerStartedAt: number | null
  /** The minutes the washer showed at Start, read off the machine; they win over the recorded cycle. */
  readonly shownMinutes?: number | null
}

/** A cycle's length and how sure the household is of it, from the machine's recorded cycle profile. */
export function cycleTiming(machine: Machine | null, cycle: string, shownMinutes?: number | null): { durationMs: number; confidence: EvidenceLevel } | null {
  if (shownMinutes != null) return { durationMs: shownMinutes * 60_000, confidence: 'observed' }
  const recorded = recordedCycle(machine, cycle)
  return recorded === null ? null : { durationMs: recorded.minutes * 60_000, confidence: recorded.confidence }
}

/** Only an explicit cycle-relative instruction supplies a reminder time. Rinse timing is not guessed. */
export function recordedAdditionOffsetMinutes(timing: string | null): number | null {
  const text = timing?.trim() ?? ''
  const match = /^(?:add\s+)?(?:at\s+)?(\d+(?:\.\d+)?)\s*(?:minutes?|mins?)\s+(?:after\s+(?:starting|the\s+start\s+of)\s+(?:the\s+)?(?:wash\s+)?cycle|into\s+(?:the\s+)?(?:wash\s+)?cycle)\.?$/i.exec(text)
  if (match === null) return null
  const minutes = Number(match[1])
  return Number.isFinite(minutes) && minutes >= 0 && minutes <= 1440 ? minutes : null
}

export function findLoad(stored: Doc<'plans'>, loadId?: string): LoadPlan {
  const loads = planResult(stored).loads
  const load = loadId === undefined ? (loads.length === 1 ? loads[0] : undefined) : loads.find((entry) => entry.id === loadId)
  if (load === undefined) fail('not_found', loadId === undefined ? 'Plan must contain exactly one load' : 'Load not found')
  // Laundry day "Wash now, hang to dry" (the test `upNext` uses): the whole load hangs, so no dryer steps.
  const hung = load.textileIds.length > 0 && load.textileIds.every((id) => stored.hangTextileIds?.includes(id as Id<'textiles'>) === true)
  return hung ? { ...load, drying: null } : load
}

/** A step decided at the machine as the checklist stores it: the load facts, and each size's row that has a dose. */
function actionAtMachine(atMachine: PlannedAtMachine): AtMachine {
  const { context } = atMachine
  return {
    machine: atMachine.machine,
    context: { ...context, machineClasses: [...context.machineClasses], cycles: [...context.cycles], materials: [...context.materials] },
    // Readonly planner arrays; the stored copy carries the same values, calculatedDose included.
    candidates: atMachine.candidates.map((candidate) => ({
      ...candidate,
      dose: { ...candidate.dose, ...(candidate.dose.marks === undefined ? {} : { marks: [...candidate.dose.marks] }) },
    }) as AtMachine['candidates'][number]),
  }
}

/**
 * What a product step carries beyond its dose: why this label row was chosen, whether it comes back
 * out, and, when its dose waits for how full the drum or dryer is, what to choose it with.
 */
function treatmentNotes(step: TreatmentStep): Pick<TreatmentAction, 'basis' | 'reusable' | 'atMachine' | 'soak' | 'productRequirement' | 'productConfirmation'> {
  return {
    ...(step.productRequirement === undefined ? {} : { productRequirement: { ...step.productRequirement, sourceLoadCategories: [...step.productRequirement.sourceLoadCategories] } }),
    ...(step.productConfirmation === undefined ? {} : { productConfirmation: { ...step.productConfirmation } }),
    ...(typeof step.basis === 'string' ? { basis: step.basis } : {}),
    ...(step.reusable === true ? { reusable: true } : {}),
    ...(step.atMachine === undefined ? {} : { atMachine: actionAtMachine(step.atMachine) }),
    ...(step.soak === undefined ? {} : { soak: step.soak }),
  }
}

type DryingTask = Extract<TaskAction['task'], 'hold_out' | 'dryer_load' | 'dryer_fullness' | 'dryer_start' | 'dryer_unload'>

/**
 * The drying steps, appended after the wash. A plan that can vouch for the dryer names what stays
 * out, what goes in, its products, the heat in the dryer's own words, and collecting it. Anything
 * less hangs the whole load. Plans from before drying, and households without a dryer, add nothing.
 */
function dryingActions(load: LoadPlan, dryMinutes: number | null, washFinish: number | null, dryerStartedAt: number | null): Array<Omit<TreatmentAction, 'order'> | Omit<TaskAction, 'order'>> {
  const drying = load.drying
  if (drying === null || drying === undefined) return []
  const afterWash = washFinish === null ? {} : { dueAt: washFinish }
  const task = (name: DryingTask, title: string, detail: string | null, extra: Pick<TaskAction, 'dueAt' | 'garments'> = {}): Omit<TaskAction, 'order'> => ({
    id: `${load.id}:task:${name}`, kind: 'task', task: name, phase: name, title, detail, status: 'pending', ...extra,
  })
  const methods = new Map<string, string>(drying.heldOut.map((held) => [held.textileId, held.method]))
  const garment = (textileId: string) => ({ textileId: textileId as Id<'textiles'>, ...(methods.has(textileId) ? { method: methods.get(textileId)! } : {}) })
  if (drying.status !== 'ready') return [task('hold_out', 'Take it out and hang it', null, { ...afterWash, garments: load.textileIds.map(garment) })]

  const tumbling = drying.tumbleTextileIds.length
  const heldOut = drying.heldOut.length
  return [
    ...(heldOut === 0 ? [] : [task('hold_out', `Keep ${heldOut} out`, null, { ...afterWash, garments: drying.heldOut.map((held) => garment(held.textileId)) })]),
    task('dryer_load', `Into the dryer · ${tumbling} ${tumbling === 1 ? 'garment' : 'garments'}`, null, { ...afterWash, garments: drying.tumbleTextileIds.map(garment) }),
    // A dryer product whose label goes by how full the dryer is waits for the person to look.
    ...(drying.treatments.some((step) => step.atMachine !== undefined) ? [task('dryer_fullness', 'How full is the dryer?', null)] : []),
    ...drying.treatments.map((step, index): Omit<TreatmentAction, 'order'> => ({
      id: `${load.id}:dryer:treatment:${index}`,
      kind: 'treatment',
      phase: 'dryer_with_load',
      supplyId: step.supplyId,
      stage: step.stage,
      placement: step.placement,
      dose: stepDose(step),
      ...treatmentNotes(step),
      timing: step.timing,
      confidence: 'verified',
      status: 'pending',
      machineTelemetry: false,
      offsetMinutes: null,
    })),
    task('dryer_start', 'Start the dryer', [drying.heatLabel, dryMinutes === null ? null : `${dryMinutes} min`].filter((part) => part !== null).join(' · ') || null),
    task('dryer_unload', 'Collect from the dryer', drying.treatments.some((step) => step.reusable === true) ? 'Take the dryer balls back out too.' : null,
      dryerStartedAt === null || dryMinutes === null ? {} : { dueAt: dryerStartedAt + dryMinutes * 60_000 }),
  ]
}

/**
 * The load's steps in the order they happen at the machine: products that go in the empty drum,
 * loading the garments, anything that goes in with them, closing the door, filling the dispenser
 * (a front-loader's drawer), starting the machine, and only then any mid-cycle additions (possible
 * only when the machine can be opened mid-cycle), then drying. Mid-cycle steps get due times once
 * the machine starts; drying steps are due when the wash is.
 */
export function timelineActions(load: LoadPlan, machine: Machine | null, dryMinutes: number | null, times: Times): TimelineAction[] {
  const timing = cycleTiming(machine, load.cycle, times.shownMinutes)
  const duration = timing?.durationMs ?? null
  const locked = doorLocksDuringCycle(machine)
  const machineStartedAt = times.machineStartedAt

  const treatments = load.treatments.map((step, index): Omit<TreatmentAction, 'order'> => {
    const phase: StepPhase = step.textileId === undefined ? treatmentPhase(step, machine) : 'drum'
    const recordedMinutes = phase === 'cycle' ? recordedAdditionOffsetMinutes(step.timing) : null
    const offset = recordedMinutes === null ? null : recordedMinutes * 60_000
    const target = offset === null || machineStartedAt === null ? null : machineStartedAt + offset
    return {
      id: `${load.id}:treatment:${index}`,
      kind: 'treatment',
      phase,
      supplyId: step.supplyId,
      ...(step.textileId === undefined ? {} : { textileId: step.textileId, temperatureC: step.temperatureC }),
      stage: step.stage,
      placement: step.placement,
      dose: stepDose(step),
      ...treatmentNotes(step),
      timing: step.timing,
      confidence: phase !== 'cycle' || target !== null ? 'verified' : 'unknown',
      ...(target === null ? {} : { dueAt: target }),
      status: 'pending',
      machineTelemetry: false,
      offsetMinutes: offset === null ? null : offset / 60_000,
    }
  })
  const task = (name: Exclude<TaskAction['task'], 'care_preparation' | 'garment_advice'>, title: string, detail: string | null, extra: Pick<TaskAction, 'garments'> = {}): Omit<TaskAction, 'order'> => ({
    id: `${load.id}:task:${name}`, kind: 'task', task: name, phase: name, title, detail, status: 'pending', ...extra,
  })
  const garments = load.textileIds.length
  const tasks = [
    // Loading names every garment going in; no order is recorded for them, so none is invented.
    task('load', `Load the ${garments === 1 ? 'garment' : `${garments} garments`}`, null, { garments: load.textileIds.map((textileId) => ({ textileId: textileId as Id<'textiles'> })) }),
    // A product whose label goes by how full the drum is waits for the person to look, after loading.
    ...(load.treatments.some((step) => step.atMachine !== undefined) ? [task('drum_fullness', 'How full is the drum?', null)] : []),
    task('close', locked ? 'Close the door' : 'Close the lid', locked ? 'It stays locked until the cycle ends.' : null),
    task('start', 'Start the machine', `${load.cycle.replaceAll('_', ' ')} cycle${load.temperatureC === null ? '' : `, ${load.temperatureC} °C`}`),
  ]
  const washFinish = times.washDoneAt ?? (machineStartedAt === null || duration === null ? null : machineStartedAt + duration)
  const preparation: Omit<TaskAction, 'order'>[] = (load.labelPreparation ?? []).map((instruction, index) => ({
    id: `${load.id}:label-preparation:${index}`, kind: 'task', task: 'care_preparation', phase: 'drum',
    title: 'Follow the label before washing', detail: instruction.wording, status: 'pending',
    garments: instruction.textileIds.map((textileId) => ({ textileId: textileId as Id<'textiles'> })),
  }))
  // Several tips can share a scope (a stained and a clean piece); the first keeps the old id so recorded steps survive.
  const seenScopes = new Map<string, number>()
  const advice: Omit<TaskAction, 'order'>[] = (load.garmentAdvice ?? []).map((tip) => ({
    id: adviceId(load.id, tip.scope, seenScopes), kind: 'task', task: 'garment_advice', phase: 'drum',
    title: tip.action, detail: tip.reason, status: 'pending',
    advice: { tipId: tip.tipId, scope: tip.scope, reason: tip.reason, source: tip.source, policyVersion: tip.policyVersion },
    garments: tip.textileIds.map((textileId) => ({ textileId: textileId as Id<'textiles'> })),
  }))
  return [...preparation, ...advice, ...treatments, ...tasks, ...dryingActions(load, dryMinutes, washFinish, times.dryerStartedAt)]
    .sort((left, right) => phaseOrder.indexOf(left.phase) - phaseOrder.indexOf(right.phase))
    .map((action, order) => ({ ...action, order }) as TimelineAction)
}

function adviceId(loadId: string, scope: string, seen: Map<string, number>): string {
  const count = seen.get(scope) ?? 0
  seen.set(scope, count + 1)
  return `${loadId}:garment-advice:${scope}${count === 0 ? '' : `:${count}`}`
}

/**
 * Keeps recorded steps when the timeline is rebuilt (for example after the machine starts), and the
 * dose a step decided at the machine was given, which the plan does not know.
 */
export function mergeRecorded(next: TimelineAction[], previous: readonly TimelineAction[]): TimelineAction[] {
  const recorded = new Map(previous.map((action) => [action.id, action]))
  return next.map((action) => {
    const before = recorded.get(action.id)
    const decided = before?.kind === 'treatment' && action.kind === 'treatment' ? { ...(before.atMachine === undefined ? {} : { dose: before.dose, atMachine: before.atMachine }), ...(before.soakStarted === undefined ? {} : { dose: before.dose, soak: before.soak, soakStarted: before.soakStarted }) } : {}
    return before === undefined || before.status === 'pending'
      ? { ...action, ...decided } as TimelineAction
      : { ...action, ...decided, ...(before.kind === 'treatment' && action.kind === 'treatment' ? { dose: before.dose } : {}), status: before.status, recordedAt: before.recordedAt, recordedBy: before.recordedBy } as TimelineAction
  })
}

export function reminderDueAt(action: TimelineAction): number | undefined {
  if (action.dueAt !== undefined) return action.dueAt
  if (action.kind !== 'treatment' || action.windowStartAt === undefined || action.windowEndAt === undefined) return undefined
  return action.windowStartAt + (action.windowEndAt - action.windowStartAt) / 2
}

export function recordedTimes(session: Doc<'sessions'>): Times {
  return { machineStartedAt: session.machineStartedAt ?? null, washDoneAt: session.washFinishedAt ?? null, dryerStartedAt: session.dryerStartedAt ?? null, shownMinutes: session.cycleMinutesShown ?? null }
}

/** Why a home dryer can't take another load yet: one of the household's own loads is still in it. */
export const dryerBusyReason = (name: string) => `${name} still has a load in it. Take it out first`

/** The drying plan the session starts with, kept on the timeline so the record outlives the plan. */
export function dryingSnapshot(load: LoadPlan, dryer: Machine | null): DryingSnapshot | null {
  const drying = load.drying
  if (drying === null || drying === undefined) return null
  const minutes = recordedCycle(dryer, 'timed')
  return {
    status: drying.status,
    ...(dryer === null ? {} : { dryerId: dryer._id }),
    ...(drying.heat === null ? {} : { heat: drying.heat }),
    ...(drying.heatLabel === null ? {} : { heatLabel: drying.heatLabel }),
    ...(minutes === null ? {} : { minutes: minutes.minutes }),
    minutesConfidence: minutes?.confidence ?? 'unknown',
    tumbleTextileIds: drying.tumbleTextileIds.map((id) => id as Id<'textiles'>),
    heldOut: drying.heldOut.map((held) => ({ textileId: held.textileId as Id<'textiles'>, method: held.method, reason: held.reason })),
    fit: drying.fit,
  }
}

/** How far a phone's clock is trusted from the server's: a tap queued offline keeps the time it was made. */
const clientClockWindowMs = 12 * 60 * 60_000

/**
 * When something happened by the phone that recorded it. A mutation queued while the phone had no
 * signal reaches the server late, so the phone's own time is kept, held within 12 hours of the
 * server's clock so a wrong clock cannot put a load days away. Without it, the server's time.
 */
export function clientTime(at: number | undefined, now: number): number {
  if (at === undefined) return now
  if (!Number.isFinite(at)) fail('invalid', 'at must be finite')
  return Math.min(now + clientClockWindowMs, Math.max(now - clientClockWindowMs, at))
}

/** A label row's dose as the checklist shows it: every mark on the cap and the printed volume, when there are any. */
export function machineDose(dose: PlannerDose, measure: SupplyMeasure | undefined): TreatmentAction['dose'] {
  const marks = (dose.unit === 'cap' || dose.unit === 'scoop') && typeof dose.mark === 'string' ? markLabels(measure) : []
  const equivalent = doseEquivalent(dose, measure)
  return {
    amount: dose.amount,
    unit: dose.unit,
    ...(typeof dose.mark === 'string' ? { mark: dose.mark } : {}),
    ...(dose.fractionOfMark === undefined ? {} : { fractionOfMark: dose.fractionOfMark }),
    ...(dose.target === undefined ? {} : { target: dose.target }),
    ...(dose.approximate === undefined ? {} : { approximate: dose.approximate }),
    ...(typeof dose.measurementCue === 'string' ? { measurementCue: dose.measurementCue } : {}),
    ...(marks.length === 0 ? {} : { marks }),
    ...(equivalent === null ? {} : { equivalent }),
  }
}

/** The washer's HE status a dose was planned with, when it was on record. */
export function plannedWasherClass(atMachine: AtMachine): WasherClass | undefined {
  if (!atMachine.context.washerClassKnown) return undefined
  return atMachine.context.machineClasses.find((entry): entry is WasherClass => (washerClasses as readonly string[]).includes(entry))
}

/** When the dryer is done: from its start once it runs, or estimated from the wash finish before that. */
/**
 * The washer's name for a session's lists: its kind alone when the person skipped its number, so
 * no numbered washer is shown as theirs.
 */
export function sessionWasherName(session: Doc<'sessions'>, washer: Machine | null): string | null {
  if (session.washerNumberUnknown !== true) return washer?.name ?? null
  if (washer?.applianceType === 'top_load_washer') return 'a top-loader'
  if (washer?.applianceType === 'front_load_washer') return 'a front-loader'
  return 'a washer'
}

export function dryReady(drying: DryingSnapshot | undefined, session: Doc<'sessions'>, washFinishAt: number | null): { readyAt: number | null; estimated: boolean } {
  if (drying?.status !== 'ready' || drying.minutes === undefined) return { readyAt: null, estimated: session.dryerStartedAt === undefined }
  const minutes = drying.minutes * 60_000
  if (session.dryerStartedAt !== undefined) return { readyAt: session.dryerStartedAt + minutes, estimated: false }
  const washReady = session.washFinishedAt ?? washFinishAt
  return { readyAt: washReady === null ? null : washReady + minutes, estimated: true }
}

/** A running dryer step: the plan dries in the dryer and nobody has skipped it. */
export function dryerRuns(actions: readonly TimelineAction[]): boolean {
  return actions.some((action) => action.phase === 'dryer_start' && action.status !== 'skipped')
}

/** A recorded compartment can change after planning; never keep presenting it as usable. */
export function unsupportedPreparationActions(actions: readonly TimelineAction[], machine: Machine | null): TreatmentAction[] {
  if (machine === null) return []
  const placements = machinePlacements(machine.dispensingProfile)
  const machineSlots = ['detergent_compartment', 'softener_compartment', 'bleach_compartment', 'downy_ball', 'center_agitator', 'direct_to_drum']
  return actions.filter((action): action is TreatmentAction => action.kind === 'treatment'
    && action.status === 'pending' && !isDryerPhase(action.phase)
    && machineSlots.includes(action.placement) && !placements.includes(action.placement))
}

/** A step as the move preview words it: where it goes and how much, or the task's own title. */
export function stepWords(action: TimelineAction): string {
  if (action.kind === 'task') return action.title
  const fraction = action.dose.fractionOfMark === undefined || action.dose.fractionOfMark === 1 ? '' : `${fractionOfMarkText(action.dose.fractionOfMark)} of `
  const dose = nativeDoseText(action.dose) ?? (action.dose.unit === 'at_machine' ? 'amount chosen at the drum' : `${action.dose.amount} ${action.dose.mark === undefined ? action.dose.unit : `× ${fraction}${action.dose.mark} mark`}`)
  return `${action.placement.replaceAll('_', ' ')} · ${dose}`
}

/** A pretreatment already done on the garments themselves: it stays done on any washer. */
export function pretreated(old: readonly TimelineAction[], action: TimelineAction): TimelineAction | null {
  if (action.kind !== 'treatment' || action.textileId === undefined) return null
  const done = old.find((entry) => entry.kind === 'treatment' && (entry.status !== 'pending' || entry.soakStarted !== undefined) && entry.supplyId === action.supplyId && entry.textileId === action.textileId)
  return done === undefined ? null : { ...done, id: action.id, order: action.order }
}

/** The drawer's slots: what "Recalculate without the drawer" takes away. The drum and the agitator stay. */
const drawerSlots: readonly string[] = ['detergent_compartment', 'softener_compartment', 'bleach_compartment']

/** The washer as recorded, but with no drawer: its other placements and facts stay as recorded. */
export function withoutDrawerProfile(profile: Machine['dispensingProfile']) {
  const { compartments: _compartments, ...rest } = profile
  return { ...rest, placements: machinePlacements(profile).filter((placement) => !drawerSlots.includes(placement)) }
}

/** Steps as they stand against the earlier ones: a product step is the same step when its supply, stage, garment and placement are. */
function sameStepKey(action: TimelineAction): string {
  return action.kind === 'treatment' ? [action.supplyId, action.stage, action.placement, action.textileId ?? ''].join('|') : action.id
}

/** Fresh steps keep the status (and a dose chosen at the machine) of the earlier step they repeat; every other step restarts. */
export function keepUnchanged(old: readonly TimelineAction[], fresh: readonly TimelineAction[]): TimelineAction[] {
  const earlier = new Map<string, TimelineAction[]>()
  for (const action of old) earlier.set(sameStepKey(action), [...(earlier.get(sameStepKey(action)) ?? []), action])
  return fresh.map((action) => {
    const before = earlier.get(sameStepKey(action))?.shift()
    if (before === undefined) return action
    const decided = before.kind === 'treatment' && action.kind === 'treatment' ? { ...(before.atMachine === undefined ? {} : { dose: before.dose, atMachine: before.atMachine }), ...(before.soakStarted === undefined ? {} : { dose: before.dose, soak: before.soak, soakStarted: before.soakStarted }) } : {}
    return before.status === 'pending'
      ? { ...action, ...decided } as TimelineAction
      : { ...action, ...decided, ...(before.kind === 'treatment' && action.kind === 'treatment' ? { dose: before.dose } : {}), status: before.status, recordedAt: before.recordedAt, recordedBy: before.recordedBy } as TimelineAction
  })
}

/** The planner checks the alternative's dose and compatibility; the label must explicitly record its placement and timing. */
export function recoveredPreparationLoad(context: RecoveryContext, session: Doc<'sessions'>, placement: RecoveryPlacement): { load: LoadPlan; timing: string } {
  const { washer, current, input, action, treatmentIndex } = context
  if (!machinePlacements(washer.dispensingProfile).includes(placement)) fail('conflict', placement === 'downy_ball' ? 'No dispensing ball is recorded for this washer.' : 'Adding this product by hand is not recorded for this washer.')
  const supply = input.supplies?.find((entry) => entry.id === action.supplyId)
  const rules = supply?.applicationRules?.filter((rule) => rule.stage === action.stage && rule.placement === placement && typeof rule.timing === 'string' && rule.timing.trim().length > 0 && ruleEvidenceUsable(rule)) ?? []
  if (rules.length === 0) fail('conflict', placement === 'downy_ball' ? 'The recorded product directions do not allow a dispensing ball.' : 'The recorded product directions do not say when to add it by hand.')
  const treatments = context.actionTimeline.filter((entry): entry is TreatmentAction => entry.kind === 'treatment')
  const leftOut = new Set(treatments.filter((entry) => entry.status === 'skipped' && treatments.filter((other) => other.supplyId === entry.supplyId).every((other) => other.status === 'skipped')).map((entry) => entry.supplyId))
  const planned = planLoadOn({ ...input, excludedSupplyIds: [...new Set([...(input.excludedSupplyIds ?? []), ...leftOut])], supplies: input.supplies?.map((entry) => entry.id === action.supplyId ? { ...entry, applicationRules: rules } : entry) }, current, washer._id)
  if (planned.status !== 'ready') fail('conflict', 'This alternative does not fit the recorded product, garment and washer instructions.')
  const replacements = planned.load.treatments.filter((step) => step.supplyId === action.supplyId && step.stage === action.stage && step.textileId === action.textileId)
  if (replacements.length !== 1) fail('conflict', 'This alternative has no single recorded dose for this load.')
  let replacement = replacements[0]!
  if (replacement.placement !== placement || !rules.some((rule) => rule.timing === replacement.timing)) fail('conflict', 'This placement and timing are not stated in the recorded directions.')
  if (replacement.atMachine === undefined && !rules.some((rule) => rule.id === replacement.ruleId)) fail('conflict', 'A recorded label row is required for this alternative.')
  const phase = treatmentPhase(replacement, washer)
  if (placement === 'direct_to_drum' && phase === 'cycle' && doorLocksDuringCycle(washer)) fail('conflict', 'This washer cannot be opened during the cycle.')
  // Recovery cannot insert an earlier physical action while silently keeping a later one done.
  // The alternative remains available until loading/closing; otherwise leave it out or review the load.
  const recordedTask = (task: TaskAction['task']) => context.actionTimeline.some((entry) => entry.kind === 'task' && entry.task === task && entry.status === 'confirmed')
  if (phase === 'drum' && recordedTask('load')) fail('conflict', 'The clothes are already loaded. These directions require an empty drum; leave this product out or review the load.')
  if ((phase === 'drum' || phase === 'with_load') && recordedTask('close')) fail('conflict', 'The door or lid is already recorded closed. These directions require an earlier step; leave this product out or review the load.')
  // A live re-plan must not silently change other accepted products while recovering this one.
  // Stored documents and a fresh planner result can order dose properties differently.
  // Compare every instruction value, without treating object key order as a label change.
  const instructionKey = (step: TreatmentStep) => JSON.stringify([step.supplyId, step.stage, step.placement, step.textileId ?? null, step.timing, step.atMachine === undefined ? step.ruleId ?? null : null, step.atMachine?.candidates.map((row) => [row.ruleId, row.size, row.dose]) ?? step.dose], (_key, value: unknown) => value !== null && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))) : value)
  const before = current.treatments.filter((step, index) => index !== treatmentIndex && !leftOut.has(step.supplyId)).map(instructionKey).sort()
  const after = planned.load.treatments.filter((step) => step !== replacements[0]).map(instructionKey).sort()
  if (JSON.stringify(before) !== JSON.stringify(after)) fail('conflict', 'Other product instructions have changed. Review the recipe before recovering this placement.')
  if (replacement.atMachine !== undefined && session.drumFullness !== undefined) {
    const selection = resolveAtMachine(replacement.atMachine, rules, supply?.measurement, session.drumFullness)
    if (selection.kind !== 'selected' || selection.rule.placement !== placement || selection.rule.timing !== replacement.timing) fail('conflict', 'No single recorded dose fits the drum fullness already confirmed.')
    const marks = markLabels(supply?.measurement)
    replacement = { ...replacement, dose: selection.dose, ruleId: selection.rule.id, basis: selection.basis, measurementCue: selection.dose.measurementCue ?? replacement.measurementCue, marks, equivalent: doseEquivalent(selection.dose, supply?.measurement), atMachine: { ...replacement.atMachine, resolvedSize: session.drumFullness, ...(typeof selection.rule.rowText === 'string' ? { lineText: selection.rule.rowText } : {}) } }
  }
  return { load: { ...current, treatments: current.treatments.map((step, index) => index === treatmentIndex ? replacement : step) }, timing: replacement.timing! }
}
