import { requirementCheck, type AtMachineCandidate, type CareEvidence, type Dose, type MachineEvidence, type PlannerInput, type ProfileRequirements, type SupplyItem, type TreatmentStep } from './index.ts'
import { careConfirmed, careRestrictionText } from './care.ts'
import { materialCareProblem } from './material-care.ts'
import { careProcessRequirements, careProductAllowed } from './care-process.ts'
import { evidencePolicy, evidenceStatus, supplyLabelUsable } from './evidence.ts'
import { machineCapacity } from './physical.ts'
import { atMachineDose, dismissedAnswer, doseBySize, doseContextSnapshot, doseEquivalent, excludedSupply, markDose, markLabels, rulesForSupply, type DoseContext, type MissingInput } from './rules.ts'
import { chooseDryerSetting, documentedHeatSettings, type DryerSettingNote } from './dryer-setting.ts'
import { dryMethods, dryerHeats, dryerSupplyKinds, heatRank, reusableSupplyKinds, type DryerHeat, type LoadSize } from './vocabulary.ts'

/** A checked program time is a starting point, never a prediction of dryness. */
export function dryerTimeSuggestion(baseline: { durationMinutes: number; confidence: string } | null | undefined): { minutes: number | null; basis: 'recorded_program' | 'unknown'; uncertainty: string } {
  if (baseline === null || baseline === undefined || !Number.isInteger(baseline.durationMinutes) || baseline.durationMinutes < 1 || baseline.durationMinutes > 300 || !['observed', 'verified'].includes(baseline.confidence)) {
    return { minutes: null, basis: 'unknown', uncertainty: 'No checked program time is recorded. Use the minutes the dryer shows and check the clothes for dryness.' }
  }
  return { minutes: baseline.durationMinutes, basis: 'recorded_program', uncertainty: 'Starting point from this dryer’s recorded program. Load size, remaining moisture and the chosen heat can change drying time. Use the machine’s display and check for dryness.' }
}

export type HoldOutMethod = 'line_dry' | 'dry_flat' | 'drip_dry' | 'do_not_tumble_dry' | 'unknown'
/** `stain`: a stain was noted or treated in this wash, and dryer heat would set whatever is left of it. */
export type HoldOutReason = 'care_label' | 'drying_unknown' | 'heat_unavailable' | 'stain'

export interface DryingHoldOut {
  readonly textileId: string
  readonly method: HoldOutMethod
  readonly reason: HoldOutReason
}

/** `left_out`: the person left the product out of this pass. */
export type DryingOmissionCause = 'insufficient_product_evidence' | 'no_rule' | 'needs_input' | 'conflict' | 'invalid_dose' | 'garment_restriction' | 'left_out' | 'profile_requirement' | 'profile_requirement_unknown'

export interface DryingOmission {
  readonly supplyId: string
  readonly cause: DryingOmissionCause
}

/** `fits`/`over`: checked against a known capacity. `not_checked`: the capacity is unknown. */
export type DryerFit = 'fits' | 'over' | 'not_checked'

/** How the garments compare with a dryer's recorded capacity; an unknown capacity is never unlimited. */
export function dryerFit(bulkUnits: number, capacityUnits: number | null): DryerFit {
  if (capacityUnits === null) return 'not_checked'
  return bulkUnits > capacityUnits ? 'over' : 'fits'
}

export interface DryingPlan {
  /** `none`: every garment is held out. `needs_confirmation`: hang everything until it is confirmed. */
  readonly status: 'ready' | 'needs_confirmation' | 'none'
  readonly dryerId: string | null
  readonly heat: DryerHeat | null
  /** The dryer's own words for that heat, as printed on its button. */
  readonly heatLabel: string | null
  /** Set when the dryer's low button may run hotter than a low tag allows. */
  readonly heatNote?: DryerSettingNote
  readonly tumbleTextileIds: readonly string[]
  readonly bulkUnits: number
  readonly capacityUnits: number | null
  /**
   * Whether the tumbling garments were checked against the dryer's drum. `not_checked` when the
   * dryer's capacity is unknown: the fit is never assumed, and the dryer is never treated as unlimited.
   */
  readonly fit: DryerFit
  /** Always null: a dryer product's size is read off the dryer at the machine. */
  readonly loadSize: LoadSize | null
  readonly heldOut: readonly DryingHoldOut[]
  /** Dryer products: stage `dry`, placement `dryer_drum`; a dose that depends on the size is chosen at the machine. */
  readonly treatments: readonly TreatmentStep[]
  readonly omitted: readonly DryingOmission[]
}

/** `label_row_needed`: a dryer product's label has no saved row; it stays out until one is read. Never blocks the wash. */
export interface DryingNote {
  readonly cause: 'no_dryer' | 'dryer_evidence' | 'held_out' | 'drying_unknown' | 'heat_unavailable' | 'dryer_capacity' | 'product_omitted' | 'label_row_needed'
  readonly textileIds: readonly string[]
  readonly supplyId?: string
  readonly machineId?: string
  readonly method?: HoldOutMethod
  readonly reason?: HoldOutReason
  readonly omission?: DryingOmissionCause
  readonly missing?: MissingInput
  readonly stage?: 'dryer'
}

export interface DryingLoadInput {
  readonly id: string
  readonly items: readonly {
    readonly id: string
    readonly bulkUnits: number
    readonly care: CareEvidence | null | undefined
    readonly material: string | null
    /** A stain on this garment is noted or treated in this wash. */
    readonly stained?: boolean
    /** The wearer's product requirements (see `requirementCheck`). */
    readonly requirements?: ProfileRequirements | null
  }[]
  readonly preferredDryerId?: string
}

/** `rush`: Wash now, which dries at the lowest heated setting the dryer offers. */
export interface DryingOptions {
  readonly rush?: boolean
}

type Garment = DryingLoadInput['items'][number]
type Candidate = { readonly garment: Garment; readonly maxHeat: DryerHeat }


function dryerHeat(value: unknown): DryerHeat | null {
  return typeof value === 'string' && (dryerHeats as readonly string[]).includes(value) ? value as DryerHeat : null
}

// Label wording that rules out the dryer. It can only prohibit tumbling, never permit it.
const noTumblePattern = /do not (tumble|machine) dry|(lay )?flat to dry|dry flat|line dry|hang (to )?dry|drip dry/

function restrictedMethod(text: string): HoldOutMethod | null {
  if (!noTumblePattern.test(text)) return null
  if (/flat/.test(text)) return 'dry_flat'
  if (/line dry|hang/.test(text)) return 'line_dry'
  if (/drip dry/.test(text)) return 'drip_dry'
  return 'do_not_tumble_dry'
}

/**
 * How one garment may dry, by its confirmed care alone: the hottest dryer heat its label allows, or
 * why it hangs. The drying queue plans dryer loads from this, outside any one wash.
 */
export function tumbleCeiling(garment: Garment): { readonly maxHeat: DryerHeat } | { readonly method: HoldOutMethod; readonly reason: HoldOutReason } {
  const decision = garmentDecision(garment)
  return 'garment' in decision ? { maxHeat: decision.maxHeat } : { method: decision.method, reason: decision.reason }
}

function garmentDecision(garment: Garment): Candidate | DryingHoldOut {
  const hold = (method: HoldOutMethod, reason: HoldOutReason): DryingHoldOut => ({ textileId: garment.id, method, reason })
  if (materialCareProblem(garment.material, garment.care) !== null) return hold('unknown', 'drying_unknown')
  const restricted = restrictedMethod(careRestrictionText(garment.care))
  if (restricted !== null) return hold(restricted, 'care_label')
  const method = garment.care?.dryMethod
  if (!careConfirmed(garment.care)) return hold('unknown', 'drying_unknown')
  const requirements = careProcessRequirements(garment.care?.instructions, 'drying').requirements
  if (requirements.some((entry) => entry.kind === 'dry_flat')) return hold('dry_flat', 'care_label')
  if (requirements.some((entry) => ['line_dry', 'drip_dry', 'shade', 'no_direct_heat'].includes(entry.kind))) return hold(method === 'dry_flat' ? 'dry_flat' : 'line_dry', 'care_label')
  if (typeof method !== 'string' || method === 'unknown' || !(dryMethods as readonly string[]).includes(method)) return hold('unknown', 'drying_unknown')
  if (method !== 'tumble_dry') return hold(method as HoldOutMethod, 'care_label')
  // A tumble-dry symbol without dots allows any heat; an unreadable heat is not a heat.
  const maxHeat = garment.care?.dryHeat === undefined || garment.care.dryHeat === null ? 'high' : dryerHeat(garment.care.dryHeat)
  if (maxHeat === null) return hold('unknown', 'drying_unknown')
  if (garment.stained === true) return hold('line_dry', 'stain')
  return { garment, maxHeat }
}

function heatSettings(dryer: MachineEvidence): { heat: DryerHeat; label: string; tempF?: number }[] {
  const settings: { heat: DryerHeat; label: string }[] = []
  for (const setting of dryer.heatSettings ?? []) {
    const heat = dryerHeat(setting?.heat)
    if (heat === null || typeof setting.label !== 'string' || setting.label.trim().length === 0) continue
    if (!settings.some((entry) => entry.heat === heat)) settings.push({ heat, label: setting.label })
  }
  // Temperatures come from the exact model's spec sheet only; a stored or typed value is ignored.
  return documentedHeatSettings(dryer.modelId ?? dryer.modelNumber, settings).sort((left, right) => heatRank(left.heat) - heatRank(right.heat))
}

function dryerUsable(dryer: MachineEvidence): boolean {
  return dryer.available !== false
    && dryer.availability !== 'offline'
    && dryer.availability !== 'unknown'
    && evidencePolicy.machineUsable(evidenceStatus(dryer.evidence))
    && heatSettings(dryer).length > 0
}

/** A capacity recorded with unknown confidence says nothing about the drum. */
function dryerCapacity(dryer: MachineEvidence): number | null {
  return dryer.capacityConfidence === 'unknown' ? null : machineCapacity(dryer)
}

function byId<Value extends { readonly id: string }>(left: Value, right: Value): number {
  return left.id.localeCompare(right.id)
}

/**
 * Whether one dryer product goes in with these tumbling garments, and at what dose: only on its read
 * label's dose, chosen at the machine when it depends on how full the dryer is. A dryer sheet stays out
 * when any garment's care rules out softener or dryer sheets. Shared by wash plans and the drying queue.
 */
export function dryerSupplyUse(
  supply: SupplyItem,
  tumble: readonly DryingLoadInput['items'][number][],
  input: PlannerInput,
  dryerId: string,
): { readonly treatment?: TreatmentStep; readonly omission?: DryingOmission; readonly note?: DryingNote } {
  const textileIds = tumble.map((garment) => garment.id)
  const noSheets = tumble.some((garment) => /softener|dryer sheet/.test(careRestrictionText(garment.care)))
  const omit = (cause: DryingOmissionCause, missing?: MissingInput) => ({
    omission: { supplyId: supply.id, cause },
    note: { cause: 'product_omitted' as const, textileIds, supplyId: supply.id, omission: cause, ...(missing === undefined ? {} : { missing }) },
  })
  // No soil or HE column applies in the dryer; the size is read off the dryer at the machine.
  const ctx: DoseContext = {
    bulkUnits: null,
    loadSize: null,
    soilLevel: null,
    unrecordedSoil: false,
    applianceType: 'tumble_dryer',
    machineClasses: ['tumble_dryer'],
    washerClassKnown: true,
    cycles: new Set(),
    materials: new Set(tumble.map((garment) => garment.material).filter((material): material is string => typeof material === 'string')),
    odorLevel: null,
    waterCondition: null,
  }
  if (excludedSupply(input, supply.id)) return omit('left_out')
  if (!supplyLabelUsable(supply)) return omit('insufficient_product_evidence')
  if (supply.kind === 'dryer_sheet' && noSheets) return omit('garment_restriction')
  if (tumble.some((garment) => !careProductAllowed(garment.care?.instructions, supply))) return omit('garment_restriction')
  const required = requirementCheck(supply, tumble.map((garment) => garment.requirements))
  if (required.status !== 'ok') return omit(required.status === 'conflict' ? 'profile_requirement' : 'profile_requirement_unknown')
  const rules = rulesForSupply(supply, input)
  const sized = doseBySize(rules, ctx, supply.measurement)
  const reusable = (reusableSupplyKinds as readonly string[]).includes(supply.kind ?? '') ? { reusable: true } : {}
  const step = (dose: Dose, timing: string | null | undefined, source: string | undefined, chosen: Partial<TreatmentStep>, rationale: string): TreatmentStep => ({
    supplyId: supply.id,
    dose,
    measurementCue: dose.measurementCue ?? null,
    stage: 'dry',
    placement: 'dryer_drum',
    timing: timing ?? 'before starting the dryer',
    rationale,
    source: source ?? supply.labelEvidence?.source ?? supply.label?.source ?? 'verified-product-label',
    confirmation: 'confirmed',
    ...chosen,
    ...reusable,
  })
  const atMachine = (candidates: readonly AtMachineCandidate[]) => ({ atMachine: { machine: 'dryer' as const, context: doseContextSnapshot(ctx), candidates } })
  const atMachineRationale = `Add ${supply.id} to the dryer at the label's dose for how full the dryer is.`
  switch (sized.kind) {
    case 'needs_input':
      return omit('needs_input', sized.selection.kind === 'needs_input' ? sized.selection.missing : undefined)
    case 'conflict':
    case 'invalid_dose':
      return omit(sized.kind)
    case 'none': {
      const answer = dismissedAnswer(input, 'label_row', supply.id, { soilLevel: null, washerClass: null })
      if (answer === 'depends_on_size') return { treatment: step(atMachineDose, supply.defaults?.timing, undefined, atMachine([]), atMachineRationale) }
      if (answer === 'label_doesnt_say') return omit('no_rule')
      return { omission: { supplyId: supply.id, cause: 'no_rule' }, note: { cause: 'label_row_needed', textileIds, supplyId: supply.id, machineId: dryerId, stage: 'dryer' } }
    }
    case 'resolved': {
      const { rule, dose, basis } = sized.selection
      return { treatment: step(dose, rule.timing, rule.evidence?.source, {
        ruleId: rule.id,
        basis,
        measurementCue: dose.measurementCue ?? rule.measurementCue ?? null,
        ...(markDose(dose) ? { marks: markLabels(supply.measurement), equivalent: doseEquivalent(dose, supply.measurement) } : {}),
      }, `Add ${supply.id} to the dryer using the label-backed rule.`) }
    }
    case 'at_machine':
      return { treatment: step(atMachineDose, sized.rule?.timing ?? supply.defaults?.timing, sized.rule?.evidence?.source, atMachine(sized.candidates), atMachineRationale) }
  }
}

/**
 * Whether and how a washed load goes in the dryer. Drying never blocks the wash; it fails closed
 * to hanging. A garment tumbles only on confirmed care that says tumble dry and a heat the dryer
 * offers at or below the label's maximum; a dryer product goes in only on its read label's dose,
 * chosen at the machine when it depends on how full the dryer is.
 */
export function planDrying(
  load: DryingLoadInput,
  input: PlannerInput,
  dryers: readonly MachineEvidence[],
  supplies: readonly SupplyItem[],
  options: DryingOptions = {},
): { drying: DryingPlan | null; notes: DryingNote[] } {
  if (dryers.length === 0) return { drying: null, notes: [] }
  const notes: DryingNote[] = []
  const heldOut: DryingHoldOut[] = []
  let candidates: Candidate[] = []
  for (const garment of [...load.items].sort(byId)) {
    const decision = garmentDecision(garment)
    if ('garment' in decision) candidates.push(decision)
    else heldOut.push(decision)
  }

  const usable = [...dryers].sort(byId).filter(dryerUsable)
  const dryer = usable.find((entry) => entry.id === load.preferredDryerId) ?? usable[0] ?? null
  // Wash now dries at the lowest heated setting only; air alone would not dry, so a no-heat-only dryer hangs everything.
  const settings = dryer === null ? [] : heatSettings(dryer).filter((entry) => options.rush !== true || entry.heat !== 'no_heat').slice(0, options.rush === true ? 1 : undefined)
  if (dryer !== null) {
    // No setting is cool enough, or every one is printed hotter than the tag allows: the piece air dries.
    const tooHot = candidates.filter((candidate) => settings.length === 0 || chooseDryerSetting(settings, candidate.maxHeat) === undefined)
    for (const candidate of tooHot) heldOut.push({ textileId: candidate.garment.id, method: 'line_dry', reason: 'heat_unavailable' })
    candidates = candidates.filter((candidate) => !tooHot.includes(candidate))
    if (tooHot.length > 0) notes.push({ cause: 'heat_unavailable', textileIds: tooHot.map((candidate) => candidate.garment.id), machineId: dryer.id })
  }
  heldOut.sort((left, right) => left.textileId.localeCompare(right.textileId))

  const groups = new Map<string, DryingHoldOut[]>()
  for (const entry of heldOut.filter((hold) => hold.reason === 'care_label' || hold.reason === 'stain' || hold.reason === 'drying_unknown')) {
    const key = `${entry.reason}:${entry.method}`
    groups.set(key, [...(groups.get(key) ?? []), entry])
  }
  for (const group of groups.values()) {
    const { reason, method } = group[0]!
    const textileIds = group.map((entry) => entry.textileId)
    notes.push(reason === 'drying_unknown' ? { cause: 'drying_unknown', textileIds } : { cause: 'held_out', textileIds, method, reason })
  }

  const tumble = candidates.map((candidate) => candidate.garment)
  const bulkUnits = tumble.reduce((total, garment) => total + garment.bulkUnits, 0)
  const empty = { treatments: [], omitted: [] }
  if (tumble.length === 0) {
    return { drying: { status: 'none', dryerId: dryer?.id ?? null, heat: null, heatLabel: null, tumbleTextileIds: [], bulkUnits: 0, capacityUnits: dryer === null ? null : dryerCapacity(dryer), fit: dryerFit(0, dryer === null ? null : dryerCapacity(dryer)), loadSize: null, heldOut, ...empty }, notes }
  }
  if (dryer === null) {
    notes.push({ cause: 'dryer_evidence', textileIds: load.items.map((garment) => garment.id).sort() })
    return { drying: { status: 'needs_confirmation', dryerId: null, heat: null, heatLabel: null, tumbleTextileIds: tumble.map((garment) => garment.id), bulkUnits, capacityUnits: null, fit: 'not_checked', loadSize: null, heldOut, ...empty }, notes }
  }

  // One heat for the whole load: the hottest the dryer offers that every tumbling garment allows.
  const ceiling = Math.min(...candidates.map((candidate) => heatRank(candidate.maxHeat)))
  const { setting, note: heatNote } = chooseDryerSetting(settings.filter((entry) => heatRank(entry.heat) <= ceiling), dryerHeats[ceiling]!)!
  const capacityUnits = dryerCapacity(dryer)
  const fit = dryerFit(bulkUnits, capacityUnits)
  const overCapacity = fit === 'over'
  if (overCapacity) notes.push({ cause: 'dryer_capacity', textileIds: tumble.map((garment) => garment.id), machineId: dryer.id })

  const treatments: TreatmentStep[] = []
  const omitted: DryingOmission[] = []
  for (const supply of supplies.filter((entry) => (dryerSupplyKinds as readonly string[]).includes(entry.kind ?? '')).sort(byId)) {
    const use = dryerSupplyUse(supply, tumble, input, dryer.id)
    if (use.treatment !== undefined) treatments.push(use.treatment)
    if (use.omission !== undefined) omitted.push(use.omission)
    if (use.note !== undefined) notes.push(use.note)
  }

  return {
    drying: {
      status: overCapacity ? 'needs_confirmation' : 'ready',
      dryerId: dryer.id,
      heat: setting.heat,
      heatLabel: setting.label,
      ...(heatNote === null ? {} : { heatNote }),
      tumbleTextileIds: tumble.map((garment) => garment.id),
      bulkUnits,
      capacityUnits,
      fit,
      loadSize: null,
      heldOut,
      treatments,
      omitted,
    },
    notes,
  }
}
