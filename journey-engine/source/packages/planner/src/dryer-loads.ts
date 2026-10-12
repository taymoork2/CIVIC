import { dryerFit, dryerTimeSuggestion, type DryerFit, type HoldOutMethod, type HoldOutReason } from './drying.ts'
import { heatRank, type DryerHeat, type DryMethod } from './vocabulary.ts'

/** How a piece is dried. Equipment for `tumble` and `heated_hanging` must be recorded to use it. */
export const dryingMethods = ['tumble', 'heated_hanging', 'rack_line', 'flat'] as const
export type DryingMethod = (typeof dryingMethods)[number]
export type NaturalMethod = Exclude<DryingMethod, 'tumble'>

/**
 * What the recorded drying label says about a method. Only tumbling conflicts, and only with a
 * do-not-tumble label. Natural drying is never recorded as forbidden, so a rack, line or flat that the
 * label doesn't name is `not_specified`; a heated hanging dryer's compatibility is never established
 * by a label. `tag_unknown`: no confirmed drying label, so nothing is said either way.
 */
export type MethodEvidence = 'allowed' | 'conflict' | 'not_specified' | 'not_established' | 'tag_unknown'

/** Where a piece's drying method came from; `stain` means heat must wait until someone checks the stain is gone. */
export type MethodSource = 'label' | 'once' | 'preference' | 'routine' | 'stain'

/** "Needed by": a coarse priority for ordering only. No drying time is recorded, so no finish is promised. */
export const neededBy = ['2h', 'today', 'tomorrow'] as const
export type NeededBy = (typeof neededBy)[number]

export function methodEvidence(method: DryingMethod, label: DryMethod): MethodEvidence {
  if (label === 'unknown') return 'tag_unknown'
  if (method === 'heated_hanging') return 'not_established'
  if (method === 'tumble') return label === 'tumble_dry' ? 'allowed' : label === 'do_not_tumble_dry' ? 'conflict' : 'not_specified'
  if (method === 'flat') return label === 'dry_flat' ? 'allowed' : 'not_specified'
  return label === 'line_dry' || label === 'drip_dry' ? 'allowed' : 'not_specified'
}

/** The method a recorded label leads to by itself; null when there is no confirmed drying label. */
export function labelMethod(label: DryMethod): DryingMethod | null {
  if (label === 'unknown') return null
  if (label === 'tumble_dry') return 'tumble'
  if (label === 'dry_flat') return 'flat'
  return 'rack_line'
}

/** The drying label as the queue reads it, from a piece's tumble ceiling (`tumbleCeiling`). */
export function labelFromCeiling(ceiling: { readonly maxHeat: DryerHeat } | { readonly method: HoldOutMethod; readonly reason: HoldOutReason }): DryMethod {
  if ('maxHeat' in ceiling) return 'tumble_dry'
  return ceiling.reason === 'care_label' && ceiling.method !== 'unknown' ? ceiling.method : 'unknown'
}

/**
 * An event choice wins, then an explicitly accepted routine, then a remembered method preference,
 * then the label. The label itself is never edited, and a choice is never declared safe. A stained
 * piece comes first of all: dryer or cabinet heat would set what is left of the stain, so it air
 * dries (flat when the label, a one-time choice, My routine or a remembered preference says so) until someone checks the stain is gone.
 */
export function pieceMethod(label: DryMethod, choice: { readonly once?: DryingMethod | null; readonly routine?: DryingMethod | null; readonly preference?: DryingMethod | null; readonly stained?: boolean } = {}): {
  readonly method: DryingMethod | null
  readonly source: MethodSource | null
  readonly evidence: MethodEvidence | null
} {
  if (choice.stained === true) {
    const air: DryingMethod = [choice.once, choice.routine, choice.preference].includes('flat') || labelMethod(label) === 'flat' ? 'flat' : 'rack_line'
    return { method: air, source: 'stain', evidence: methodEvidence(air, label) }
  }
  const once = choice.once ?? null
  const preference = choice.preference ?? null
  const routine = choice.routine ?? null
  const method = once ?? routine ?? preference ?? labelMethod(label)
  const source: MethodSource | null = once !== null ? 'once' : routine !== null ? 'routine' : preference !== null ? 'preference' : method === null ? null : 'label'
  return { method, source, evidence: method === null ? null : methodEvidence(method, label) }
}

/**
 * One washed piece waiting to dry. `maxHeat` is the hottest heat its recorded label allows, or null
 * when the label sets none (`hold` says why). `method` is the method in use (`pieceMethod`); absent,
 * the label decides. A piece tumbling without a label heat is never given an assumed heat. `source`
 * is the washer it came out of, kept through drying and put-away. `own`: the person gave it a dryer
 * load alone. `need`: its coarse "Needed by" priority.
 */
export interface QueuedPiece {
  readonly id: string
  readonly bulkUnits: number
  readonly maxHeat: DryerHeat | null
  readonly hold?: { readonly method: HoldOutMethod; readonly reason: HoldOutReason }
  readonly source: string
  readonly method?: DryingMethod | null
  readonly own?: boolean
  readonly need?: NeededBy
  /** Its heat comes from the person's My routine, not the tag: it never joins "All on low heat". */
  readonly routine?: boolean
}

export interface PlannedDryerLoad {
  /** The heat every piece in it allows: the most limiting tag. Null: "Heat not set by label", chosen at the dryer. */
  readonly heat: DryerHeat | null
  readonly pieceIds: readonly string[]
  readonly bulkUnits: number
  /** The capacity it was split to, or null when no capacity is known (its fit is not checked). */
  readonly capacityUnits: number | null
  readonly fit: DryerFit
  /** The washers its pieces came from, in queue order. */
  readonly sources: readonly string[]
  /** The most urgent "Needed by" in it, or null. */
  readonly need: NeededBy | null
}

export interface DryerLoadPlan {
  readonly loads: readonly PlannedDryerLoad[]
  /** Pieces drying without a tumble dryer, grouped by method in `natural` order. */
  readonly natural: readonly { readonly pieceId: string; readonly method: NaturalMethod }[]
  /** Pieces with no drying label and no chosen method: they need one before they can dry. */
  readonly unset: readonly string[]
  /** Pieces needing different label heats are queued, so "All on low heat" is a real choice. */
  readonly mixedHeats: boolean
}

export interface DryerLoadOptions {
  /** "All on low heat": one heat group at the most limiting tag, instead of one group per heat. */
  readonly combine?: boolean
  /** The dryer the loads are planned for; null or absent when its capacity is unknown. */
  readonly capacityUnits?: number | null
}

const needRank = (need: NeededBy | null | undefined): number => (need === null || need === undefined ? neededBy.length : neededBy.indexOf(need))
const naturalOrder: readonly NaturalMethod[] = ['heated_hanging', 'rack_line', 'flat']

function holdMethod(piece: QueuedPiece): DryingMethod | null {
  if (piece.maxHeat !== null) return 'tumble'
  const hold = piece.hold
  if (hold === undefined || hold.method === 'unknown') return null
  return hold.method === 'dry_flat' ? 'flat' : 'rack_line'
}

/** The method a queued piece is planned with: its chosen method, or what its label leads to. */
export function queuedMethod(piece: QueuedPiece): DryingMethod | null {
  return piece.method === undefined ? holdMethod(piece) : piece.method
}

/**
 * Dryer loads, planned apart from wash loads. Pieces from different washers that allow the same heat
 * share a load; one wash load can split across several. Each heat group is split to the capacity when
 * one is known; with no known capacity it stays whole and its fit is reported as not checked, never
 * as fitting. Pieces tumbling without a label heat form their own group, never merged into low heat.
 * A piece the person gave its own load starts a new one. "Needed by" orders pieces within a group
 * and loads among themselves; nothing more. The dryer actually loaded is checked again at the
 * machine (`fitInDryer`). Deterministic: queue order in, queue order out among equal priorities.
 */
export function planDryerLoads(pieces: readonly QueuedPiece[], options: DryerLoadOptions = {}): DryerLoadPlan {
  const capacity = typeof options.capacityUnits === 'number' && Number.isFinite(options.capacityUnits) && options.capacityUnits > 0 ? options.capacityUnits : null
  const natural: { pieceId: string; method: NaturalMethod }[] = []
  const unset: string[] = []
  const labelled: (QueuedPiece & { maxHeat: DryerHeat })[] = []
  const unheated: QueuedPiece[] = []
  for (const piece of pieces) {
    const method = queuedMethod(piece)
    if (method === null) unset.push(piece.id)
    else if (method !== 'tumble') natural.push({ pieceId: piece.id, method })
    else if (piece.maxHeat === null) unheated.push(piece)
    else labelled.push(piece as QueuedPiece & { maxHeat: DryerHeat })
  }
  natural.sort((left, right) => naturalOrder.indexOf(left.method) - naturalOrder.indexOf(right.method))
  const heatsOf = (group: readonly (QueuedPiece & { maxHeat: DryerHeat })[]) => [...new Set(group.map((piece) => piece.maxHeat))].sort((left, right) => heatRank(left) - heatRank(right))
  const heats = heatsOf(labelled)
  // "All on low heat" runs at the lowest tag heat; a My routine heat keeps its own group (invariant 1).
  const shared = options.combine === true ? labelled.filter((piece) => piece.routine !== true) : []
  const apart = labelled.filter((piece) => !shared.includes(piece))
  const groups: [DryerHeat | null, readonly QueuedPiece[]][] = [
    ...(shared.length > 0 ? [[heatsOf(shared)[0]!, shared] as [DryerHeat, readonly QueuedPiece[]]] : []),
    ...heatsOf(apart).map((heat): [DryerHeat, readonly QueuedPiece[]] => [heat, apart.filter((piece) => piece.maxHeat === heat)]),
  ]
  if (unheated.length > 0) groups.push([null, unheated])

  const loads: PlannedDryerLoad[] = []
  for (const [heat, group] of groups) {
    let bin: { ids: string[]; units: number; sources: string[]; need: NeededBy | null } = { ids: [], units: 0, sources: [], need: null }
    const close = () => {
      if (bin.ids.length === 0) return
      loads.push({ heat, pieceIds: bin.ids, bulkUnits: bin.units, capacityUnits: capacity, fit: dryerFit(bin.units, capacity), sources: bin.sources, need: bin.need })
      bin = { ids: [], units: 0, sources: [], need: null }
    }
    const byNeed = [...group].sort((left, right) => needRank(left.need) - needRank(right.need))
    // A piece with its own load goes after the shared ones, one load each.
    for (const piece of [...byNeed.filter((entry) => entry.own !== true), ...byNeed.filter((entry) => entry.own === true)]) {
      const full = capacity !== null && bin.ids.length > 0 && bin.units + piece.bulkUnits > capacity
      if (piece.own === true || full) close()
      bin.ids.push(piece.id)
      bin.units += piece.bulkUnits
      if (!bin.sources.includes(piece.source)) bin.sources.push(piece.source)
      if (piece.need !== undefined && needRank(piece.need) < needRank(bin.need)) bin.need = piece.need
      if (piece.own === true) close()
    }
    close()
  }
  const order = loads.map((load, index) => ({ load, index })).sort((left, right) => needRank(left.load.need) - needRank(right.load.need) || left.index - right.index)
  return { loads: order.map((entry) => entry.load), natural, unset, mixedHeats: heats.length > 1 }
}

const knitKinds = new Set(['t_shirt', 'sweater', 'workout', 'baby_bodysuit'])
/** Garment kinds treated as likely knit (design 8.3): a proxy, not material, so a woven tee is flagged too. */
export const isKnit = (kind: string | null | undefined): boolean => knitKinds.has(kind ?? '')

export interface DryerShare {
  /** Dryer runs by heat, and with everything that may share on the lowest tag heat. */
  readonly separate: number
  readonly together: number
  /** The shared run's heat: the lowest tag heat among the pieces sharing it. */
  readonly heat: DryerHeat
  /** Likely-knit pieces that would tumble a run with pieces needing a different heat. */
  readonly knitIds: readonly string[]
}

/**
 * The dryer sharing line (design 8.2): plan the queue apart by heat and on the lowest heat, and offer
 * sharing only when the heats differ and it takes fewer runs. Counts every run, unheated and own-load
 * pieces included. An offer only; the plan stays apart by heat until the person picks sharing.
 */
export function dryerShare(pieces: readonly QueuedPiece[], options: { readonly capacityUnits?: number | null; readonly knit?: ReadonlySet<string> } = {}): DryerShare | null {
  const apart = planDryerLoads(pieces, { capacityUnits: options.capacityUnits })
  const together = planDryerLoads(pieces, { capacityUnits: options.capacityUnits, combine: true })
  if (!apart.mixedHeats || together.loads.length >= apart.loads.length) return null
  const heatOf = new Map(pieces.map((piece) => [piece.id, piece.maxHeat]))
  const mixed = together.loads.filter((load) => load.heat !== null && new Set(load.pieceIds.map((id) => heatOf.get(id))).size > 1)
  const heat = mixed[0]?.heat ?? together.loads.find((load) => load.heat !== null)!.heat!
  const knitIds = mixed.flatMap((load) => load.pieceIds.filter((id) => options.knit?.has(id) === true))
  return { separate: apart.loads.length, together: together.loads.length, heat, knitIds }
}

/** Why a piece is taken out at the mid-run check (design 8.4). */
export type MidRunReason = 'knit' | 'light' | 'heat_not_on_tag'
export interface MidRunPiece {
  readonly id: string
  readonly bulkUnits: number
  readonly kind?: string | null
  /** The tag's heat; null when no label set it (the person chose the heat at the dryer). */
  readonly labelHeat: DryerHeat | null
  /** Its heat comes from My routine, not the tag. */
  readonly routine?: boolean
}
export interface MidRunCheck {
  /** About half the run, rounded to 5 minutes. */
  readonly atMinute: number
  readonly pieceIds: readonly string[]
  readonly reasons: readonly MidRunReason[]
}

/** Bulk at which a piece counts as heavy, and at or under which it counts as light (cut points are a guess from `kindBulkUnits`). */
const heavyUnits = 1.5
const lightUnits = 0.5

/**
 * The early check for one dryer run (design 8.4, 8.5): likely-knit pieces next to heavy ones, light
 * pieces next to heavy ones, and pieces no label set the heat for are taken out at about half the run.
 * For garments, not throughput: the rest keep tumbling. Null when the minutes are unknown, no piece
 * matches, or half the run rounds to its end.
 */
export function midRunCheck(pieces: readonly MidRunPiece[], minutes: number | null | undefined): MidRunCheck | null {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes <= 0) return null
  const atMinute = Math.max(5, Math.round(minutes / 10) * 5)
  if (atMinute >= minutes) return null
  const knit = (piece: MidRunPiece) => isKnit(piece.kind)
  const heavyBeside = (piece: MidRunPiece) => pieces.some((other) => other !== piece && other.bulkUnits >= heavyUnits && !knit(other))
  const reasons = new Set<MidRunReason>()
  const pieceIds: string[] = []
  for (const piece of pieces) {
    const why: MidRunReason[] = [
      ...(knit(piece) && heavyBeside(piece) ? ['knit' as const] : []),
      ...(!knit(piece) && piece.bulkUnits <= lightUnits && heavyBeside(piece) ? ['light' as const] : []),
      ...(piece.labelHeat === null || piece.routine === true ? ['heat_not_on_tag' as const] : []),
    ]
    if (why.length === 0) continue
    pieceIds.push(piece.id)
    for (const reason of why) reasons.add(reason)
  }
  return pieceIds.length === 0 ? null : { atMinute, pieceIds, reasons: [...reasons] }
}

/**
 * What goes into the dryer actually being loaded: pieces in order while they fit its capacity, and
 * the rest stay queued ("Won't fit · stays queued"). An unknown capacity takes everything and says
 * the fit was not checked. At least one piece always goes in, so a lone big piece is never stuck.
 */
export function fitInDryer(pieces: readonly Pick<QueuedPiece, 'id' | 'bulkUnits'>[], capacityUnits: number | null): { readonly going: readonly string[]; readonly staying: readonly string[]; readonly fit: DryerFit } {
  if (capacityUnits === null) return { going: pieces.map((piece) => piece.id), staying: [], fit: 'not_checked' }
  const going: string[] = []
  const staying: string[] = []
  let units = 0
  for (const piece of pieces) {
    if (going.length === 0 || units + piece.bulkUnits <= capacityUnits + 1e-9) {
      going.push(piece.id)
      units += piece.bulkUnits
    } else staying.push(piece.id)
  }
  return { going, staying, fit: dryerFit(units, capacityUnits) }
}

export type DryerProgramMode = 'fixed' | 'sensor' | 'unknown'
export interface DryerStartingContext {
  readonly key: string | null
  readonly pieceCount: number
  readonly bulkUnits: number
  readonly capacityUnits: number | null
  readonly capacityConfidence: string
  readonly extraction: readonly { readonly washerId: string; readonly cycle: string; readonly source: string; readonly spinRpm: number | null; readonly spinMinutes: number | null }[]
}
export interface ComparableDryerOutcome {
  readonly runId: string
  readonly washIds: readonly string[]
  readonly contextKey: string | null
  readonly minutes: number
  readonly completedAt: number
  readonly result: 'improved' | 'unchanged' | 'unknown' | 'worse' | 'damage' | 'irritation' | null
}
export interface DryerStartingSuggestion {
  readonly version: 2
  readonly minutes: number | null
  readonly baselineMinutes: number | null
  readonly basis: 'baseline_only' | 'comparable_outcomes' | 'unavailable'
  readonly mode: DryerProgramMode
  readonly contextKey: string | null
  readonly independentWashes: number
  readonly explanation: string
  readonly context: DryerStartingContext
}

/** Recorded comparable durations are optional starting points, never physical drying predictions. */
export function dryerContextSuggestion(program: { readonly durationMinutes: number; readonly confidence: string; readonly mode?: DryerProgramMode } | undefined,
  context: DryerStartingContext, observations: readonly ComparableDryerOutcome[], options: { readonly enabled: boolean; readonly resetAt: number; readonly historyTruncated: boolean; readonly negativeHistoryTruncated: boolean; readonly now: number }): DryerStartingSuggestion {
  const baseline = dryerTimeSuggestion(program)
  const mode = program?.mode ?? 'unknown'
  const baselineMinutes = mode === 'sensor' ? null : baseline.minutes
  const result = (minutes: number | null, basis: DryerStartingSuggestion['basis'], explanation: string, independentWashes = 0): DryerStartingSuggestion => ({
    version: 2, minutes, baselineMinutes, mode, basis, contextKey: context.key, independentWashes, explanation, context,
  })
  const fallback = (reason: string) => result(baselineMinutes, baselineMinutes === null ? 'unavailable' : 'baseline_only', `${reason} ${baselineMinutes === null ? 'Use the minutes the dryer shows.' : 'Use the checked program as a starting point and enter the minutes the dryer shows.'} Check the clothes for dryness.`)
  if (mode === 'sensor') return result(null, 'unavailable', 'This is a sensor program; its running time varies. Enter the minutes the machine shows and check the clothes for dryness.')
  if (baselineMinutes === null) return fallback('No checked program time is recorded.')
  if (mode !== 'fixed') return fallback('Program mode is not recorded; comparable outcomes cannot refine its duration.')
  if (context.key === null || !Number.isInteger(context.pieceCount) || context.pieceCount < 1 || !Number.isFinite(context.bulkUnits) || context.bulkUnits <= 0
    || context.capacityUnits === null || !Number.isFinite(context.capacityUnits) || context.bulkUnits > context.capacityUnits
    || !['observed', 'verified'].includes(context.capacityConfidence) || context.extraction.length === 0
    || context.extraction.some((entry) => !entry.washerId.trim() || !entry.cycle.trim() || !entry.source.trim() || entry.spinRpm === null || entry.spinMinutes === null
      || !Number.isFinite(entry.spinRpm) || entry.spinRpm < 0 || !Number.isFinite(entry.spinMinutes) || entry.spinMinutes < 0)) return fallback('Load, capacity, care or washer extraction context is incomplete; baseline only.')
  if (!options.enabled) return fallback('Personal result influence is disabled; baseline only.')
  const current = observations.filter((row) => row.completedAt > options.resetAt && row.completedAt <= options.now)
  const comparable = current.filter((row) => row.contextKey === context.key)
  const eligible = comparable.filter((row) => row.completedAt >= options.now - 180 * 24 * 60 * 60_000)
  if (comparable.some((row) => ['worse', 'damage', 'irritation'].includes(row.result ?? '')) || options.negativeHistoryTruncated) {
    return result(null, 'unavailable', 'A comparable negative result needs reassessment, or negative history could not be fully checked. No duration refinement is offered. Use the machine’s display, follow recorded care and check for dryness.')
  }
  if (options.historyTruncated) return fallback('Comparable history is incomplete; baseline only.')
  // One run may combine washes, and one wash may split between runs. Either correlation prevents
  // those rows from becoming multiple independent observations. Unknown/negative rows also reserve
  // their wash IDs, so filtering positive results cannot turn a correlated split into evidence.
  const runs = new Map<string, ComparableDryerOutcome[]>()
  for (const row of eligible) runs.set(row.runId, [...(runs.get(row.runId) ?? []), row])
  const washRuns = new Map<string, Set<string>>()
  for (const row of current) for (const washId of row.washIds) washRuns.set(washId, new Set([...(washRuns.get(washId) ?? []), row.runId]))
  const independent = [...runs.values()].filter((rows) => rows.every((row) => row.washIds.length > 0 && row.washIds.every((id) => washRuns.get(id)?.size === 1)
    && (row.result === 'improved' || row.result === 'unchanged') && Number.isInteger(row.minutes) && row.minutes > 0 && row.minutes <= 300
    && row.minutes === rows[0]!.minutes))
  if (independent.length < 3) return fallback('Fewer than three independent comparable drying outcomes from the last 180 days are recorded; baseline only.')
  const durations = independent.map((rows) => rows[0]!.minutes).sort((a, b) => a - b)
  const midpoint = Math.floor(durations.length / 2)
  const minutes = durations.length % 2 === 0 ? Math.round((durations[midpoint - 1]! + durations[midpoint]!) / 2) : durations[midpoint]!
  return result(minutes, 'comparable_outcomes', `Starting point from ${independent.length} independent comparable drying outcomes in the last 180 days (${durations[0]}–${durations.at(-1)} min entered across machine starts). Load size and remaining moisture can still vary. This does not predict dryness. Enter the machine’s displayed time and check the clothes.`, independent.length)
}
