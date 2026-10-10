import type { SoilLevel } from '@washcloset/planner'

import { cycleWord, reasonText, sourceIssueText, soilSentenceWords, temperatureWord } from '@/copy'

/**
 * Planner reasons in plain words: a fixed table keyed by the reason's code and `details.cause`
 * (and `details.method` for a care veto). The planner's own sentences are never shown, and a key
 * this table does not know reads "Needs a closer look" rather than a code.
 */

export type ReasonLike = {
  readonly code: string
  readonly details?: Readonly<Record<string, unknown>> | null
}

/** What the person can do about it, when there is one obvious thing. */
export type PlainAction = { readonly kind: 'add_washer' | 'add_product'; readonly label: string }

export type PlainReason = { readonly text: string; readonly action?: PlainAction }

export const fallbackWords = reasonText.closerLook

const detail = (reason: ReasonLike, key: string): unknown => reason.details?.[key]
const cause = (reason: ReasonLike) => detail(reason, 'cause')

/** Why a garment is not in these loads, from the reason that left it out. */
export function exclusionWords(reason: ReasonLike, names: { readonly product?: string | null } = {}): PlainReason {
  const product = names.product ?? reasonText.product
  switch (reason.code) {
    case 'care_prohibition':
      if (cause(reason) === 'pre_owned_fragile') return { text: reasonText.exclusion.preOwnedFragile }
      switch (detail(reason, 'method')) {
        case 'dry_clean_only': return { text: reasonText.exclusion.dryCleanOnly }
        case 'hand_wash': return { text: reasonText.exclusion.handWashOnly }
        case 'do_not_wash':
        case 'restriction': return { text: reasonText.exclusion.noMachineWash }
        default: return { text: fallbackWords }
      }
    case 'capacity_limit':
      return cause(reason) === 'textile_exceeds_all_machine_capacity' ? { text: reasonText.exclusion.tooBig } : { text: fallbackWords }
    case 'care_compatibility':
      return cause(reason) === 'no_gentle_cycle' ? { text: reasonText.exclusion.noDelicateCycle } : { text: fallbackWords }
    case 'product_restriction':
      if (cause(reason) === 'protein_fiber_enzyme') return { text: sourceIssueText.held.enzymes(product) }
      if (cause(reason) === 'protein_fiber_enzyme_unknown') return { text: sourceIssueText.held.unconfirmed(product) }
      return { text: reasonText.exclusion.productRestricted }
    case 'shared_compartment_conflict':
      return { text: reasonText.exclusion.productsConflict }
    case 'needs_confirmation':
      switch (cause(reason)) {
        case 'unknown_care': return { text: reasonText.exclusion.unknownCare }
        case 'routine_review_required': return { text: 'Review wash & dry preferences against the current label, or follow the label again.' }
        case 'unmatched_label_requirement': {
          const instructions = detail(reason, 'instructions')
          const wording = Array.isArray(instructions) ? instructions.filter((line): line is string => typeof line === 'string').join('; ') : ''
          return { text: wording === '' ? 'A required label setting still needs a matching wash process.' : `A required label setting still needs a matching wash process: ${wording}` }
        }
        case 'product_safety_needed': return { text: `Check whether ${product} contains bleach before using it.` }
        case 'protein_fiber_enzyme': return { text: `${product} has enzymes that break down wool and silk. Use a wool-safe detergent for this load.` }
        case 'protein_fiber_enzyme_unknown': return { text: `Wool and silk need a detergent without enzymes. Check ${product}’s label for enzymes, or use a wool-safe detergent.` }
        case 'profile_requirement_conflict': return { text: `${product} doesn’t meet a wearer’s product requirements. Use another product or leave it out.` }
        case 'profile_requirement_unknown': return { text: `Check ${product}’s pack against a wearer’s product requirements before using it.` }
        case 'product_material_conflict': return { text: `Check the garment material against ${product}’s label restrictions.` }
        case 'product_temperature_conflict': return { text: `This wash exceeds ${product}’s recorded maximum temperature.` }
        case 'sanitizer_contact_time': return { text: `${product} needs its exact pack’s rinse contact time and a matching washer program. Leave it out if those facts are unavailable; the full-cycle timer is not rinse contact time.` }
        case 'unknown_stain_report': return { text: 'Review the stain type and any earlier treatments before adding a stain product.' }
        case 'stain_care_conflict': return { text: 'The stain treatment conflicts with this garment’s care label.' }
        case 'unsupported_stain_chemistry': return { text: 'No confirmed label treatment fits this stain and garment. Review product and clothing details.' }
        case 'stain_needs_cleaner': return { text: 'Nothing else safe for this stain and fabric is left to try at home. A cleaner is the safest next step.' }
        case 'stain_retry_unavailable': return { text: 'None of your products is a safe different try for this stain. A cleaner is safest, or add a product whose label covers it.' }
        case 'pretreatment_choice_needed': return { text: 'Choose a pretreatment for this stain.' }
        case 'unsupported_machine_cycle': return { text: reasonText.exclusion.noCycle }
        case 'unsupported_machine_placement': return { text: reasonText.exclusion.noSlot }
        case 'locked_door_mid_cycle': return { text: reasonText.exclusion.lockedDoor(product) }
        // The tab the spec calls "Our stuff" is labelled Household.
        case 'invalid_dose': return { text: reasonText.exclusion.invalidDose(product) }
        case 'shared_compartment_conflict':
        case 'chemical_combination_conflict': return { text: reasonText.exclusion.productsConflict }
        case 'insufficient_machine_evidence': return { text: reasonText.exclusion.addWasher, action: { kind: 'add_washer', label: reasonText.actions.addWasher } }
        // A named product exists but its pack label is not confirmed; with no product at all, add one.
        case 'insufficient_product_evidence': return names.product === undefined || names.product === null
          ? { text: reasonText.exclusion.addDetergent, action: { kind: 'add_product', label: reasonText.actions.addProduct } }
          : { text: `Confirm ${product}’s label first: read its dose and contents off the pack.` }
        default: return { text: fallbackWords }
      }
    default:
      return { text: fallbackWords }
  }
}

/**
 * Why a move between loads was refused (`pin_refused`, by `details.cause`); the garment stays where
 * it was. Names are shown as stored.
 */
export function pinRefusalWords(reason: ReasonLike, name: string): string {
  switch (cause(reason)) {
    case 'care_cycle': {
      const temperature = temperatureWord(typeof detail(reason, 'loadTemperatureC') === 'number' ? detail(reason, 'loadTemperatureC') as number : null)
      const cycle = cycleWord(typeof detail(reason, 'loadCycle') === 'string' ? detail(reason, 'loadCycle') as string : null)
      const words = [temperature, cycle].filter((word): word is string => word !== null).map((word) => word.toLowerCase())
      return words.length === 0 ? reasonText.pin.wrongLoad(name) : reasonText.pin.wrongCare(name, words.join(', '))
    }
    case 'capacity': {
      const group = detail(reason, 'group')
      return reasonText.pin.full(name, typeof group === 'number' ? group : undefined)
    }
    case 'hand_wash': return reasonText.pin.handWash(name)
    case 'dry_clean_only': return reasonText.pin.dryClean(name)
    case 'do_not_wash': return reasonText.pin.noWash(name)
    case 'care_unknown': return reasonText.pin.unknown(name)
    case 'restriction': return reasonText.pin.restricted
    default: return fallbackWords
  }
}

// ---- Load cards ------------------------------------------------------------------------

const soilOf = (value: unknown): SoilLevel | null => (value === 'light' || value === 'normal' || value === 'heavy' ? value : null)

/**
 * "Why together:" one short phrase for a load, and a second after a comma when one applies ("same
 * colours, all very dirty"). The load's own reasons decide it; a load that was simply the first to
 * be filled may have none, and then there is no line.
 */
export function whyTogetherWords(reasons: readonly ReasonLike[], facts: { readonly pinned: boolean; readonly rush: boolean; readonly soilLevel: SoilLevel | null }): string | null {
  const has = (code: string, reasonCause: string) => reasons.some((reason) => reason.code === code && cause(reason) === reasonCause)
  const soilWords = facts.soilLevel === 'heavy' ? reasonText.together.heavy : facts.soilLevel === 'light' ? reasonText.together.light : null
  const phrases = [
    facts.pinned ? reasonText.together.pinned : null,
    facts.rush ? reasonText.together.rush : null,
    has('preference_applied', 'baby_separation') ? reasonText.together.baby : null,
    has('dye_first_wash_risk', 'color_separation') ? reasonText.together.colours : null,
    has('preference_applied', 'soil_separation') ? soilWords : null,
    has('care_compatibility', 'cycle_separation') ? reasonText.together.cycle : null,
  ].filter((phrase) => phrase !== null)
  return phrases.length === 0 ? null : phrases.slice(0, 2).join(', ')
}

/** A caution on a load; `heLogo` ends the sentence with the logo picture, the only way HE is shown. */
export type CautionWords = { readonly text: string; readonly heLogo?: true }

type CautionNames = {
  readonly garment: (textileId: string) => { readonly name: string; readonly colorGroup: string | null } | null
  readonly product: (supplyId: string) => string | null
}

const darkGroups = new Set(['dark', 'black', 'saturated'])
const lightGroups = new Set(['white', 'very_light', 'light'])

/** "Dark jeans", or "Dark jeans and 2 more". */
const sideWords = (names: readonly string[]) => (names.length === 1 ? names[0]! : reasonText.andMore([names[0]!], names.length - 1))

/** Up to two names, then "and 3 more": "Black tee", "Black tee and White tee", or "Black tee, White tee and 3 more". */
const upToTwoWords = (names: readonly string[]) => reasonText.andMore(names.slice(0, 2), Math.max(0, names.length - 2))

/** The garment names an id list resolves to, in the order given, skipping any this device doesn't know. */
const garmentNames = (ids: unknown, garment: CautionNames['garment']): string[] =>
  (Array.isArray(ids) ? ids : []).flatMap((id) => (typeof id === 'string' ? [garment(id)?.name] : [])).filter((name): name is string => name !== undefined)

/**
 * "No Oxi this load: Black tee’s tag says do not bleach." A chlorine product can be forbidden by both
 * kinds of tag at once (do not bleach, and non-chlorine only), so each that applies is its own clause.
 */
function tagForbidsBleachWords(reason: ReasonLike, product: string, names: CautionNames): CautionWords {
  const clause = (garments: readonly string[], singular: string, plural: string) =>
    garments.length === 0 ? null : `${upToTwoWords(garments)}’s ${garments.length === 1 ? singular : plural}`
  const clauses = [
    clause(garmentNames(detail(reason, 'noBleachIds'), names.garment), reasonText.bleach.forbiddenOne, reasonText.bleach.forbiddenMany),
    clause(garmentNames(detail(reason, 'nonChlorineIds'), names.garment), reasonText.bleach.nonChlorineOne, reasonText.bleach.nonChlorineMany),
  ].filter((text): text is string => text !== null)
  return clauses.length === 0 ? { text: reasonText.leftOut(product) } : { text: reasonText.noProduct(product, clauses) }
}

/**
 * The plain caution a reason puts on a load, or null when the reason is not a caution. Soft rules
 * set aside by a move (colour, soil, baby) and products left out of the pass are cautions.
 */
export function loadCautionWords(reason: ReasonLike & { readonly supplyId?: string }, names: CautionNames): CautionWords | null {
  const product = (reason.supplyId === undefined ? null : names.product(reason.supplyId)) ?? reasonText.product
  switch (reason.code) {
    case 'preference_overridden':
      switch (cause(reason)) {
        case 'color_mixed': {
          const ids = detail(reason, 'textileIds')
          const garments = (Array.isArray(ids) ? ids : []).flatMap((id) => (typeof id === 'string' ? [names.garment(id)] : [])).filter((garment) => garment !== null)
          const dark = garments.filter((garment) => darkGroups.has(garment.colorGroup ?? '')).map((garment) => garment.name)
          const light = garments.filter((garment) => lightGroups.has(garment.colorGroup ?? '')).map((garment) => garment.name)
          return dark.length === 0 || light.length === 0 ? { text: fallbackWords } : { text: reasonText.bleed(sideWords(dark), sideWords(light)) }
        }
        case 'soil_mixed': return { text: reasonText.soilMixed }
        case 'baby_mixed': return { text: reasonText.babyMixed }
        default: return null
      }
    case 'preference_applied':
      switch (cause(reason)) {
        case 'personal_routine': return { text: 'Wash & dry preferences apply only to the selected items. Their recorded labels remain visible.' }
        case 'soil_mixed': return { text: reasonText.soilMixed }
        case 'care_fail_safe': return { text: reasonText.failSafe }
        default: return null
      }
    case 'product_left_out':
      switch (cause(reason)) {
        case 'left_out': return { text: reasonText.leftOut(product) }
        case 'label_doesnt_say': return { text: reasonText.checkLabel(labelDoesntSayWords(product, soilOf(detail(reason, 'soilLevel')))) }
        case 'needs_detergent': return { text: reasonText.needsDetergent(product) }
        case 'cant_tell_he': return { text: reasonText.dependsOnHe(product), heLogo: true }
        case 'tag_forbids_bleach': return tagForbidsBleachWords(reason, product, names)
        default: return { text: reasonText.leftOut(product) }
      }
    default:
      return null
  }
}

/**
 * "Tide isn't dosed for very dirty loads." The spec words it by the load's soil; a load with no
 * soil recorded (a dryer product, or soil that does not change the dose) says "these loads".
 */
export function labelDoesntSayWords(product: string, soilLevel: SoilLevel | null): string {
  return reasonText.notDosed(product, soilLevel === null ? reasonText.these : soilSentenceWords[soilLevel])
}
