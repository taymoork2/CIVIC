/**
 * The shared laundry vocabulary. Convex builds its validators from these lists and the web
 * shows them, so each value is defined exactly once.
 */

/** How the evidence behind a record was obtained, from a read label down to nothing at all. */
export const evidenceLevels = ['verified', 'observed', 'user-supplied', 'estimated', 'unknown'] as const
export type EvidenceLevel = (typeof evidenceLevels)[number]

/** Unrecognized levels fail closed as unknown instead of passing a non-unknown check. */
export function evidenceLevel(value: unknown): EvidenceLevel {
  return typeof value === 'string' && (evidenceLevels as readonly string[]).includes(value) ? value as EvidenceLevel : 'unknown'
}

export const washMethods = ['machine', 'hand_wash', 'dry_clean_only', 'do_not_wash', 'unknown'] as const
export type WashMethod = (typeof washMethods)[number]

/** Where a product physically goes in the washer. */
export const placements = ['detergent_compartment', 'softener_compartment', 'bleach_compartment', 'direct_to_drum', 'center_agitator', 'downy_ball'] as const
export type Placement = (typeof placements)[number]

/** Placements that are dispenser slots (a front-loader's drawer), filled after the door is closed. */
export const compartmentPlacements = ['detergent_compartment', 'softener_compartment', 'bleach_compartment', 'center_agitator'] as const

/** Where a dryer product goes. Kept apart from `placements` so no washer slot can offer it. */
export const dryerPlacements = ['dryer_drum'] as const
export type DryerPlacement = (typeof dryerPlacements)[number]

export const washerStages = ['prewash', 'wash', 'rinse', 'postwash'] as const
export const stages = [...washerStages, 'dry'] as const
export type Stage = (typeof stages)[number]

/** Kinds of product a household owns, as stored. Dryer-only kinds are never washer treatments. */
export const supplyKinds = ['chemical', 'single_use', 'dispensing_device', 'accessory', 'dryer_sheet', 'wool_dryer_ball'] as const
export type SupplyKind = (typeof supplyKinds)[number]

export const dryerSupplyKinds = ['dryer_sheet', 'wool_dryer_ball'] as const
export type DryerSupplyKind = (typeof dryerSupplyKinds)[number]

/** Products that come back out of the dryer and are used again, so no amount is consumed. */
export const reusableSupplyKinds = ['wool_dryer_ball'] as const

export const colorGroups = ['white', 'very_light', 'light', 'medium', 'dark', 'black', 'saturated', 'unknown'] as const
export type ColorGroup = (typeof colorGroups)[number]

export const availabilityStates = ['available', 'in_use', 'reserved', 'offline', 'unknown'] as const
export type Availability = (typeof availabilityStates)[number]

export const applianceTypes = ['top_load_washer', 'front_load_washer', 'tumble_dryer', 'heated_hanging_dryer'] as const
export type ApplianceType = (typeof applianceTypes)[number]

export function isDryer(machine: { readonly applianceType?: string | null } | null | undefined): boolean {
  return machine?.applianceType === 'tumble_dryer'
}

/** A heated hanging dryer (drying cabinet or heated airer): pieces hang in it; no label establishes compatibility. */
export function isHangingDryer(machine: { readonly applianceType?: string | null } | null | undefined): boolean {
  return machine?.applianceType === 'heated_hanging_dryer'
}

/** What a machine record is for; a record never changes role. */
export function machineRole(machine: { readonly applianceType?: string | null } | null | undefined): 'washer' | 'dryer' | 'hanging' {
  return isDryer(machine) ? 'dryer' : isHangingDryer(machine) ? 'hanging' : 'washer'
}

/** Any machine that dries rather than washes. */
export function isDryingMachine(machine: { readonly applianceType?: string | null } | null | undefined): boolean {
  return isDryer(machine) || isHangingDryer(machine)
}

/** A washer's HE status as its plate or manual states it; never inferred from the appliance type. */
export const washerClasses = ['he', 'standard'] as const
export type WasherClass = (typeof washerClasses)[number]

/** How dirty a garment is, recorded per garment; a load takes the heaviest of its garments. */
export const soilLevels = ['light', 'normal', 'heavy'] as const
export type SoilLevel = (typeof soilLevels)[number]

/** Label load sizes, ordered by how full the drum is. */
export const loadSizes = ['small', 'medium', 'large', 'extra_large'] as const
export type LoadSize = (typeof loadSizes)[number]

/** How a product is measured: to a mark on its cap or scoop, by count, or as a printed amount. */
export const measureKinds = ['cap', 'scoop', 'count', 'amount'] as const
export type MeasureKind = (typeof measureKinds)[number]
export const measuredUnits = ['ml', 'fl oz', 'g', 'oz'] as const
export type MeasuredUnit = (typeof measuredUnits)[number]
export const countUnits = ['pod', 'sheet', 'ball', 'tablet'] as const
export type CountUnit = (typeof countUnits)[number]
export const doseUnits = [...measuredUnits, 'cap', 'scoop', ...countUnits] as const
export type DoseUnit = (typeof doseUnits)[number]

/** Drying care as the label's drying symbol states it. */
export const dryMethods = ['tumble_dry', 'line_dry', 'dry_flat', 'drip_dry', 'do_not_tumble_dry', 'unknown'] as const
export type DryMethod = (typeof dryMethods)[number]

/** Dryer heat, coolest first; a garment's `dryHeat` is the hottest it may take. */
export const dryerHeats = ['no_heat', 'delicate', 'low', 'medium', 'high'] as const
export type DryerHeat = (typeof dryerHeats)[number]
/** Coolest first; -1 for anything that is not a dryer heat. */
export const heatRank = (heat: string): number => (dryerHeats as readonly string[]).indexOf(heat)

const doNotTumblePattern = /do not (tumble|machine) dry/i

/**
 * The drying method older care records imply: a stored "Do not tumble dry" restriction predates
 * `dryMethod`. Only a prohibition is inferred; nothing else is read into the text.
 */
export function inferredDryMethod(restrictions: readonly unknown[] | null | undefined): 'do_not_tumble_dry' | null {
  return (restrictions ?? []).some((entry) => typeof entry === 'string' && doNotTumblePattern.test(entry)) ? 'do_not_tumble_dry' : null
}

export const careStatuses = ['confirmed', 'needs_confirmation'] as const
export type CareStatus = (typeof careStatuses)[number]

export const colorPolicies = ['separate', 'allow', 'separate_first_wash'] as const
export type ColorPolicy = (typeof colorPolicies)[number]

export const heavyLightMixingPolicies = ['avoid', 'allow_if_cost_saving', 'allow'] as const
export type HeavyLightMixing = (typeof heavyLightMixingPolicies)[number]

export const optimizations = ['protect_clothes', 'balanced', 'cheapest'] as const
export type Optimization = (typeof optimizations)[number]

/** What a garment is. Tags describe personal use separately; type supplies about-bulk. */
export const garmentKinds = ['t_shirt', 'shirt', 'sweater', 'pants', 'shorts', 'skirt', 'dress', 'outerwear', 'suit',
  'pajamas', 'underwear', 'socks', 'workout', 'baby_bodysuit', 'towel', 'sheets', 'other'] as const
export type GarmentKind = (typeof garmentKinds)[number]

/** What the person has observed about dye running; a completed wash never proves colorfastness. */
export const dyeRunStates = ['new', 'bleeds', 'fast', 'unknown'] as const
export type DyeRun = (typeof dyeRunStates)[number]

/**
 * Match a named colour when present; otherwise keep different colour groups apart. Older records
 * spelled "Grey"; it matches today's "Gray" so a re-added shirt joins its twins.
 */
export function garmentKey(garment: { readonly name: string; readonly color?: string | null; readonly colorGroup?: string | null; readonly guest?: boolean }): string {
  const words = (value: string | null | undefined) => (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/\bgrey\b/g, 'gray')
  return `${words(garment.name)}|${words(garment.color) || words(garment.colorGroup)}|${garment.guest ? 'guest' : 'owned'}`
}

/** About a pound (0.45 kg) of dry laundry per unit. Only groups garments into loads and gives "about k loads"; never a dose. */
export const kindBulkUnits: Record<GarmentKind, number> = { t_shirt: 0.5, shirt: 0.5, sweater: 1.5, pants: 1.5, shorts: 0.5,
  skirt: 0.5, dress: 1, outerwear: 2.5, suit: 2, pajamas: 1, underwear: 0.25, socks: 0.25, workout: 0.5, baby_bodysuit: 0.25,
  towel: 1.5, sheets: 3, other: 1 }

export const occasions = ['everyday', 'work', 'dressy', 'sport', 'sleep', 'lounge'] as const
export type Occasion = (typeof occasions)[number]

/** Why a garment was flagged dirty, as the flag sheet's "What happened?" chips. */
export const flagReasons = ['worn', 'sweat', 'food', 'mud_grass', 'baby_mess', 'wet', 'smell', 'stain_other'] as const
export type FlagReason = (typeof flagReasons)[number]

/** The reasons that leave a stain, so the flag sheet asks where it is. */
export const stainReasons = ['food', 'mud_grass', 'baby_mess', 'stain_other'] as const satisfies readonly FlagReason[]
export type StainReason = (typeof stainReasons)[number]

const flagSoil: Record<FlagReason, SoilLevel> = {
  worn: 'light',
  sweat: 'normal',
  smell: 'normal',
  wet: 'normal',
  food: 'heavy',
  mud_grass: 'heavy',
  baby_mess: 'heavy',
  stain_other: 'heavy',
}

/** The preselected "How dirty?" answer: the heaviest the reasons imply, and normal when none was given. */
export function soilForFlag(reasons: readonly FlagReason[]): SoilLevel {
  if (reasons.length === 0) return 'normal'
  return reasons.reduce<SoilLevel>((heaviest, reason) => {
    const soil = flagSoil[reason]
    return soilLevels.indexOf(soil) > soilLevels.indexOf(heaviest) ? soil : heaviest
  }, 'light')
}

/** Who wears a garment: a name tag, not an account. */
export const wearerKinds = ['adult', 'child', 'baby'] as const
export type WearerKind = (typeof wearerKinds)[number]

/** A machine at home, or one in a shared coin or card laundry room. */
export const machineLocations = ['home', 'shared'] as const
export type MachineLocation = (typeof machineLocations)[number]

/** What a product is for, as the person names it; `useDirections` derives where and when it goes. */
export const supplyUses = ['detergent', 'pods', 'softener', 'stain_remover', 'booster', 'scent_booster', 'sanitizer', 'rinse_sanitizer', 'dryer_sheets', 'dryer_balls'] as const
export type SupplyUse = (typeof supplyUses)[number]

export const ironSteamAnswers = ['allowed', 'not_allowed'] as const
export type IronSteamAnswer = (typeof ironSteamAnswers)[number]

/**
 * The tag's bleach triangle: a plain triangle (any bleach), one with two diagonal lines (non-chlorine
 * bleach only) or one crossed out (do not bleach). Unset is a tag that doesn't say.
 */
export const bleachAnswers = ['any', 'non_chlorine', 'none'] as const
export type BleachAnswer = (typeof bleachAnswers)[number]

/** The care symbol's water dots (1 to 4) as maximum wash temperatures in °C. Hot is 50 °C / 120 °F. */
export const tagTemperatures = { cold: 30, warm: 40, hot: 50, very_hot: 60 } as const
export type TagTemperature = keyof typeof tagTemperatures

/** The units a drum volume sticker prints. */
export const drumVolumeUnits = ['cu_ft', 'l'] as const
export type DrumVolumeUnit = (typeof drumVolumeUnits)[number]
/** About-bulk per cubic foot and per litre of drum; an estimate that only packs loads, never a dose. */
export const unitsPerCuFt = 4
export const unitsPerLitre = 0.14
/** The packing size used only when a washer's size was skipped. */
export const defaultPackingUnits = 14

/** Gentlest first; a cycle not listed is not comparable and fails closed in rush. */
export const cycleGentleness = ['delicate', 'permanent_press', 'normal', 'quick', 'heavy_duty'] as const

/** Normal planning, or Wash now: one load of everything that may be machine washed, at the gentlest settings. */
export const plannerModes = ['normal', 'rush'] as const
export type PlannerMode = (typeof plannerModes)[number]

export type UseDirections = {
  readonly kind: SupplyKind
  readonly countUnit?: CountUnit
  readonly stage: Stage
  readonly placement: string
  readonly timing: string
}

/**
 * Where and when a product goes, from what it is for. `washerPlacements` are the placements of the
 * household's preferred washer (else its first washer): a drawer slot is used only when that washer
 * lists it. Stain remover, booster and sanitizer go in the drawer only when the person says so;
 * a booster otherwise goes in the empty drum, and scent beads always do. A rinse sanitizer (Lysol Laundry Sanitizer) goes in
 * the rinse, like softener.
 */
export function useDirections(use: SupplyUse, washerPlacements: readonly string[], inDrawer?: boolean): UseDirections {
  const listed = (slot: Placement) => washerPlacements.includes(slot)
  switch (use) {
    case 'detergent':
      return listed('detergent_compartment')
        ? { kind: 'chemical', stage: 'wash', placement: 'detergent_compartment', timing: 'before starting' }
        : { kind: 'chemical', stage: 'wash', placement: 'direct_to_drum', timing: 'before loading the clothes' }
    case 'pods':
      return { kind: 'single_use', countUnit: 'pod', stage: 'wash', placement: 'direct_to_drum', timing: 'before loading the clothes' }
    case 'softener':
      return { kind: 'chemical', stage: 'rinse', placement: listed('softener_compartment') ? 'softener_compartment' : 'direct_to_drum', timing: 'at the start of the rinse' }
    case 'rinse_sanitizer':
      return { kind: 'chemical', stage: 'rinse', placement: listed('softener_compartment') ? 'softener_compartment' : 'direct_to_drum', timing: 'at the start of the rinse' }
    case 'booster':
      return inDrawer === true && listed('detergent_compartment')
        ? { kind: 'chemical', stage: 'wash', placement: 'detergent_compartment', timing: 'with the clothes, before starting' }
        : { kind: 'chemical', stage: 'wash', placement: 'direct_to_drum', timing: 'before loading the clothes' }
    case 'scent_booster':
      // Downy Unstopables' label: into the empty drum before the clothes, never a dispenser, drawer answer or not.
      return { kind: 'chemical', stage: 'wash', placement: 'direct_to_drum', timing: 'before loading the clothes' }
    case 'stain_remover':
    case 'sanitizer':
      return { kind: 'chemical', stage: 'wash', placement: inDrawer === true && listed('detergent_compartment') ? 'detergent_compartment' : 'direct_to_drum', timing: 'with the clothes, before starting' }
    case 'dryer_sheets':
      return { kind: 'dryer_sheet', countUnit: 'sheet', stage: 'dry', placement: 'dryer_drum', timing: 'with the clothes, before starting the dryer' }
    case 'dryer_balls':
      return { kind: 'wool_dryer_ball', countUnit: 'ball', stage: 'dry', placement: 'dryer_drum', timing: 'with the clothes, before starting the dryer' }
  }
}
