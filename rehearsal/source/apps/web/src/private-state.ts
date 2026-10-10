/**
 * The only private data this device keeps: one planning draft, a projection of each running load,
 * the Closet's remembered chips, where the app opens and where the household washes. None holds
 * credentials, tokens, or photos, and all are purged on sign-out or loss of household access.
 * Server state always wins on reconnect.
 */
import type { TreatmentStep } from '@washcloset/planner'
import { markFractionProblem } from '@washcloset/planner'
import type { PrivateCare } from '@convex/access'

type ProjectedTextile = { readonly textileId: string; readonly name: string | null; readonly color?: string | null; readonly private?: boolean; readonly privateCare?: PrivateCare | null }

const prefix = 'washcloset:private:'
const draftKey = `${prefix}draft`
/** Older versions kept a single projection here; it is read once and folded into the per-load copies. */
const legacySessionKey = `${prefix}session`
const sessionsKey = `${prefix}sessions`
const chipsKey = `${prefix}closet-chips`
const landingKey = `${prefix}landing`
const washPlaceKey = `${prefix}wash-place`
const maxActions = 30
const maxTextiles = 60
const maxSelection = 200
const maxMarks = 12
/** Running loads kept offline; the most recently saved win. */
const maxSessions = 8

export type PlanningDraft = {
  readonly householdId: string
  readonly selectedTextileIds: readonly string[]
  /** Dirty garments the person had seen when saving, so newly dirty ones can default to selected. */
  readonly seenTextileIds: readonly string[]
  readonly planId: string | null
  readonly inputHash: string | null
  readonly savedAt: number
}

export type ProjectedDose = {
  readonly amount: number
  readonly unit: string
  readonly measurementCue?: string
  /** The printed mark, the product's marks and the printed volume, so the cap still reads offline. */
  readonly mark?: string
  readonly fractionOfMark?: number
  readonly target?: 'below' | 'just_below'
  readonly approximate?: boolean
  readonly marks?: readonly string[]
  readonly equivalent?: { readonly amount: number; readonly unit: string }
}

export type ProjectedAction = {
  readonly id: string
  readonly kind: 'treatment' | 'task'
  readonly task: 'care_preparation' | 'garment_advice' | 'load' | 'drum_fullness' | 'close' | 'start' | 'hold_out' | 'dryer_load' | 'dryer_fullness' | 'dryer_start' | 'dryer_unload' | undefined
  readonly advice?: { readonly tipId: 'inside_out'; readonly scope: 'manufacturer_print_method' | 'general_graphic'; readonly reason: string; readonly source: string; readonly policyVersion: string }
  readonly phase: string | undefined
  readonly order: number
  readonly title: string | undefined
  readonly detail: string | null
  readonly supplyName: string | null
  readonly textileId?: string
  readonly textileName?: string | null
  readonly temperatureC?: number | null
  readonly soak?: TreatmentStep['soak']
  readonly soakStarted?: { readonly at: number; readonly waterLitres: number; readonly temperatureC: number; readonly productName: string; readonly amount: number }
  readonly dose: ProjectedDose | null
  readonly placement: string | null
  readonly stage: string | null
  readonly timing: string | null
  readonly dueAt: number | null
  readonly status: string
  readonly basis: string | null
  readonly reusable: boolean
  /** The garments a drying step names, with how each dries when it stays out. */
  readonly garments: ReadonlyArray<{ readonly textileId: string; readonly method: string | null }>
}

export type ProjectedDrying = {
  readonly status: string
  readonly dryerName: string | null
  readonly heat: string | null
  readonly heatLabel: string | null
  readonly minutes: number | null
  readonly minutesConfidence: string
  readonly startedAt: number | null
  readonly readyAt: number | null
  readonly readyEstimated: boolean
  readonly tumbleCount: number
  readonly heldOut: ReadonlyArray<{ readonly textileId: string; readonly name: string | null; readonly color: string | null; readonly method: string; readonly reason: string }>
}

export type SessionProjection = {
  readonly sessionId: string
  readonly householdId: string
  readonly status: string
  /** Server session revision this projection reflects; a newer server revision always replaces it. */
  readonly revision: number
  readonly machineName: string | null
  readonly startedAt: number | null
  /** When the Start step was recorded; the finish time counts from here. */
  readonly machineStartedAt: number | null
  readonly cycleMinutes: number | null
  readonly doorLocks: boolean
  /** The wash finish by the recorded cycle length. */
  readonly estimatedFinishAt: number | null
  readonly finishConfidence: string
  /** When the person said the wash finished. Copies saved before drying read null. */
  readonly washFinishedAt: number | null
  readonly drying: ProjectedDrying | null
  readonly textiles: ReadonlyArray<ProjectedTextile>
  readonly actions: readonly ProjectedAction[]
  readonly savedAt: number
}

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

function read<Value>(key: string, valid: (value: any) => boolean): Value | null {
  try {
    const raw = storage()?.getItem(key)
    if (raw === null || raw === undefined) return null
    const value = JSON.parse(raw)
    return valid(value) ? (value as Value) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown): void {
  try {
    storage()?.setItem(key, JSON.stringify(value))
  } catch {
    // Storage may be full or blocked; the server remains the source of truth.
  }
}

export function saveDraft(draft: Omit<PlanningDraft, 'savedAt'>): void {
  write(draftKey, {
    ...draft,
    selectedTextileIds: draft.selectedTextileIds.slice(0, maxSelection),
    seenTextileIds: draft.seenTextileIds.slice(0, maxSelection),
    savedAt: Date.now(),
  })
}

export function loadDraft(householdId: string): PlanningDraft | null {
  const draft = read<PlanningDraft>(draftKey, (value) => typeof value?.householdId === 'string' && Array.isArray(value.selectedTextileIds) && Array.isArray(value.seenTextileIds))
  return draft?.householdId === householdId ? draft : null
}

const text = (value: unknown): string | null => (typeof value === 'string' ? value : null)
const number = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null)

/** Offline copies retain only the care needed to handle a hidden piece. Malformed care stays unknown. */
function projectedTextile(piece: ProjectedTextile): ProjectedTextile {
  const care = piece.privateCare
  const valid = care != null && ['machine', 'hand_wash', 'dry_clean_only', 'do_not_wash', 'unknown'].includes(care.washMethod)
    && ['line_dry', 'drip_dry', 'dry_flat', 'do_not_tumble_dry', 'tumble_dry', 'unknown'].includes(care.dryMethod)
    && ['any', 'none', 'non_chlorine', 'unknown'].includes(care.bleach)
    && (care.dryHeat === null || ['no_heat', 'delicate', 'low', 'medium', 'high'].includes(care.dryHeat ?? ''))
    && (care.cycle === null || typeof care.cycle === 'string') && (care.maxTemperatureC === null || number(care.maxTemperatureC) !== null)
    && Array.isArray(care.restrictions) && care.restrictions.every((line) => typeof line === 'string')
    && Array.isArray(care.lines) && care.lines.every((line) => typeof line === 'string')
  return { textileId: piece.textileId, name: piece.private ? null : piece.name, color: piece.private ? null : text(piece.color),
    ...(piece.private ? { private: true, privateCare: valid ? { washMethod: care.washMethod, cycle: care.cycle, maxTemperatureC: care.maxTemperatureC, dryMethod: care.dryMethod, dryHeat: care.dryHeat, bleach: care.bleach, restrictions: care.restrictions, lines: care.lines } : null } : {}) }
}

/** Only the dose fields the checklist prints; anything else on the step stays on the server. */
function projectedSoak(action: { soak?: ProjectedAction['soak']; soakStarted?: ProjectedAction['soakStarted'] }): Pick<ProjectedAction, 'soak' | 'soakStarted'> {
  const soak = action.soak
  if (soak === undefined || ![soak.waterLitres, soak.minimumMinutes, soak.maximumMinutes, soak.maximumTemperatureC].every(Number.isFinite) || typeof soak.transfer !== 'string') return {}
  const started = action.soakStarted
  return { soak: { ...soak, transfer: soak.transfer.slice(0, 300) }, ...(started === undefined || ![started.at, started.waterLitres, started.temperatureC, started.amount].every(Number.isFinite) || typeof started.productName !== 'string' ? {} : { soakStarted: { ...started, productName: started.productName.slice(0, 200) } }) }
}

function projectedDose(dose: any): ProjectedDose | null {
  if (typeof dose !== 'object' || dose === null || number(dose.amount) === null || text(dose.unit) === null) return null
  if (markFractionProblem(dose) !== null) return null
  if (dose.target !== undefined && (dose.target !== 'below' && dose.target !== 'just_below' || dose.unit !== 'cap' || text(dose.mark) === null || dose.amount !== 1 || dose.fractionOfMark !== undefined || dose.approximate !== undefined)) return null
  if (dose.approximate !== undefined && (dose.approximate !== true || dose.unit !== 'US_cup')) return null
  const equivalent = dose.target === undefined && dose.approximate === undefined && (dose.fractionOfMark === undefined || dose.fractionOfMark === 1) && typeof dose.equivalent === 'object' && dose.equivalent !== null && number(dose.equivalent.amount) !== null && text(dose.equivalent.unit) !== null
    ? { amount: dose.equivalent.amount as number, unit: dose.equivalent.unit as string } : null
  return {
    amount: dose.amount,
    unit: dose.unit,
    ...(text(dose.measurementCue) === null ? {} : { measurementCue: dose.measurementCue }),
    ...(text(dose.mark) === null ? {} : { mark: dose.mark }),
    ...(dose.fractionOfMark === undefined ? {} : { fractionOfMark: dose.fractionOfMark }),
    ...(dose.target === undefined ? {} : { target: dose.target }),
    ...(dose.approximate === undefined ? {} : { approximate: dose.approximate }),
    ...(Array.isArray(dose.marks) ? { marks: dose.marks.filter((mark: unknown) => typeof mark === 'string').slice(0, maxMarks) } : {}),
    ...(equivalent === null ? {} : { equivalent }),
  }
}

function projectedAdvice(value: unknown): Pick<ProjectedAction, 'advice'> {
  if (typeof value !== 'object' || value === null) return {}
  const advice = value as Record<string, unknown>
  if (advice.tipId !== 'inside_out' || advice.scope !== 'manufacturer_print_method' && advice.scope !== 'general_graphic' || typeof advice.reason !== 'string' || typeof advice.source !== 'string' || typeof advice.policyVersion !== 'string') return {}
  return { advice: { tipId: advice.tipId, scope: advice.scope, reason: advice.reason.slice(0, 1000), source: advice.source.slice(0, 500), policyVersion: advice.policyVersion.slice(0, 40) } }
}

function projectedDrying(drying: any): ProjectedDrying | null {
  if (typeof drying !== 'object' || drying === null) return null
  return {
    status: String(drying.status),
    dryerName: text(drying.dryerName),
    heat: text(drying.heat),
    heatLabel: text(drying.heatLabel),
    minutes: number(drying.minutes),
    minutesConfidence: String(drying.minutesConfidence ?? 'unknown'),
    startedAt: number(drying.startedAt),
    readyAt: number(drying.readyAt),
    readyEstimated: drying.readyEstimated === true,
    tumbleCount: number(drying.tumbleCount) ?? 0,
    heldOut: (Array.isArray(drying.heldOut) ? drying.heldOut : []).slice(0, maxTextiles).map((held: any) => ({
      textileId: String(held.textileId),
      name: text(held.name),
      color: text(held.color),
      method: String(held.method),
      reason: String(held.reason),
    })),
  }
}

export function saveSessionProjection(detail: {
  sessionId: string
  householdId: string
  status: string
  revision: number
  machineName: string | null
  startedAt: number | null
  machineStartedAt: number | null
  cycleMinutes: number | null
  doorLocks: boolean
  estimatedFinishAt: number | null
  finishConfidence: string
  washFinishedAt?: number | null
  drying?: Record<string, any> | null
  textiles: ReadonlyArray<ProjectedTextile>
  actions: ReadonlyArray<Record<string, any>>
}): void {
  if (detail.status !== 'running') {
    clearSessionProjection(detail.sessionId)
    return
  }
  const projection = {
    sessionId: detail.sessionId,
    householdId: detail.householdId,
    status: detail.status,
    revision: detail.revision,
    machineName: detail.machineName,
    startedAt: detail.startedAt,
    machineStartedAt: detail.machineStartedAt,
    cycleMinutes: detail.cycleMinutes,
    doorLocks: detail.doorLocks === true,
    estimatedFinishAt: detail.estimatedFinishAt,
    finishConfidence: String(detail.finishConfidence),
    washFinishedAt: number(detail.washFinishedAt),
    drying: projectedDrying(detail.drying),
    textiles: detail.textiles.slice(0, maxTextiles).map(projectedTextile),
    actions: detail.actions.slice(0, maxActions).map((action, index) => ({
      id: String(action.id),
      kind: action.kind === 'task' ? 'task' : 'treatment',
      task: action.task,
      phase: action.phase,
      order: typeof action.order === 'number' ? action.order : index,
      title: action.title,
      detail: action.detail ?? null,
      ...projectedAdvice(action.advice),
      supplyName: action.supplyName ?? null,
      ...(typeof action.textileId !== 'string' ? {} : { textileId: action.textileId, textileName: text(action.textileName), temperatureC: number(action.temperatureC) }),
      dose: projectedDose(action.dose),
      ...projectedSoak(action),
      placement: action.placement ?? null,
      stage: action.stage ?? null,
      timing: action.timing ?? null,
      dueAt: action.dueAt ?? action.windowStartAt ?? null,
      status: String(action.status),
      basis: text(action.basis),
      reusable: action.reusable === true,
      garments: (Array.isArray(action.garments) ? action.garments : []).slice(0, maxTextiles).map((garment: any) => ({ textileId: String(garment.textileId), method: text(garment.method) })),
    })),
    savedAt: Date.now(),
  } satisfies SessionProjection
  writeProjections([projection, ...loadProjections().filter((saved) => saved.sessionId !== projection.sessionId)])
}

/** Copies saved by an older version of the app lack the drying fields; they read as none. */
function withDefaults(projection: SessionProjection): SessionProjection {
  return {
    ...projection,
    washFinishedAt: projection.washFinishedAt ?? null,
    drying: projection.drying ?? null,
    textiles: projection.textiles.map(projectedTextile),
    actions: projection.actions.map(({ advice, ...action }) => ({ ...action, ...projectedAdvice(advice), basis: action.basis ?? null, reusable: action.reusable ?? false, garments: action.garments ?? [] })),
  }
}

const validProjection = (value: any) => typeof value?.sessionId === 'string' && typeof value.revision === 'number' && Array.isArray(value.actions) && Array.isArray(value.textiles)

/** Every running load's saved copy, newest first, including one left by an older version of the app. */
function loadProjections(): SessionProjection[] {
  const saved = read<unknown[]>(sessionsKey, Array.isArray) ?? []
  const legacy = read<SessionProjection>(legacySessionKey, validProjection)
  const projections = [...saved.filter(validProjection), ...(legacy === null ? [] : [legacy])] as SessionProjection[]
  return projections
    .filter((projection, index) => projection.status === 'running' && projections.findIndex((other) => other.sessionId === projection.sessionId) === index)
    .sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0))
}

/** Keeps the newest few running loads and retires the older single-copy key. */
function writeProjections(projections: readonly SessionProjection[]): void {
  const kept = projections.filter((projection) => projection.status === 'running').slice(0, maxSessions)
  try {
    if (kept.length === 0) storage()?.removeItem(sessionsKey)
    else storage()?.setItem(sessionsKey, JSON.stringify(kept))
    storage()?.removeItem(legacySessionKey)
  } catch {
    // Storage may be full or blocked; the server remains the source of truth.
  }
}

/** This load's saved copy, or with no id the most recently saved running load. */
export function loadSessionProjection(sessionId?: string): SessionProjection | null {
  const projections = loadProjections()
  const projection = sessionId === undefined ? projections[0] : projections.find((saved) => saved.sessionId === sessionId)
  return projection === undefined ? null : withDefaults(projection)
}

/**
 * What the offline screen shows: on a load's own page only that load's copy (never another load's
 * steps under its address), elsewhere the newest; and every other saved load, to open instead.
 */
export function offlineSessionCopies(sessionId?: string): { projection: SessionProjection | null; others: SessionProjection[] } {
  const projections = loadProjections().map(withDefaults)
  const projection = (sessionId === undefined ? projections[0] : projections.find((saved) => saved.sessionId === sessionId)) ?? null
  return { projection, others: projections.filter((saved) => saved !== projection) }
}

/** Forgets one load's copy, or with no id every load's. */
export function clearSessionProjection(sessionId?: string): void {
  const projections = loadProjections()
  if (sessionId !== undefined && !projections.some((saved) => saved.sessionId === sessionId)) return
  writeProjections(sessionId === undefined ? [] : projections.filter((saved) => saved.sessionId !== sessionId))
}

/** Who and what the Closet shows: everyone, the signed-in person's own clothes, or one wearer's. */
export type ClosetWearerChip = 'everyone' | 'me' | 'shared' | { readonly wearerId: string }

/** The Closet's first two chip rows, remembered on this device for one household. */
export type ClosetChips = {
  readonly householdId: string
  readonly wearer: ClosetWearerChip
  /** An occasion value such as 'work', or 'any'. */
  readonly occasion: string
  readonly clothingType?: string
  readonly clothingTypes?: string[]
  readonly tags?: string[]
}

const validWearer = (value: any) => value === 'everyone' || value === 'me' || value === 'shared' || (typeof value?.wearerId === 'string' && value.wearerId.length > 0 && value.wearerId.length <= 64)

export function saveClosetChips(chips: ClosetChips): void {
  const wearer = typeof chips.wearer === 'string' ? chips.wearer : { wearerId: chips.wearer.wearerId }
  write(chipsKey, { householdId: chips.householdId, wearer, occasion: chips.occasion.slice(0, 32), ...(chips.clothingType === undefined ? {} : { clothingType: chips.clothingType.slice(0, 32) }), ...(chips.clothingTypes === undefined ? {} : { clothingTypes: chips.clothingTypes.slice(0, 18).map((kind) => kind.slice(0, 32)) }), ...(chips.tags === undefined ? {} : { tags: chips.tags.slice(0, 12).map((tag) => tag.slice(0, 32)) }) })
}

/** The remembered chips for this household, or null: another household's choice never carries over. */
export function loadClosetChips(householdId: string): ClosetChips | null {
  const chips = read<ClosetChips>(chipsKey, (value) => typeof value?.householdId === 'string' && validWearer(value.wearer) && typeof value.occasion === 'string' && (value.clothingType === undefined || typeof value.clothingType === 'string') && (value.clothingTypes === undefined || (Array.isArray(value.clothingTypes) && value.clothingTypes.length <= 18 && value.clothingTypes.every((kind: unknown) => typeof kind === 'string' && kind.length <= 32))) && (value.tags === undefined || (Array.isArray(value.tags) && value.tags.length <= 12 && value.tags.every((tag: unknown) => typeof tag === 'string' && tag.length <= 32))))
  return chips?.householdId === householdId ? chips : null
}

/** Where the app opens: the Closet unless the person chose to start with the hamper. */
export type Landing = 'laundry'

export function saveLanding(landing: Landing): void {
  write(landingKey, landing)
}

export function loadLanding(): Landing | null {
  return read<Landing>(landingKey, (value) => value === 'laundry')
}

export function clearLanding(): void {
  try {
    storage()?.removeItem(landingKey)
  } catch {
    // Nothing to clear.
  }
}

/** First run's "Where do you wash?", kept on this device as the starting answer for a new washer or dryer. */
export type WashPlace = 'home' | 'shared' | 'laundromat' | 'both'

export function saveWashPlace(householdId: string, place: WashPlace): void {
  write(washPlaceKey, { householdId, place })
}

/** This household's answer, or null: another household's answer never carries over. */
export function loadWashPlace(householdId: string): WashPlace | null {
  const saved = read<{ householdId: string; place: WashPlace }>(washPlaceKey, (value) => typeof value?.householdId === 'string' && ['home', 'shared', 'laundromat', 'both'].includes(value.place))
  return saved?.householdId === householdId ? saved.place : null
}

/** Household's section is carried by its URL. */
export type HouseholdSection = 'machines' | 'bottles' | 'people'

/** Removes every private key this app has written on this device. */
export function purgePrivateState(): void {
  const store = storage()
  if (store === null) return
  try {
    for (const key of Object.keys(store)) if (key.startsWith(prefix)) store.removeItem(key)
  } catch {
    // Blocked storage has nothing of ours in it.
  }
}
