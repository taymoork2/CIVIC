import { orderLoads as passOrder, type DecisionReason } from '@washcloset/planner'
import type { FunctionArgs, FunctionReturnType } from 'convex/server'

import type { api } from '@/api'
import { noWearerWords, planningText } from '@/copy'
import { garmentKey } from '@/closet/garment-groups'
import type { Inventory, Textile } from '@/household/inventory-types'
import { effectiveWashMethod } from '@/household/inventory-types'
import type { PlanningDraft } from '@/private-state'

/**
 * A pass: one round of Make loads. It starts when Make loads is tapped and carries the person's
 * answers that save nothing (dismissed questions), the products left out, and her arrangement of
 * loads (pins). Every recompute in the pass sends the selection and this state; the open plan keeps
 * it (`plans.get().pass`), so a reload picks the pass up again. A new Make loads starts it empty.
 */

export type StoredPlan = NonNullable<FunctionReturnType<typeof api.plans.get>>
export type PlanQuestion = FunctionReturnType<typeof api.plans.questions>[number]
export type PlanLoad = StoredPlan['result']['loads'][number]
export type Pass = StoredPlan['pass']
export type Pin = Pass['loadPins'][number]
export type Dismissal = Pass['dismissedQuestions'][number]
export type DismissedAnswer = Dismissal['answer']
type RecomputeArgs = FunctionArgs<typeof api.plans.recompute>
type TextileId = RecomputeArgs['selectedTextileIds'][number]
type SupplyId = Pass['excludedSupplyIds'][number]

export const emptyPass: Pass = { mode: 'normal', loadPins: [], dismissedQuestions: [], excludedSupplyIds: [] }

/** The pass as `plans.recompute` arguments: each field only when it has something, Wash now only when on. */
export function passArgs(pass: Pass): Pick<RecomputeArgs, 'mode' | 'loadPins' | 'dismissedQuestions' | 'excludedSupplyIds' | 'detergentId' | 'pretreatmentChoices' | 'optionalSupplyIds' | 'washGoals' | 'productLoadConfirmations'> {
  return {
    ...(!pass.productLoadConfirmations?.length ? {} : { productLoadConfirmations: pass.productLoadConfirmations }),
    ...((pass.optionalSupplyIds?.length ?? 0) === 0 ? {} : { optionalSupplyIds: pass.optionalSupplyIds }),
    ...(pass.washGoals === undefined || pass.washGoals.length === 0 || pass.washGoals.length === 1 && pass.washGoals[0] === 'ordinary' ? {} : { washGoals: pass.washGoals }),
    ...(pass.mode === 'rush' ? { mode: 'rush' as const } : {}),
    ...(pass.loadPins.length === 0 ? {} : { loadPins: pass.loadPins }),
    ...(pass.dismissedQuestions.length === 0 ? {} : { dismissedQuestions: pass.dismissedQuestions }),
    ...(pass.excludedSupplyIds.length === 0 ? {} : { excludedSupplyIds: pass.excludedSupplyIds }),
    ...(pass.detergentId === undefined ? {} : { detergentId: pass.detergentId }),
    ...((pass.pretreatmentChoices?.length ?? 0) === 0 ? {} : { pretreatmentChoices: pass.pretreatmentChoices }),
  }
}

/** "Switch detergent": every load of the pass uses this detergent where it fits. */
export function chooseDetergent(pass: Pass, supplyId: string): Pass {
  return pass.detergentId === supplyId ? pass : { ...pass, detergentId: supplyId as SupplyId }
}

export function chooseOptionalProduct(pass: Pass, supplyId: string, on: boolean): Pass {
  const selected = (pass.optionalSupplyIds ?? []).filter((id) => id !== supplyId)
  return { ...pass, optionalSupplyIds: on ? [...selected, supplyId as SupplyId] : selected,
    excludedSupplyIds: on ? pass.excludedSupplyIds.filter((id) => id !== supplyId) : pass.excludedSupplyIds }
}

/** Add a pretreatment to this piece's recipe, without marking it performed. */
export function choosePretreatment(pass: Pass, textileId: string, supplyId: string): Pass {
  return { ...pass, pretreatmentChoices: [
    ...(pass.pretreatmentChoices ?? []).filter((choice) => choice.textileId !== textileId),
    { textileId: textileId as TextileId, supplyId: supplyId as SupplyId },
  ] }
}

const sameDismissal = (left: Dismissal, right: Dismissal) => left.kind === right.kind && left.subjectId === right.subjectId
  && (left.context.soilLevel ?? null) === (right.context.soilLevel ?? null) && (left.context.washerClass ?? null) === (right.context.washerClass ?? null)

/**
 * A question answered without saving anything: its key goes back with the answer, as the server
 * built it. Only label and HE questions can be dismissed; any other key is left alone.
 */
export function dismissQuestion(pass: Pass, key: PlanQuestion['key'], answer: DismissedAnswer): Pass {
  if (key.kind !== 'label_row' && key.kind !== 'washer_he') return pass
  const dismissal: Dismissal = { kind: key.kind, subjectId: key.subjectId, context: key.context, answer }
  return { ...pass, dismissedQuestions: [...pass.dismissedQuestions.filter((entry) => !sameDismissal(entry, dismissal)), dismissal] }
}

/** "Leave it out this time" for a product. */
export function leaveOutProduct(pass: Pass, supplyId: string): Pass {
  if (pass.excludedSupplyIds.includes(supplyId as SupplyId)) return pass
  return { ...pass, excludedSupplyIds: [...pass.excludedSupplyIds, supplyId as SupplyId],
    ...(pass.optionalSupplyIds === undefined ? {} : { optionalSupplyIds: pass.optionalSupplyIds.filter((id) => id !== supplyId) }) }
}

/** "Not this time" (or a question that leaves garments out): out of the selection, and out of the pins. */
export function withoutGarments(selection: readonly string[], pass: Pass, textileIds: readonly string[]): { selection: TextileId[]; pass: Pass } {
  const gone = new Set(textileIds)
  return {
    selection: selection.filter((id) => !gone.has(id)) as TextileId[],
    pass: { ...pass, loadPins: pass.loadPins.filter((pin) => !gone.has(pin.textileId)), pretreatmentChoices: (pass.pretreatmentChoices ?? []).filter((choice) => !gone.has(choice.textileId)) },
  }
}

/**
 * A move between loads. It freezes the loads as shown: every garment pinned to the load number it
 * shows under, then one more entry for the moved garment with its new load (`loads.length + 1` for
 * a new load). The planner tries a garment's entries from last to first, so a refused move falls
 * back to where it was.
 */
export function frozenPins(loads: readonly { readonly textileIds: readonly string[] }[], textileId: string, group: number): Pin[] {
  const frozen = loads.flatMap((load, index) => load.textileIds.map((id) => ({ textileId: id as Pin['textileId'], group: index + 1 })))
  return [...frozen, { textileId: textileId as Pin['textileId'], group }]
}

/** A move refused by a hard care rule: the planner's `pin_refused` for that garment and load. */
export function pinRefusal(reasons: readonly Pick<DecisionReason, 'code' | 'textileIds' | 'details'>[], textileId: string, group: number) {
  return reasons.find((reason) => reason.code === 'pin_refused' && reason.textileIds.includes(textileId) && reason.details.group === group) ?? null
}

/**
 * The one order loads are washed and numbered in, on the plan's cards, the Laundry tab, Home and the
 * dock (design 5.1): loads under way first, as planned, then the rest by `orderLoads` (urgent, two-run
 * tumble, tumble, air-dry). "Load n" is a load's place here; stored load ids never change.
 */
export function washOrder<Load>(loads: readonly Load[], facts: (load: Load) => { readonly started: boolean; readonly urgent: boolean; readonly dryerRuns: number }): Load[] {
  const known = loads.map(facts)
  const started = loads.filter((_, at) => known[at]!.started)
  const rest = passOrder(loads.flatMap((_, at) => known[at]!.started ? [] : [{ id: String(at), urgent: known[at]!.urgent, dryerRuns: known[at]!.dryerRuns }]))
  return [...started, ...rest.map((at) => loads[Number(at)]!)]
}

/** Dryer runs a load needs: 0 when nothing in it tumbles (an air-dry or stain load), 2 when it does not fit one run. */
export const dryerRuns = (dryer: { readonly tumble: number; readonly fit: string } | null): number => dryer === null || dryer.tumble === 0 ? 0 : dryer.fit === 'over' ? 2 : 1

/**
 * The pass as it can still be sent after something changed: answers and exclusions about products
 * or washers that are gone would be refused, so they are dropped.
 */
export function currentPass(pass: Pass, inventory: Pick<Inventory, 'supplies' | 'machines'>): Pass {
  const supplies = new Set<string>(inventory.supplies.map((supply) => supply.supplyId))
  const machines = new Set<string>(inventory.machines.map((machine) => machine.machineId))
  const { detergentId, ...rest } = pass
  return {
    ...rest,
    dismissedQuestions: pass.dismissedQuestions.filter((entry) => (entry.kind === 'label_row' ? supplies : machines).has(entry.subjectId)),
    excludedSupplyIds: pass.excludedSupplyIds.filter((id) => supplies.has(id)),
    optionalSupplyIds: (pass.optionalSupplyIds ?? []).filter((id) => supplies.has(id)),
    pretreatmentChoices: (pass.pretreatmentChoices ?? []).filter((choice) => supplies.has(choice.supplyId)),
    ...(detergentId === undefined || !supplies.has(detergentId) ? {} : { detergentId }),
  }
}

/**
 * The pass's questions with "Check the tag" cards for identical garments merged: the same name and
 * colour, the same person (or shared, or guests). One answer then covers every one of them through
 * `answerTagQuestions`. A garment this device doesn't know is never merged, and every other card is
 * left as the server sent it, in its order.
 */
export function groupCareQuestions(questions: readonly PlanQuestion[], textileOf: (textileId: string) => Pick<Textile, 'name' | 'color' | 'wearerId' | 'guest'> & Partial<Pick<Textile, 'colorGroup'>> | undefined): PlanQuestion[] {
  const merged: PlanQuestion[] = []
  const byGroup = new Map<string, number>()
  for (const question of questions) {
    const textileId = question.subjectIds[0]
    const textile = question.kind !== 'care_unknown' || question.subjectIds.length !== 1 || textileId === undefined ? undefined : textileOf(textileId)
    if (textile === undefined) {
      merged.push(question)
      continue
    }
    const key = JSON.stringify([garmentKey(textile), textile.guest ? 'guest' : textile.wearerId ?? 'shared'])
    const at = byGroup.get(key)
    if (at === undefined) {
      byGroup.set(key, merged.length)
      merged.push(question)
    } else {
      const first = merged[at]!
      merged[at] = { ...first, subjectIds: [...new Set([...first.subjectIds, ...question.subjectIds])] }
    }
  }
  return merged
}

// ---- The hamper ----------------------------------------------------------------------

/** In the hamper and not in a running load. */
const waiting = (textile: Textile) => textile.status === 'dirty' && textile.inLoad === null
const handWashOnly = (textile: Textile) => effectiveWashMethod(textile) === 'hand_wash'

/** What Make loads can wash: the hamper, apart from hand-wash-only garments (guests included). */
export function machineHamper(textiles: readonly Textile[]): Textile[] {
  return textiles.filter((textile) => waiting(textile) && !handWashOnly(textile))
}

/** Hand wash only: listed apart, never in Make loads or the hamper count. */
export function handWashList(textiles: readonly Textile[]): Textile[] {
  return textiles.filter((textile) => waiting(textile) && handWashOnly(textile))
}

export type HamperGroup = { readonly key: string; readonly name: string; readonly guests: boolean; readonly rows: readonly Textile[] }

/**
 * Hamper rows grouped by whose they are: each person in the household's order, then shared, then
 * guests. With one wearer in the household (or none registered yet) there is nobody to share with,
 * so a garment with no wearer set is that person's own, never "Shared"; and a group heading is
 * dropped when it is the only group, since it would tell nothing apart.
 */
export function hamperGroups(textiles: readonly Textile[], wearers: Inventory['wearers']): HamperGroup[] {
  const hamper = machineHamper(textiles)
  const known = new Set<string>(wearers.map((wearer) => wearer.wearerId))
  const noWearer = (textile: Textile) => !textile.guest && (textile.wearerId === null || !known.has(textile.wearerId))
  const solo = wearers.length === 1 ? wearers[0]! : null
  const people: HamperGroup[] = wearers.map((wearer) => ({
    key: wearer.wearerId as string,
    name: wearer.name,
    guests: false,
    rows: hamper.filter((textile) => (!textile.guest && textile.wearerId === wearer.wearerId) || (solo !== null && wearer.wearerId === solo.wearerId && noWearer(textile))),
  }))
  const shared: HamperGroup | null = solo === null ? { key: 'shared', name: noWearerWords, guests: false, rows: hamper.filter(noWearer) } : null
  const guests: HamperGroup = { key: 'guests', name: planningText.guests, guests: true, rows: hamper.filter((textile) => textile.guest) }
  const groups = [...people, shared, guests].filter((group): group is HamperGroup => group !== null && group.rows.length > 0)
  return groups.length === 1 ? [{ ...groups[0]!, name: '' }] : groups
}

/**
 * The garments Make loads will wash: the machine hamper minus the rows marked "Not this time" on
 * this device. A garment that became dirty since the device last saw the hamper starts selected.
 */
export function hamperSelection(hamperIds: readonly string[], draft: Pick<PlanningDraft, 'selectedTextileIds' | 'seenTextileIds'> | null): string[] {
  if (draft === null) return [...hamperIds]
  const seen = new Set(draft.seenTextileIds)
  const chosen = new Set(draft.selectedTextileIds)
  return hamperIds.filter((id) => chosen.has(id) || !seen.has(id))
}
