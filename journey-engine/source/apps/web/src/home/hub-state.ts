import { nextStart, sharedStarts } from '@washcloset/planner'

import { countWord, homeText, hubText } from '@/copy'
import { dryerRuns as planDryerRuns, washOrder } from '@/laundry/laundry-pass'
import { dryerWaitText, midCheckText, nextStepText } from '@/copy-drying'
import { washerName } from '@/laundry/machine-name'
import { loadNextAction, sessionStage, type SessionStage, type StageFacts } from '@/laundry/session-stage'
import { clockTime } from '@/kit/ui'
import { doseParts } from '@/kit/units'
import { remainingDay } from '@/laundry/day-plan'

/**
 * Laundry day, read from the server so it survives a closed tab: the loads running now
 * (`execution.householdSessions`), the plan with loads still to start (`plans.upNext`), the
 * hamper and anything hanging to dry. One state names the next step; the hub's action block and
 * the dock above the tabs both say it.
 */

export type DaySession = StageFacts & {
  readonly sessionId: string
  readonly machineName: string | null
  readonly dryerName: string | null
  readonly textileIds?: readonly string[]
}

export type DayPlan = {
  readonly planId: string
  readonly loads: readonly { readonly loadId?: string; readonly sessionId: string | null; readonly startable: boolean; readonly textileIds?: readonly string[]; readonly washMinutes?: number | null; readonly washLearned?: { readonly minutes: number; readonly count: number } | null; readonly dryer?: { readonly minutes: number | null; readonly tumbleCount: number; readonly fit: string } | null; readonly blockers?: readonly LoadBlocker[]; readonly treatments?: readonly { readonly supplyName: string | null; readonly dose: { readonly amount?: number; readonly unit?: string; readonly mark?: string | null; readonly fractionOfMark?: number; readonly target?: 'below' | 'just_below'; readonly approximate?: boolean } }[] }[]
}

export type LoadBlocker = { readonly source: 'garment' | 'product' | 'washer'; readonly name: string | null; readonly code: string; readonly details: Readonly<Record<string, unknown>> }

export type RunningRow = {
  readonly sessionId: string
  /** The machine the load is in now: the dryer once it started, else the washer. */
  readonly machine: string
  readonly stage: SessionStage
  /** When this stage is over, when the machine's recorded times say; never guessed. */
  readonly doneAt: number | null
  readonly name?: string
  readonly startedAt?: number | null
  readonly hasDrying?: boolean
  readonly dryMinutes?: number | null
  readonly heat?: string | null
  readonly price?: string | null
}

/** One load of the open plan that has not started: enough for the Laundry tab to list it and open it. */
export type PlannedLoad = { readonly loadId: string; readonly number: number; readonly textileIds: readonly string[]; readonly startable: boolean; /** Dryer runs it needs: 0 for an air-dry load. */ readonly dryerRuns: number
  /** Its wash and dryer minutes with their sources, when known (design 10). */
  readonly wash?: WashTime | null
  readonly dry?: DryTime | null
  readonly urgent?: boolean
}

/** A wash time for its purpose (design 10): `minutes` to show, `short` to hold a wash back, `long` to fit the day. */
export type WashTime = { readonly minutes: number; readonly short: number; readonly long: number; readonly source: 'recorded' | 'learned'; readonly count?: number }
/** A dryer time: `long` adds 10 minutes, because sensor-dry and heavy loads run past the timed figure. */
export type DryTime = { readonly minutes: number; readonly long: number; readonly source: 'recorded' }

/**
 * The wash time from the washer's program and the household's own taps: the learned median replaces
 * the program only when they differ by more than 10 minutes (design 10). Without either, no time:
 * the app never fills one in from a guess.
 */
export function washTime(load: Pick<PlanLoad, 'washMinutes' | 'washLearned'>): WashTime | null {
  const base = load.washMinutes ?? null
  const learned = load.washLearned ?? null
  if (base === null) return learned === null ? null : { minutes: learned.minutes, short: learned.minutes, long: learned.minutes, source: 'learned', count: learned.count }
  if (learned === null) return { minutes: base, short: base, long: base, source: 'recorded' }
  const replaced = Math.abs(learned.minutes - base) > 10
  return { minutes: replaced ? learned.minutes : base, short: Math.min(base, learned.minutes), long: Math.max(base, learned.minutes), ...(replaced ? { source: 'learned', count: learned.count } : { source: 'recorded' }) }
}

/** The dryer time the machine's program records; null for an air-dry load or when none is recorded. */
export function dryTime(load: Pick<PlanLoad, 'dryer'>): DryTime | null {
  const recorded = load.dryer?.minutes ?? null
  return recorded === null ? null : { minutes: recorded, long: longDry(recorded), source: 'recorded' }
}

/** Sensor-dry and heavy loads run past the timed figure: the dryer minutes the day is fitted with. */
export const longDry = (minutes: number): number => minutes + 10

export type NextLoad = { readonly planId: string; readonly number: number; readonly count: number; readonly ready: boolean; readonly blocker?: LoadBlocker; readonly name?: string; readonly things?: number; readonly dose?: string; /** Every load still to start, in wash order (`washOrder`); absent when the plan does not say which garments each holds. */ readonly loads?: readonly PlannedLoad[]
  readonly dayDeferred?: true
  readonly loadId?: string
  /** Wash minutes: the washer's recorded program time, else the household's own estimate. */
  readonly washMinutes?: number | null
  readonly washSource?: WashTime['source']
  /** The short wash time, to hold a wash back (design 5.3), and how many washes a learned time is from. */
  readonly washShort?: number
  readonly washCount?: number
  /** Dryer runs this load needs: 0 when nothing in it tumbles. */
  readonly dryerRuns?: number
  /** Every load still to start has wash minutes, and dryer minutes when it tumbles: only then a clock (invariant 11). */
  readonly timed?: boolean
  /** Some wash of this plan is done or past the washer: a shared room's start-of-pass counts are spent. */
  readonly spent?: boolean
}

/**
 * The next wash at home, timed against the dryer (design 9.1). `at` null: start it now, on the same
 * trip, and it may wait `wait` minutes for the dryer. Otherwise it is held back to start at about `at`
 * so it ends when the dryer does. Only for a home with one dryer, and only when minutes are known.
 */
export type NextStep = {
  readonly number: number
  readonly name?: string
  readonly planId: string
  readonly loadId: string | null
  readonly washMinutes: number
  readonly washSource: WashTime['source']
  readonly washCount?: number
  readonly wait: number
  readonly at: number | null
  /** Started now anyway, about how long it would wait for the dryer: the person's choice, shown (invariant 8). */
  readonly waitNow: number
  /** The busy dryer whose end this is timed from, for "Dryer says"; null when the dryer starts now. */
  readonly dryerKey: string | null
  readonly dryerEnd: number
  /** Where `dryerEnd` comes from: a queue run's timer, a wash's own dryer step, or the person's "Dryer says". */
  readonly dryerSource?: DryerTimeSource
}

/** A drying-queue run as `dryingQueue.queue` lists it. */
export type QueueRun = {
  readonly runId: string
  readonly kind: 'dryer' | 'air'
  readonly dryerId: string | null
  readonly dryerName: string | null
  readonly method: string | null
  readonly startedAt: number
  readonly minutes: number | null
  readonly reminded?: boolean
  /** The mid-run check still to do (design 8.4), with the pieces it names. */
  readonly check?: { readonly at: number; readonly missed: boolean; readonly names: string }
}

/** The drying queue as the hub needs it: runs, washed pieces still wet, and the one home dryer if there is one. */
export type DryingFacts = {
  readonly runs: readonly QueueRun[]
  /** Washed pieces waiting in the queue, how many of them go in a dryer, and the earliest time one came out of a washer. */
  readonly wet: { readonly count: number; readonly tumble: number; readonly since: number | null }
  /** Set only for a home with one dryer and no shared ones: the app tracks every load in it. */
  readonly homeDryerId: string | null
  /** A running wash whose own dryer step still holds the home dryer, for pages that have no session rows. */
  readonly homeDryerSession?: { readonly sessionId: string; readonly name: string } | null
  /** Loads the rack or line holds, as the household said; absent: our default (`rackLoads`). */
  readonly rackLoads?: number
}

export type DryerTimeSource = 'entered' | 'wash' | 'says'

export type DryerTarget = { readonly to: 'session'; readonly sessionId: string } | { readonly to: 'drying' }

/**
 * The household's own dryer, from the loads the app tracked in it. Only ever known at home; in a
 * shared room the app can't see other people's loads, so it never calls a dryer free.
 */
export type DryerNow =
  | { readonly kind: 'free' }
  /** `source`: where `until` came from, for its trial note: minutes entered at the dryer, the wash's own dryer time, or "Dryer says". */
  | { readonly kind: 'busy'; readonly name: string; readonly until: number | null; readonly source?: DryerTimeSource; readonly runId: string | null; readonly reminded: boolean; readonly target: DryerTarget }
  | { readonly kind: 'done'; readonly name: string; readonly target: DryerTarget }

/** What a waiting wet load can do: hang (the rack has room), wait, and whether it sat wet long enough to smell. */
export type WetWait = { readonly dryer: DryerNow | null; readonly rackFull: boolean; readonly smell: boolean; readonly next: number | null }

export type HubState =
  | { readonly kind: 'empty' }
  | { readonly kind: 'hamper'; readonly count: number; readonly loads: number | null }
  /** `askFree`: the first start of a shared-room pass, which goes through "What's free right now?" on the Laundry tab. */
  | ({ readonly kind: 'pass'; readonly step?: NextStep; readonly askFree?: true } & NextLoad)
  | { readonly kind: 'running'; readonly rows: readonly RunningRow[]; readonly next: NextLoad | null; readonly step?: NextStep }
  | { readonly kind: 'finished'; readonly row: RunningRow; readonly toDryer: boolean; readonly rows: readonly RunningRow[]; readonly wait?: WetWait; readonly step?: NextStep; readonly next?: NextLoad | null }
  /** Washed pieces moved to the drying queue and still wet. `next` stays for a shared room, where another washer may start. */
  | { readonly kind: 'wet'; readonly count: number; readonly tumble: number; readonly wait: WetWait; readonly next: NextLoad | null; readonly rows: readonly RunningRow[]; readonly hamper?: number }
  /** A drying-queue dryer run whose time is up: check what is dry. `early`: its mid-run check is due, naming these pieces. */
  | { readonly kind: 'dryer_check'; readonly runId: string; readonly name: string; readonly doneAt: number; readonly rows: readonly RunningRow[]; readonly early?: string }
  | { readonly kind: 'drying'; readonly count: number; readonly sessionIds: readonly string[]; readonly runId?: string }

export type HubInputs = {
  readonly hamper: { readonly count: number; readonly loads: number | null }
  readonly plan: DayPlan | null | undefined
  readonly sessions: readonly DaySession[] | undefined
  readonly textileNames?: ReadonlyMap<string, string>
  /** Garments hanging to dry, and the finished loads they came out of (those All dry can clear). */
  readonly hanging: { readonly count: number; readonly sessionIds: readonly string[] }
  /** The drying queue; absent where it was not read (the hub then knows only session loads). */
  readonly drying?: DryingFacts
  /** Garments that cannot wait (`urgentFlag`): their loads go first. */
  readonly urgentIds?: ReadonlySet<string>
  /** What the person typed from the dryer's display: its run ends at `end` (design 5.3). Phone only. */
  readonly dryerSays?: { readonly key: string; readonly end: number } | null
  /** This phone's start-of-pass answers and the shared room's washer count (design 11). */
  readonly sharedStart?: { readonly entry: SharedStart | null; readonly washers: number }
  readonly dayUntil?: number
}

/** The longest planned wait for the dryer before the next wash is held back (owner decision 11). Our own choice. */
export const waitLimit = 30
/** Minutes to move a load and start the next machine; not counted as waiting. */
export const moveMinutes = 5

const urgentReasons = new Set(['wet', 'sweat', 'smell', 'baby_mess', 'food', 'mud_grass', 'stain_other'])

/** A flagged garment that goes first (design 5.2): damp, sweaty, smelly, baby mess, a fresh stain, or needed by tomorrow. */
export function urgentFlag(flag: { readonly reasons: readonly string[]; readonly stainReport?: unknown; readonly neededBy?: number } | null | undefined, now: number): boolean {
  if (flag === null || flag === undefined) return false
  if (flag.stainReport !== undefined || flag.reasons.some((reason) => urgentReasons.has(reason))) return true
  const endOfTomorrow = new Date(now)
  endOfTomorrow.setHours(24 * 2, 0, 0, 0)
  return flag.neededBy !== undefined && flag.neededBy < endOfTomorrow.getTime()
}

const minute = 60_000

/** The drying queue (`dryingQueue.queue`) as the hub reads it: its runs, the washed pieces still wet, and the one home dryer. */
export function dryingFacts(queue: { readonly runs: readonly (Omit<QueueRun, 'check'> & { readonly check?: { readonly at: number; readonly missed: boolean; readonly pieceIds: readonly string[] } })[]; readonly pieces: readonly { readonly status: string; readonly queuedAt: number; readonly method?: string | null; readonly pieceId?: string; readonly name?: string | null }[]; readonly homeDryerId: string | null; readonly homeDryerSessionId?: string | null; readonly dryers?: readonly { readonly machineId: string; readonly name: string }[]; readonly rackLoads?: number }): DryingFacts {
  const wet = queue.pieces.filter((piece) => piece.status === 'queued')
  const inDryer = queue.homeDryerSessionId ?? null
  return {
    runs: queue.runs.map((run) => ({ runId: run.runId, kind: run.kind, dryerId: run.dryerId, dryerName: run.dryerName, method: run.method, startedAt: run.startedAt, minutes: run.minutes, reminded: run.reminded,
      ...(run.check === undefined ? {} : { check: { at: run.check.at, missed: run.check.missed,
        names: [...new Set(run.check.pieceIds.map((id) => queue.pieces.find((piece) => piece.pieceId === id)?.name ?? null).filter((name): name is string => name !== null))].join(', ') } }) })),
    // Only tumble pieces wait for a dryer; air-dry and dry-flat pieces are hung, never held for one.
    wet: { count: wet.length, tumble: wet.filter((piece) => piece.method === 'tumble').length, since: wet.length === 0 ? null : Math.min(...wet.map((piece) => piece.queuedAt)) },
    homeDryerId: queue.homeDryerId,
    homeDryerSession: inDryer === null ? null : { sessionId: inDryer, name: queue.dryers?.find((dryer) => dryer.machineId === queue.homeDryerId)?.name ?? hubText.machine.dryer },
    ...(queue.rackLoads === undefined ? {} : { rackLoads: queue.rackLoads }),
  }
}

/** A running dryer with its early check still to do: the pieces to take out and when. Never a promise or a damage claim. */
export type EarlyCheck = { readonly runId: string; readonly dryer: string; readonly names: string; readonly at: number; readonly startedAt: number }

/** The dryer runs whose early check is still ahead or due and not yet done or missed, soonest first. */
export function earlyChecks(drying: DryingFacts | undefined): EarlyCheck[] {
  return (drying?.runs ?? []).flatMap((run) => run.kind === 'dryer' && run.check !== undefined && !run.check.missed
    ? [{ runId: run.runId, dryer: run.dryerName ?? hubText.machine.dryer, names: run.check.names, at: run.check.at, startedAt: run.startedAt }] : [])
    .sort((left, right) => left.at - right.at)
}

/** Loads a drying rack or line holds. Our own default until the household is asked (owner decision 12). */
export const rackLoads = 1

/** Wet this long, or overnight, and the hub asks for a smell check. Our own cautious choice, not a sourced figure. */
export const smellCheckAfter = 6 * 60 * minute

/** "It sat wet a long time": six hours or more, or since before today began. Never a promise that less is fine. */
export function satWetLong(since: number | null, now: number): boolean {
  if (since === null) return false
  return now - since >= smellCheckAfter || new Date(since).toDateString() !== new Date(now).toDateString()
}

/** A time to show as "about": rounded to 5 minutes, since every one of these is an estimate. */
export const aboutTime = (time: number) => Math.round(time / (5 * minute)) * 5 * minute

/** When a dryer run's timer runs out; null without minutes. */
export const runEnd = (run: Pick<QueueRun, 'startedAt' | 'minutes'>) => run.minutes === null ? null : run.startedAt + run.minutes * minute

/**
 * The home dryer's state from the household's own tracked loads: a running wash whose own dryer step
 * started (rows in "drying" or "dry"), or a drying-queue dryer run. A load whose time is up is still
 * in the dryer until someone takes it out, so it comes first ("done"). Null without one home dryer.
 */
export function homeDryer(rows: readonly RunningRow[], drying: DryingFacts | undefined, now: number, says?: HubInputs['dryerSays']): DryerNow | null {
  if (drying === undefined || drying.homeDryerId === null) return null
  const inSession = rows.filter((row) => row.stage === 'drying' || row.stage === 'dry')
  const runs = drying.runs.filter((run) => run.kind === 'dryer' && (run.dryerId === null || run.dryerId === drying.homeDryerId))
  const doneRow = inSession.find((row) => row.stage === 'dry')
  if (doneRow !== undefined) return { kind: 'done', name: doneRow.machine, target: { to: 'session', sessionId: doneRow.sessionId } }
  const doneRun = runs.find((run) => { const end = runEnd(run); return end !== null && end <= now })
  if (doneRun !== undefined) return { kind: 'done', name: doneRun.dryerName ?? hubText.machine.dryer, target: { to: 'drying' } }
  // "Dryer says: 40 min" re-times the busy dryer it was typed for.
  const typed = (key: string, until: number | null, source: DryerTimeSource) => says?.key === key && says.end > now ? { until: says.end, source: 'says' as const } : { until, source }
  const run = runs[0]
  if (run !== undefined) return { kind: 'busy', name: run.dryerName ?? hubText.machine.dryer, ...typed(run.runId, runEnd(run), 'entered'), runId: run.runId, reminded: run.reminded === true, target: { to: 'drying' } }
  const row = inSession[0]
  if (row !== undefined) return { kind: 'busy', name: row.machine, ...typed(row.sessionId, row.doneAt, 'wash'), runId: null, reminded: false, target: { to: 'session', sessionId: row.sessionId } }
  // Without session rows (a load page, the drying page) the server still says a wash's own dryer step holds it.
  const held = drying.homeDryerSession
  if (held != null && !rows.some((entry) => entry.sessionId === held.sessionId)) return { kind: 'busy', name: held.name, until: null, runId: null, reminded: false, target: { to: 'session', sessionId: held.sessionId } }
  return { kind: 'free' }
}

/**
 * What the machines are doing now, for fitting what is left of the day: when the washer can take the
 * next wash and when the home dryer is free. Each load in the washer is followed to the dryer (it moves
 * when both are ready, five minutes of moving), so a late first wash, an extended dryer or a typed
 * "Dryer says" moves both. A wash whose dryer time is not recorded leaves the dryer free after its move.
 * A load being prepared has no finish time yet and holds nothing here.
 */
export function machineOccupancy(rows: readonly RunningRow[], dryer: DryerNow | null, now: number): { readonly washerFreeAt: number; readonly dryerFreeAt: number | null } {
  let dryerFreeAt = dryer?.kind === 'busy' ? dryer.until : dryer?.kind === 'done' ? now + moveMinutes * minute : null
  let washerFreeAt = now
  const inWasher = rows.filter((row) => row.stage === 'washing' || row.stage === 'wash_done').sort((left, right) => (left.doneAt ?? now) - (right.doneAt ?? now))
  for (const row of inWasher) {
    const washEnd = Math.max(now, row.doneAt ?? now)
    if (row.hasDrying !== true) {
      washerFreeAt = Math.max(washerFreeAt, washEnd + moveMinutes * minute)
      continue
    }
    const dryStart = Math.max(washEnd, dryerFreeAt ?? washEnd) + moveMinutes * minute
    washerFreeAt = Math.max(washerFreeAt, dryStart)
    dryerFreeAt = dryStart + (row.dryMinutes == null ? 0 : longDry(row.dryMinutes) * minute)
  }
  return { washerFreeAt, dryerFreeAt }
}

/** Rack or line loads still free: the rack's size less the loads already hanging from the queue. */
export function rackRoom(drying: DryingFacts | undefined): number {
  return Math.max(0, (drying?.rackLoads ?? rackLoads) - (drying?.runs.filter((run) => run.kind === 'air' && (run.method === 'rack_line' || run.method === null)).length ?? 0))
}

export const rackFull = (drying: DryingFacts | undefined): boolean => rackRoom(drying) === 0

const done = (stage: SessionStage) => stage === 'wash_done' || stage === 'dry'
const washing = (stage: SessionStage) => stage === 'preparing' || stage === 'washing'
const inWasher = (row: RunningRow) => washing(row.stage)

/** Every running load a state carries, the finished one first. */
export function hubRows(state: HubState | undefined): readonly RunningRow[] {
  if (state?.kind === 'finished') return [state.row, ...state.rows]
  return state?.kind === 'running' || state?.kind === 'wet' || state?.kind === 'dryer_check' ? state.rows : []
}

/** The next wash timed against a dryer that ends at `dryerEnd`: now when it waits no longer than the limit, else held back. */
function nextStep(next: NextLoad | null, washerFree: number, dryerEnd: number, dryerKey: string | null, dryerSource?: DryerTimeSource): NextStep | null {
  // No clock while any load lacks minutes (invariant 11); an air-dry load never waits for the dryer.
  if (next === null || !next.ready || next.timed !== true || next.dryerRuns === 0 || next.washMinutes === undefined || next.washMinutes === null) return null
  const timing = nextStart(washerFree, dryerEnd, next.washShort ?? next.washMinutes, waitLimit)
  return { number: next.number, ...(next.name === undefined ? {} : { name: next.name }), planId: next.planId, loadId: next.loadId ?? null, washMinutes: next.washMinutes,
    washSource: next.washSource ?? 'recorded', ...(next.washCount === undefined ? {} : { washCount: next.washCount }), wait: timing.wait, at: timing.at > washerFree ? timing.at : null, dryerKey, dryerEnd, ...(dryerSource === undefined ? {} : { dryerSource }),
    waitNow: Math.max(0, (dryerEnd - washerFree) / minute - next.washMinutes) }
}

function loadName(ids: readonly string[] | undefined, names: ReadonlyMap<string, string> | undefined): string | undefined {
  if (ids === undefined || names === undefined) return undefined
  const found = [...new Set(ids.map((id) => names.get(id)).filter((name): name is string => name !== undefined))]
  return found.length === 1 ? found[0] : found.length > 1 ? `${countWord(ids.length, 'laundry item')}` : undefined
}

function runningRow(session: DaySession, now: number, names?: ReadonlyMap<string, string>): RunningRow {
  const times = sessionStage(session, now)
  const inDryer = session.dryerStartedAt !== null
  const rawName = inDryer ? session.dryerName : session.machineName
  // A shared room's grouping word ("… pool") is backend jargon; the band and dock show a plain machine name.
  const machine = rawName === null ? (inDryer ? hubText.machine.dryer : hubText.machine.washer) : washerName(rawName)
  const doneAt = times.stage === 'drying' || times.stage === 'dry' ? times.dryReadyAt : times.washReadyAt
  const name = loadName(session.textileIds, names)
  return { sessionId: session.sessionId, machine, stage: times.stage, doneAt,
    ...(name === undefined ? {} : { name }),
    startedAt: inDryer ? session.dryerStartedAt : session.machineStartedAt,
    hasDrying: session.hasDrying,
    dryMinutes: session.dryMinutes,
  }
}

type PlanLoad = DayPlan['loads'][number]

const dryerRuns = (load: PlanLoad) => planDryerRuns(load.dryer == null ? null : { tumble: load.dryer.tumbleCount, fit: load.dryer.fit })

/**
 * The next load of the open plan to start, as "Load n of m": n is its place in the wash order the
 * plan's cards show (`washOrder`: under way first, then urgent, tumble, air-dry last; design 5.1).
 */
export function nextLoad(plan: DayPlan | null | undefined, names?: ReadonlyMap<string, string>, urgentIds?: ReadonlySet<string>, spent = false): NextLoad | null {
  if (plan === null || plan === undefined) return null
  const ordered = washOrder(plan.loads.map((_, at) => at), (at) => ({ started: plan.loads[at]!.sessionId !== null, urgent: plan.loads[at]!.textileIds?.some((id) => urgentIds?.has(id) === true) === true, dryerRuns: dryerRuns(plan.loads[at]!) }))
  const numberOf = (at: number) => ordered.indexOf(at) + 1
  const order = ordered.filter((at) => plan.loads[at]!.sessionId === null)
  if (order.length === 0) return null
  const index = order[0]!
  const load = plan.loads[index]!
  const name = loadName(load.textileIds, names)
  const treatment = load.treatments?.find((entry) => entry.supplyName !== null && entry.dose.mark !== undefined && entry.dose.mark !== null)
  // A blocked load shows no amounts: its plan may change before it can start.
  const dose = !load.startable || treatment === undefined ? undefined : treatment.dose.fractionOfMark === undefined && treatment.dose.target === undefined && !treatment.dose.approximate
    ? hubText.doseTo(treatment.supplyName!, treatment.dose.mark!)
    : `${treatment.supplyName} · ${doseParts({ ...treatment.dose, amount: treatment.dose.amount ?? 1, unit: treatment.dose.unit ?? 'cap' }, 'imperial').spoken}`
  const urgent = (entry: PlanLoad) => entry.textileIds?.some((id) => urgentIds?.has(id) === true) === true
  const waiting = order.flatMap((at) => { const entry = plan.loads[at]!; return entry.loadId !== undefined && entry.textileIds !== undefined ? [{ loadId: entry.loadId, number: numberOf(at), textileIds: entry.textileIds, startable: entry.startable, dryerRuns: dryerRuns(entry),
    wash: washTime(entry), dry: dryerRuns(entry) === 0 ? null : dryTime(entry), urgent: urgent(entry) }] : [] })
  const listed = waiting.length === order.length
  const wash = washTime(load)
  const unstarted = order.map((at) => plan.loads[at]!)
  const missing = { wash: unstarted.some((entry) => entry.washMinutes == null && entry.washLearned == null), dryer: unstarted.some((entry) => dryerRuns(entry) > 0 && entry.dryer!.minutes === null) }
  // A clock only when every load has its minutes on record or learned: nothing is guessed.
  const timed = !missing.wash && !missing.dryer
  return { planId: plan.planId, number: numberOf(index), count: plan.loads.length, ready: load.startable, dryerRuns: dryerRuns(load), timed, spent,
    ...(load.loadId === undefined ? {} : { loadId: load.loadId }),
    ...(load.washMinutes === undefined && wash === null ? {} : { washMinutes: wash?.minutes ?? null, ...(wash === null ? {} : { washSource: wash.source, washShort: wash.short, ...(wash.count === undefined ? {} : { washCount: wash.count }) }) }),
    ...(!load.startable && load.blockers?.[0] !== undefined ? { blocker: load.blockers[0] } : {}),
    ...(name === undefined ? {} : { name }), ...(load.textileIds === undefined ? {} : { things: load.textileIds.length }), ...(dose === undefined ? {} : { dose }),
    ...(listed ? { loads: waiting } : {}) }
}

/** A finished load needs you first, then running loads, the open plan, the hamper, then the drying rack. */
export function hubState({ hamper, plan, sessions, hanging, textileNames, drying, urgentIds, dryerSays, sharedStart, dayUntil }: HubInputs, now: number): HubState {
  const rows = (sessions ?? [])
    .filter((session) => session.status === 'running')
    .map((session) => runningRow(session, now, textileNames))
    // Soonest first; a load with no known time goes last, in the order it started.
    .sort((left, right) => (left.doneAt ?? Number.POSITIVE_INFINITY) - (right.doneAt ?? Number.POSITIVE_INFINITY))
  let next = nextLoad(plan, textileNames, urgentIds, sharedStartSpent(plan, sessions, now))
  const dryer = homeDryer(rows, drying, now, dryerSays)
  if (dayUntil !== undefined && dryer !== null && next?.loads !== undefined && plan != null) {
    const free = machineOccupancy(rows, dryer, now)
    const rest = remainingDay(next.loads.map((load) => ({ id: load.loadId, urgent: load.urgent === true, dryerRuns: load.dryerRuns, washMinutes: load.wash?.long ?? null, dryMinutes: load.dry?.long ?? null, mayHang: false })), now, dayUntil, rackRoom(drying), { waitLimit, move: moveMinutes, ...free })
    if (rest?.refit !== null && rest?.refit !== undefined) {
      const today = new Set(rest.refit.today)
      const fitted = nextLoad({ ...plan, loads: plan.loads.filter((load) => load.sessionId !== null || load.loadId !== undefined && today.has(load.loadId)) }, textileNames, urgentIds, next.spent)
      next = fitted === null ? { ...next, ready: false, dayDeferred: true } : { ...fitted, number: next.loads.find((load) => load.loadId === fitted.loadId)!.number, count: next.count, loads: next.loads }
    }
  }
  const wait = (since: number | null): WetWait => ({ dryer, rackFull: rackFull(drying), smell: satWetLong(since, now), next: next?.number ?? null })
  const toDryer = (row: RunningRow) => row.stage === 'wash_done' && sessions!.find((entry) => entry.sessionId === row.sessionId)!.hasDrying
  // A wash waiting for the home dryer comes first: it says whether the dryer is busy, or to take its load out first.
  const finished = (dryer === null ? undefined : rows.find(toDryer)) ?? rows.find((row) => done(row.stage))
  if (finished !== undefined) {
    const wet = toDryer(finished)
    // Moving it now to a free home dryer: the next wash joins this trip, or is held back (design 5.3).
    const dryMinutes = finished.dryMinutes ?? null
    const moved = now + moveMinutes * minute
    const step = wet && dryer?.kind === 'free' && dryMinutes !== null && !rows.some(inWasher) ? nextStep(next, moved, moved + dryMinutes * minute, null) : null
    return { kind: 'finished', row: finished, toDryer: wet, rows: rows.filter((row) => row !== finished), next, ...(wet ? { wait: wait(finished.doneAt) } : {}), ...(step === null ? {} : { step }) }
  }
  if (drying !== undefined && drying.wet.count > 0) return { kind: 'wet', count: drying.wet.count, tumble: drying.wet.tumble, wait: wait(drying.wet.since), next, rows, hamper: hamper.count }
  const due = drying?.runs.find((run) => { const end = run.kind === 'dryer' ? runEnd(run) : null; return end !== null && end <= now })
  if (due !== undefined) return { kind: 'dryer_check', runId: due.runId, name: due.dryerName ?? hubText.machine.dryer, doneAt: runEnd(due)!, rows }
  // A mid-run check that is due comes after a done dryer and a done wash (design 9.1).
  const check = drying?.runs.find((run) => run.check !== undefined && !run.check.missed && run.check.at <= now)
  if (check?.check !== undefined) return { kind: 'dryer_check', runId: check.runId, name: check.dryerName ?? hubText.machine.dryer, doneAt: check.check.at, rows, early: check.check.names || (check.dryerName ?? hubText.machine.dryer) }
  // The home dryer is busy and the washer is free: start the next wash now, or at about when it ends with the dryer.
  const busyStep = rows.some(inWasher) || dryer?.kind !== 'busy' || dryer.until === null ? null
    : nextStep(next, now, dryer.until, dryer.runId ?? (dryer.target.to === 'session' ? dryer.target.sessionId : null), dryer.source)
  if (rows.length > 0) return { kind: 'running', rows, next, ...(busyStep === null ? {} : { step: busyStep }) }
  if (next !== null) {
    const pass: HubState = { kind: 'pass', ...next, ...(busyStep === null ? {} : { step: busyStep }) }
    return sharedStart !== undefined && sharedStartView(pass, sharedStart.entry, sharedStart.washers)?.kind === 'ask' ? { ...pass, askFree: true } : pass
  }
  if (hamper.count > 0) return { kind: 'hamper', count: hamper.count, loads: hamper.loads }
  if (hanging.count > 0) {
    const run = drying?.runs.find((run) => run.kind === 'air')
    return { kind: 'drying', count: hanging.count, sessionIds: hanging.sessionIds, ...(run === undefined ? {} : { runId: run.runId }) }
  }
  return { kind: 'empty' }
}

// ---- Shared room: what is free at the start (design 11) ------------------------------------------

/**
 * The person's answers at the start of a shared-room pass, kept on this phone only and never as machine
 * status (invariant 10): the loads to start now and, for "Start all", every load a free washer could
 * take. `done`: skipped, or the first wash is done, so the counts are not used again for this plan.
 */
export type SharedStart = { readonly planId: string; readonly now: readonly string[]; readonly all: readonly string[]; readonly choseAll?: boolean } | { readonly planId: string; readonly done: true }

export type SharedStartView =
  | { readonly kind: 'ask'; readonly planId: string }
  /** `now`: the picked loads still to start, in wash order. `all`: how many "Start all" would start, when that is more. */
  | { readonly kind: 'picks'; readonly planId: string; readonly now: readonly PlannedLoad[]; readonly all: number | null; readonly choseAll: boolean }

export const isWasher = (applianceType: string | null | undefined) => applianceType === 'top_load_washer' || applianceType === 'front_load_washer'

/** Washers in a shared room: with more than one, the first start of a pass asks what is free. */
export function sharedWasherCount(machines: readonly { readonly archived?: boolean; readonly location?: string | null; readonly applianceType?: string | null }[]): number {
  return machines.filter((machine) => !machine.archived && machine.location === 'shared' && isWasher(machine.applianceType)).length
}

/** Where a pass's Start goes: the Laundry tab while "What's free right now?" is still to answer, else the plan. */
export const passTarget = (state: { readonly planId: string; readonly askFree?: true }): { readonly to: 'laundry' } | { readonly to: 'plan'; readonly planId: string } =>
  state.askFree === true ? { to: 'laundry' } : { to: 'plan', planId: state.planId }

/** From "Washers free" and "Dryers free" (3+ counts as 3): washes while washers last, one tumble load per free dryer. */
export function sharedPicks(loads: readonly PlannedLoad[], washers: number, dryers: number): { readonly now: readonly string[]; readonly all: readonly string[] } {
  const ready = loads.filter((load) => load.startable)
  return { now: sharedStarts(ready.map((load) => ({ id: load.loadId, urgent: false, dryerRuns: load.dryerRuns })), washers, dryers), all: ready.slice(0, washers).map((load) => load.loadId) }
}

/**
 * A wash of this plan is done or past the washer: the start-of-pass counts are spent. Only this plan's
 * own sessions count, so old queued pieces or another plan's loads never use them up.
 */
export function sharedStartSpent(plan: DayPlan | null | undefined, sessions: readonly DaySession[] | undefined, now: number): boolean {
  if (plan == null || sessions === undefined) return false
  return plan.loads.some((load) => {
    if (load.sessionId === null) return false
    const session = sessions.find((entry) => entry.sessionId === load.sessionId)
    if (session === undefined || session.status !== 'running') return true
    return !washing(sessionStage(session, now).stage)
  })
}

/**
 * Asked only in a shared room with more than one washer, at the start of a pass (nothing running yet)
 * with two or more loads ready; then the picks until a wash is done. No clock and no hold-back here.
 */
export function sharedStartView(state: HubState, entry: SharedStart | null, sharedWashers: number): SharedStartView | null {
  if (sharedWashers < 2) return null
  const next = state.kind === 'pass' ? state : state.kind === 'running' ? state.next : null
  if (next === null || next.loads === undefined || next.spent === true) return null
  if (entry === null || entry.planId !== next.planId) {
    return state.kind === 'pass' && next.loads.filter((load) => load.startable).length >= 2 ? { kind: 'ask', planId: next.planId } : null
  }
  if ('done' in entry) return null
  const now = next.loads.filter((load) => entry.now.includes(load.loadId))
  return { kind: 'picks', planId: next.planId, now, all: state.kind === 'pass' && entry.all.length > entry.now.length ? entry.all.length : null, choseAll: entry.choseAll === true }
}

// ---- Words -----------------------------------------------------------------------------

export type HubTarget =
  | { readonly to: 'add' }
  | { readonly to: 'make_loads' }
  | { readonly to: 'plan'; readonly planId: string }
  | { readonly to: 'session'; readonly sessionId: string }
  | { readonly to: 'all_dry'; readonly sessionIds: readonly string[] }
  | { readonly to: 'closet' }
  | { readonly to: 'drying'; readonly run?: string }
  | { readonly to: 'laundry' }

export type HubBlockView = {
  readonly eyebrow: string
  readonly title: string
  readonly reason: string | null
  readonly button: string
  readonly target: HubTarget
  /** A second, smaller action: the next wash, when washed pieces waiting to dry do not hold it back. */
  readonly secondary?: { readonly label: string; readonly target: { readonly to: 'plan'; readonly planId: string } | { readonly to: 'laundry' } }
}

const stageWords: Readonly<Record<SessionStage, string>> = homeText.band.stages

/**
 * The phone timer to set for a time still ahead: "Set a phone timer: 34 min". The app cannot alert
 * a locked iPhone, so the phone's own timer does. Nothing once the time has come.
 */
export function phoneTimer(doneAt: number, now: number): string | null {
  const minutes = Math.ceil((doneAt - now) / 60_000)
  if (minutes <= 0) return null
  return hubText.timer(hubText.duration(minutes))
}

/**
 * "Washer 2 · Washing · done at 4:12 PM", with the phone timer to set while the time is ahead; with
 * no recorded time, just the machine and the stage.
 */
export function runningRowLine(row: RunningRow, now: number): { readonly what: string; readonly when: string | null; readonly timer: string | null } {
  return {
    what: `${row.machine} · ${stageWords[row.stage]}`,
    when: row.doneAt === null ? null : hubText.doneAt(clockTime(row.doneAt)),
    timer: row.doneAt === null ? null : phoneTimer(row.doneAt, now),
  }
}

const loadLine = (next: NextLoad) => hubText.loadOf(next.number, next.count)

/**
 * A wet load held up by the home dryer: "Dryer busy until about 4:10" (or "Is the dryer free?" with no
 * time), or "Take out Dryer first" when its load is done. The detail says hang or wait, "Rack full",
 * or the smell check once it sat wet long. Null when the dryer is free or unknown (a shared room).
 */
export function wetWaitWords(wait: WetWait | undefined): { readonly title: string; readonly detail: string; readonly unload: DryerTarget | null } | null {
  const dryer = wait?.dryer
  if (wait === undefined || dryer === null || dryer === undefined || dryer.kind === 'free') return null
  if (dryer.kind === 'done') return { title: dryerWaitText.unloadFirst(dryer.name), detail: wait.smell ? dryerWaitText.smell : dryerWaitText.thenMoveIn, unload: dryer.target }
  const detail = wait.smell ? dryerWaitText.smell : [wait.rackFull ? dryerWaitText.rackFull : dryerWaitText.hangOrWait, wait.next === null ? null : dryerWaitText.nextAfter(wait.next)].filter(Boolean).join(' ')
  return { title: dryer.until === null ? dryerWaitText.isItFree : dryerWaitText.busyUntil(clockTime(aboutTime(dryer.until))), detail, unload: null }
}

/**
 * The "Next" line (design 9.1). `moving`: the washed load still goes into the dryer on this trip. Every
 * clock time and wait is rounded to 5 minutes and says "about"; the minutes say when they are an estimate.
 */
export function nextStepWords(step: NextStep, moving: boolean): { readonly title: string; readonly detail: string } {
  const load = nextStepText.load(step.number, step.name, step.washMinutes, step.washSource, step.washCount)
  if (step.at === null) {
    const wait = step.wait > 0 ? ` · ${nextStepText.mayWait(Math.max(5, Math.round(step.wait / 5) * 5))}` : ''
    return { title: moving ? nextStepText.moveThenStart(step.number) : nextStepText.startNow(step.number), detail: `${load}${wait}` }
  }
  const at = clockTime(aboutTime(step.at))
  return moving ? { title: nextStepText.moveFirst, detail: `${nextStepText.thenStartAt(step.number, at)}` }
    : { title: nextStepText.startAt(step.number, at), detail: `${load} · ${nextStepText.doneWithDryer(clockTime(aboutTime(step.dryerEnd)))}. ${nextStepText.ifNow(Math.round(step.waitNow / 5) * 5)}` }
}

/** A load's button says the one next action its stage has (session-stage.ts); the hub keeps the route. */
export const rowAction = (row: RunningRow) => loadNextAction(row.stage).label

function finishedTitle(row: RunningRow, toDryer: boolean): string {
  if (row.stage === 'dry') return `${row.machine} · ${homeText.dock.checkDryness}`
  return hubText.finished(row.machine, toDryer)
}

/** What the action block says and does in each state. */
export function hubBlockView(state: HubState): HubBlockView {
  switch (state.kind) {
    case 'empty':
      return { ...hubText.empty, target: { to: 'add' } }
    case 'hamper':
      return {
        eyebrow: hubText.hamper.eyebrow,
        title: hubText.hamper.title(state.count, state.loads),
        reason: hubText.hamper.reason,
        button: hubText.hamper.button,
        target: { to: 'make_loads' },
      }
    case 'pass':
      if (state.dayDeferred) return { eyebrow: hubText.plan.eyebrow, title: 'Remaining loads wait until tomorrow', reason: 'They no longer fit before your chosen end time.', button: 'Review laundry day', target: { to: 'laundry' } }
      if (state.step !== undefined) {
        const words = nextStepWords(state.step, false)
        return { eyebrow: nextStepText.eyebrow, title: words.title, reason: words.detail, button: hubText.plan.start, target: passTarget(state) }
      }
      return state.ready
        ? { eyebrow: hubText.plan.eyebrow, title: hubText.plan.ready(loadLine(state)), reason: hubText.plan.readyReason, button: hubText.plan.start, target: passTarget(state) }
        : { eyebrow: hubText.plan.eyebrow, title: hubText.plan.waiting(loadLine(state)), reason: hubText.plan.waitingReason, button: hubText.plan.carryOn, target: { to: 'plan', planId: state.planId } }
    case 'running':
      if (state.step !== undefined && state.step.at === null) {
        const words = nextStepWords(state.step, false)
        return { eyebrow: nextStepText.eyebrow, title: words.title, reason: words.detail, button: hubText.plan.start, target: { to: 'plan', planId: state.step.planId } }
      }
      return {
        eyebrow: hubText.running.eyebrow,
        title: state.rows.length === 1 ? `${state.rows[0]!.machine} · ${stageWords[state.rows[0]!.stage]}` : hubText.running.title(state.rows.length),
        reason: null,
        button: state.rows.length === 1 ? rowAction(state.rows[0]!) : hubText.running.button,
        target: { to: 'session', sessionId: state.rows[0]!.sessionId },
      }
    case 'finished': {
      const held = wetWaitWords(state.wait)
      if (held !== null) return { eyebrow: hubText.finishedState.eyebrow, title: held.title, reason: held.detail, button: held.unload === null ? dryerWaitText.hangOrWaitButton : dryerWaitText.checkDryness, target: held.unload ?? { to: 'session', sessionId: state.row.sessionId } }
      if (state.step !== undefined) {
        const words = nextStepWords(state.step, true)
        return { eyebrow: hubText.finishedState.eyebrow, title: words.title, reason: words.detail, button: rowAction(state.row), target: { to: 'session', sessionId: state.row.sessionId } }
      }
      return { eyebrow: hubText.finishedState.eyebrow, title: finishedTitle(state.row, state.toDryer), reason: state.row.stage === 'dry' ? homeText.dock.drynessUnknown : null, button: rowAction(state.row), target: { to: 'session', sessionId: state.row.sessionId } }
    }
    case 'wet': {
      // A shared room has other washers, and pieces that only hang never wait for a dryer: the next wash stays offered.
      // A finished wash keeps its plan's loads still to start; with no plan left, the rest of the hamper is offered to plan.
      const free = state.wait.dryer === null || state.tumble === 0
      const next = free && state.next !== null && state.next.ready ? state.next : null
      const secondary = next !== null ? { secondary: { label: homeText.dock.startLoad(next.number), target: { to: 'plan' as const, planId: next.planId } } }
        : free && state.next === null && (state.hamper ?? 0) > 0 ? { secondary: { label: hubText.hamper.button, target: { to: 'laundry' as const } } } : {}
      if (state.tumble === 0) return { eyebrow: hubText.finishedState.eyebrow, title: dryerWaitText.toHang(state.count), reason: state.wait.smell ? dryerWaitText.smell : dryerWaitText.hangEach,
        button: dryerWaitText.hang, target: { to: 'drying' }, ...secondary }
      const held = wetWaitWords(state.wait)
      return { eyebrow: hubText.finishedState.eyebrow, title: held?.title ?? (state.wait.dryer?.kind === 'free' ? dryerWaitText.moveNow : dryerWaitText.waiting(state.count)),
        reason: held?.detail ?? (state.wait.smell ? dryerWaitText.smell : dryerWaitText.intoADryer),
        button: held === null ? dryerWaitText.dryNow : held.unload === null ? dryerWaitText.hangOrWaitButton : dryerWaitText.checkDryness, target: held?.unload ?? { to: 'drying' }, ...secondary }
    }
    case 'dryer_check':
      if (state.early !== undefined) return { eyebrow: nextStepText.eyebrow, title: midCheckText.takeOutNow(state.early), reason: midCheckText.cardKeepsGoing(state.name), button: midCheckText.takeOutShort, target: { to: 'drying', run: state.runId } }
      return { eyebrow: hubText.finishedState.eyebrow, title: dryerWaitText.dryerCheck(state.name), reason: homeText.dock.drynessUnknown, button: dryerWaitText.checkDryness, target: { to: 'drying', run: state.runId } }
    case 'drying':
      return {
        eyebrow: hubText.drying.eyebrow,
        title: hubText.drying.title(state.count),
        reason: hubText.drying.reason,
        // No load to clear them from: the Closet has them, one by one.
        ...(state.sessionIds.length > 0 ? { button: hubText.drying.allDry, target: { to: 'all_dry', sessionIds: state.sessionIds } } : { button: hubText.drying.seeThem, target: { to: 'closet' } }),
      }
  }
}

export type DockView = { readonly text: string; readonly action: string; readonly target: Exclude<HubTarget, { to: 'add' } | { to: 'make_loads' } | { to: 'all_dry' }> | { readonly to: 'laundry' } }
