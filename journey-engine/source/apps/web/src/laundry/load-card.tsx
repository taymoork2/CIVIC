import { stainReasons, type FlagReason, type SoilLevel } from '@washcloset/planner'

import { cycleWord, dayWord, flagReasonWords, loadText, soilSentenceWords, temperatureWord } from '@/copy'
import type { PlanLoad, PlanQuestion, StoredPlan } from '@/laundry/laundry-pass'
import { exclusionWords, loadCautionWords, whyTogetherWords, type CautionWords } from '@/laundry/plain-reasons'
import { dryerHeatLabels, slotName } from '@/kit/ui'
import type { DoseLike } from '@/kit/units'

/**
 * What a load shows: which bottle goes in which slot, how it washes and dries, and what hangs. The cap
 * line is not named when it depends on how full the drum is: that is decided at the machine. Every line
 * is built here from the plan's structure and the plain words tables; no planner sentence is shown.
 */

type Reason = StoredPlan['result']['reasons'][number]
type Step = PlanLoad['treatments'][number]

/** The garment facts a card needs, as `inventory.list` returns them. */
export type CardGarment = {
  readonly name: string
  readonly kind?: string | null
  readonly colorGroup: string | null
  readonly flag: { readonly reasons: readonly FlagReason[]; readonly stainNote?: string; readonly neededBy?: number } | null
}

export type LoadFacts = {
  readonly now: number
  readonly garment: (textileId: string) => CardGarment | null
  readonly product: (supplyId: string) => string | null
  /** The typed line of a saved label row, when the person typed one. */
  readonly rowText: (ruleId: string) => string | null
  readonly reasons: readonly Reason[]
  /** She has moved clothes in this pass: the loads are her arrangement. */
  readonly pinned: boolean
  readonly rush: boolean
}

/** One bottle on a load, with the slot it goes in ("Detergent slot", "In the dryer"). */
export type DoseLineView =
  | { readonly kind: 'resolved'; readonly product: string; readonly slot: string; readonly dose: DoseLike; readonly marks: readonly string[] | null; readonly line: string | null }
  | { readonly kind: 'candidates'; readonly product: string; readonly slot: string; readonly candidates: readonly { readonly dose: DoseLike; readonly line: string | null }[] }
  | { readonly kind: 'ask'; readonly product: string; readonly slot: string }

export type LoadCardView = {
  readonly loadId: string
  readonly number: number
  readonly title: string
  readonly items: readonly { readonly textileId: string; readonly name: string; readonly kind: string | null; readonly colorGroup: string | null }[]
  readonly itemsLine: string
  readonly settings: string
  readonly doses: readonly DoseLineView[]
  readonly dry: DryView | null
  readonly stains: readonly string[]
  readonly why: string | null
  readonly cautions: readonly CautionWords[]
  /** Why the load can't start, when it is not a question a card is asking. */
  readonly blockers: readonly string[]
}

/** "Dryer: Low Temp" or "Hang everything"; `hang` names what stays out of a dryer load. */
/** `fit`: a note when the tumbling garments could not be checked against the dryer, or do not fit. */
export type DryView = { readonly text: string; readonly fit: string | null; readonly hang: readonly string[]; readonly doses: readonly DoseLineView[] }

const lightGroups = new Set(['white', 'very_light', 'light'])
const darkGroups = new Set(['dark', 'black'])

/** "Whites", "Lights", "Darks", "Brights", or "Mixed colors" when the load is not all one. */
export function colourWords(groups: readonly (string | null)[]): string {
  const all = (test: (group: string) => boolean) => groups.length > 0 && groups.every((group) => group !== null && test(group))
  if (all((group) => group === 'white')) return loadText.colours.whites
  if (all((group) => lightGroups.has(group))) return loadText.colours.lights
  if (all((group) => darkGroups.has(group))) return loadText.colours.darks
  if (all((group) => group === 'saturated')) return loadText.colours.brights
  return loadText.colours.mixed
}

type NamedPiece = { readonly name: string; readonly colorGroup: string | null; readonly firstWash?: boolean | null; readonly dyeRun?: string | null }

/** A load's everyday name: one garment that must wash alone is "Black jeans alone"; otherwise its colors. */
export function loadName(pieces: readonly NamedPiece[]): string {
  const names = [...new Set(pieces.map((piece) => piece.name))]
  return names.length === 1 && pieces.every((piece) => piece.firstWash === true || piece.dyeRun === 'bleeds') ? loadText.alone(names[0]!) : colourWords(pieces.map((piece) => piece.colorGroup))
}

/** One name per load, by load id, used on every screen; loads that would share a name also say what is in them, which stays true when the plan changes. */
export function loadNames(loads: readonly { readonly loadId: string; readonly number: number; readonly textileIds: readonly string[] }[], pieceOf: (textileId: string) => NamedPiece | undefined): ReadonlyMap<string, string> {
  const base = loads.map((load) => { const pieces = load.textileIds.flatMap((id) => pieceOf(id) ?? []); return [load, loadName(pieces), pieces] as const })
  const shared = (name: string) => base.filter(([, other]) => other === name).length > 1
  return new Map(base.map(([load, name, pieces]) => [load.loadId, shared(name) && pieces[0] !== undefined ? loadText.sameName(name, pieces[0].name, pieces.length - 1) : name]))
}

/** Names with repeats counted once: ["White tee", "White tee", "Socks"] → ["White tee ×2", "Socks"]. */
export function countedNames(names: readonly string[]): string[] {
  const counts = new Map<string, number>()
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1)
  return [...counts].map(([name, count]) => (count > 1 ? `${name} ×${count}` : name))
}

/** "Leo's jeans, Soccer jersey +5"; matching names count together ("White tee ×2"). */
export function itemsLine(names: readonly string[]): string {
  const words = countedNames(names)
  return words.length <= 2 ? words.join(', ') : `${words.slice(0, 2).join(', ')} +${words.length - 2}`
}

/** The flag's reasons in words, then the stain note: "grass or mud, left knee". */
export function flagWords(flag: CardGarment['flag'], only: readonly FlagReason[] | null = null): string | null {
  if (flag === null) return null
  const words = flag.reasons.filter((reason) => only === null || only.includes(reason)).map((reason) => flagReasonWords[reason].toLowerCase())
  const parts = [...words, ...(flag.stainNote === undefined || flag.stainNote.length === 0 ? [] : [flag.stainNote])]
  return parts.length === 0 ? null : parts.join(', ')
}

const sameDose = (left: DoseLike, right: DoseLike) => left.amount === right.amount && left.unit === right.unit && (left.mark ?? null) === (right.mark ?? null) && (left.fractionOfMark ?? 1) === (right.fractionOfMark ?? 1) && left.target === right.target && (left.approximate ?? false) === (right.approximate ?? false)

/** One product's line: its dose now, the doses the drum's size will choose between, or a question at the machine. */
export function doseLine(step: Step, facts: LoadFacts): DoseLineView | null {
  // A step still waiting on a question (or unusable) has no dose to show; the card says why elsewhere.
  if (step.confirmation !== 'confirmed' || step.dose.unit === 'unknown') return null
  const product = facts.product(step.supplyId) ?? loadText.aProduct
  const slot = slotName(step.placement)
  if (step.atMachine !== undefined) {
    const candidates: { dose: DoseLike; line: string | null }[] = []
    for (const candidate of step.atMachine.candidates) {
      if (candidates.length < 4 && !candidates.some((entry) => sameDose(entry.dose, candidate.dose))) candidates.push({ dose: candidate.dose, line: candidate.rowText })
    }
    return candidates.length === 0 ? { kind: 'ask', product, slot } : { kind: 'candidates', product, slot, candidates }
  }
  return {
    kind: 'resolved',
    product,
    slot,
    dose: { ...step.dose, mark: step.dose.mark ?? null, equivalent: step.equivalent ?? null },
    marks: step.marks ?? null,
    line: step.ruleId === undefined ? null : facts.rowText(step.ruleId),
  }
}

/** "Dryer: Low Temp" in the dryer's own words, and what hangs; or "Hang everything". */
function dryLine(drying: NonNullable<PlanLoad['drying']>, facts: LoadFacts): DryView {
  if (drying.status !== 'ready') return { text: loadText.hangEverything, fit: null, hang: [], doses: [] }
  const heat = drying.heatLabel ?? (drying.heat === null ? null : dryerHeatLabels[drying.heat])
  const name = (id: string) => facts.garment(id)?.name ?? loadText.guestItem
  const hang = countedNames(drying.heldOut.map((entry) => (entry.reason === 'stain' ? loadText.stainCheck(name(entry.textileId)) : name(entry.textileId))))
  // Plans saved before the fit was recorded: an unknown capacity is still never unlimited.
  const fit = drying.fit ?? (drying.capacityUnits === null ? 'not_checked' : drying.bulkUnits > drying.capacityUnits ? 'over' : 'fits')
  return { text: heat === null ? loadText.dryer : loadText.dryerWithHeat(heat), fit: fit === 'not_checked' ? loadText.dryerFitNotChecked : null, hang, doses: drying.treatments.map((step) => doseLine(step, facts)).filter((line) => line !== null) }
}

/** Question causes: a card asks them, so they are not repeated as a reason on the load. */
const questionCauses = new Set(['label_row_needed', 'conflicting_dose_rules', 'dose_input_needed', 'unknown_care'])

/** Everything a load card says, from the plan. `number` is the load's position as shown. */
export function loadCardView(load: PlanLoad, number: number, facts: LoadFacts, blockingReasonIds: readonly string[] = []): LoadCardView {
  const garments = load.textileIds.map((id) => ({ textileId: id, garment: facts.garment(id) }))
  const items = garments.map(({ textileId, garment }) => ({ textileId, name: garment?.name ?? loadText.guestItem, kind: garment?.kind ?? null, colorGroup: garment?.colorGroup ?? null }))
  const needed = garments.map(({ garment }) => garment?.flag?.neededBy).filter((when): when is number => when !== undefined)
  const soil: SoilLevel | null = load.soilLevel
  const title = [
    loadText.title(number, colourWords(garments.map(({ garment }) => garment?.colorGroup ?? null)), soil === null ? '' : soilSentenceWords[soil]),
    needed.length === 0 ? null : loadText.needed(dayWord(Math.min(...needed), facts.now)),
  ].filter((part) => part !== null).join(' · ')
  const settings = [cycleWord(load.cycle), temperatureWord(load.temperatureC)].filter((word) => word !== null).join(' · ')
  const own = facts.reasons.filter((reason) => reason.loadId === load.id)
  const cautions: CautionWords[] = []
  for (const reason of own) {
    const words = loadCautionWords(reason, { garment: facts.garment, product: facts.product })
    if (words !== null && !cautions.some((entry) => entry.text === words.text)) cautions.push(words)
  }
  const blockers = [...new Set(facts.reasons
    .filter((reason) => blockingReasonIds.includes(reason.id) && !questionCauses.has(String(reason.details.cause ?? '')))
    .map((reason) => exclusionWords(reason, { product: reason.supplyId === undefined ? null : facts.product(reason.supplyId) }).text))]
  return {
    loadId: load.id,
    number,
    title,
    items,
    itemsLine: itemsLine(items.map((item) => item.name)),
    settings,
    doses: load.treatments.map((step) => doseLine(step, facts)).filter((line) => line !== null),
    dry: load.drying === null ? null : dryLine(load.drying, facts),
    stains: garments.flatMap(({ garment }) => {
      const words = garment === null ? null : flagWords(garment.flag, stainReasons)
      return garment === null || words === null || !garment.flag!.reasons.some((reason) => (stainReasons as readonly string[]).includes(reason))
        ? [] : [loadText.stainBeforeWash(garment.name, words)]
    }),
    why: whyTogetherWords(own, { pinned: facts.pinned, rush: facts.rush, soilLevel: soil }),
    cautions,
    blockers,
  }
}

/** Whether a question card is asking something about this load. */
export function loadHasQuestion(questions: readonly PlanQuestion[], loadId: string): boolean {
  return questions.some((question) => question.context.loadId === loadId || (question.kind === 'soil_level' && question.key.subjectId === loadId))
}

export type LoadStart = 'start' | 'question' | 'blocked' | 'open'
