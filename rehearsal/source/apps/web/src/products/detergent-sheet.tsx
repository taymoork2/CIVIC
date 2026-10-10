import { useQuery } from 'convex/react'
import { useState } from 'react'

import type { Id } from '@convex/_generated/dataModel'
import { api } from '@/api'
import { bottleUseWords, productText } from '@/copy'
import { productContentsCopy } from '@/copy-household'
import { detergentCauseWords, detergentText as text } from '@/copy-detergent'
import { draftFromSupply } from '@/products/bottle-sheet'
import { Button } from '@/components/ui/button'
import { RadioGroup } from '@/components/ui/radio-group'
import type { Supply } from '@/household/inventory-types'
import { Callout, ChangeCard, Note, capital } from '@/laundry/laundry-ui'
import { DesignIcon, type DesignIconName } from '@/kit/design-icons'
import { ChoiceCard } from '@/laundry/question-parts'
import type { PlanLoad } from '@/laundry/laundry-pass'
import { passArgs } from '@/laundry/laundry-pass'
import { Sheet } from '@/kit/sheet'
import { ErrorNotice, useConvexCall } from '@/kit/ui'
import { doseParts, useUnits, type DoseLike } from '@/kit/units'

/**
 * One detergent per load, switchable. The planner puts a single detergent in each load and lists
 * the others with whether they fit; this sheet is where the person chooses, as the design's
 * "Detergent" (`pick`) and "Switch detergent" (`sub`, kicker "Ran out"). Nothing is substituted
 * until a choice is confirmed.
 */

/** A detergent as the planner and the pack describe it: for a choice, never a recommendation. */
export type DetergentChoice = {
  readonly supplyId: string
  readonly name: string
  readonly fits: boolean
  readonly cause?: string
  readonly form: string | null
  readonly bleach: string | null
}

/** A product that is this load's detergent when planned: a detergent or pods, by what it is used for. */
export const isDetergentSupply = (supply: Pick<Supply, 'use'>): boolean => supply.use === 'detergent' || supply.use === 'pods'

const formIcon: Record<string, DesignIconName> = { Liquid: 'bottle', Pods: 'pod', Powder: 'powder', Spray: 'spray', 'Dryer sheets': 'dryerSheet', 'Dryer balls': 'dryerBalls', 'Scent beads': 'beads', Dispenser: 'dispenser' }

/** The form of a product in the words of its sheet ("Liquid", "Pods"), when its record tells. */
export function supplyForm(supply: Supply): string | null {
  if (supply.formulation?.form === 'spray') return 'Spray'
  const form = draftFromSupply(supply).form
  return form === null ? null : productText.forms[form]
}

/** What a product is used for, in the words of its sheet; "Product" when its record doesn't say. */
export function supplyRole(supply: Supply): string {
  if (supply.use === 'stain_remover') return 'Pretreatment'
  if (isDetergentSupply(supply)) return bottleUseWords.detergent
  const use = draftFromSupply(supply).use
  return use === null ? 'Product' : bottleUseWords[use]
}

/** Every detergent left in this pass, from the plan's load, with whether it fits and why not. */
export function detergentChoices(load: Pick<PlanLoad, 'detergent'>, supplies: readonly Supply[]): DetergentChoice[] {
  return (load.detergent?.options ?? []).flatMap((option) => {
    const supply = supplies.find((entry) => entry.supplyId === option.supplyId)
    if (supply === undefined) return []
    const bleach = supply.safety?.bleachKind
    return [{
      supplyId: option.supplyId,
      name: supply.name,
      fits: option.fits,
      ...(option.cause === undefined ? {} : { cause: option.cause }),
      form: supplyForm(supply),
      bleach: bleach === undefined ? null : productContentsCopy.rowBleach[bleach].toLowerCase(),
    }]
  })
}

/** One line of "What changes": a product and its amount where it goes, or that it isn't used. */
export type PreviewStep = {
  readonly name: string
  readonly placement: string
  readonly dose: DoseLike
  readonly atMachine: boolean
}

export function DetergentSheet({ mode, loadTitle, current, choices, added, changes, note, pending, error, onSelect, onClose, onConfirm }: {
  mode: 'pick' | 'sub'
  /** "Load 1": the kicker of the pick sheet. */
  loadTitle: string
  /** The load's detergent now; the switch sheet lists the others. */
  current: { readonly supplyId: string; readonly name: string } | null
  choices: readonly DetergentChoice[]
  /** The current detergent was already added during Preparation: how much, in words ("30 mL"), or null when unknown. */
  added?: { readonly amount: string | null } | null
  /** What the picked detergent changes in the recipe; undefined while it is worked out, null when it can't be told. */
  changes?: readonly { readonly stage: string; readonly from: PreviewStep | null; readonly to: PreviewStep | null }[] | null
  /** A line under the choices: what confirming does. */
  note?: string
  pending?: boolean
  error?: string | null
  onSelect?: (supplyId: string | null) => void
  onClose: () => void
  onConfirm: (supplyId: string) => void
}) {
  const { system } = useUnits()
  const [picked, setPicked] = useState<string | null>(null)
  const list = mode === 'sub' ? choices.filter((choice) => choice.supplyId !== current?.supplyId) : choices
  const chosen = list.find((choice) => choice.supplyId === picked) ?? null
  const unavailable = chosen !== null && !chosen.fits
  const unchanged = mode === 'pick' && chosen !== null && chosen.supplyId === current?.supplyId
  const line = (step: PreviewStep) => text.stepLine(step.name, step.atMachine ? text.atMachine : doseParts(step.dose, system).spoken) + ` · ${step.placement.replace(/_/g, ' ')}`
  const sub = (choice: DetergentChoice): string => {
    if (mode === 'sub') return choice.fits ? text.sub.fits(choice.form ?? bottleUseWords.detergent) : text.sub.excluded
    const cause = choice.fits ? 'fits' : detergentCauseWords[choice.cause ?? ''] ?? 'needs a check'
    return [choice.form, choice.bleach, cause].filter((part) => part !== null).join(' · ')
  }
  const alreadyIn = mode === 'sub' && added !== undefined && added !== null && current !== null
  return (
    <Sheet
      kicker={text.pick.kicker(loadTitle)}
      title={mode === 'sub' ? text.sub.title : text.pick.title}
      onClose={onClose}
      dirty={picked !== null}
      footer={(
        <>
          <Button size="lg" className="w-full" disabled={chosen === null || unavailable || unchanged || pending === true} onClick={() => { if (chosen !== null) onConfirm(chosen.supplyId) }}>
            {mode === 'pick' ? text.pick.confirm : alreadyIn ? text.sub.didntGoIn : text.sub.confirm}
          </Button>
          {alreadyIn ? <Button variant="link" size="sm" type="button" className="font-semibold" onClick={onClose}>{text.sub.keep}</Button> : null}
        </>
      )}
    >
      <div className="grid gap-6">
        {alreadyIn && current !== null ? <Callout tone="conflict">{text.sub.alreadyIn(added.amount, current.name)}</Callout> : null}
        {list.length === 0 ? <Note>{text.sub.none}</Note> : (
          <RadioGroup value={picked ?? ''} onValueChange={(value) => { setPicked(value); onSelect?.(value) }}>
            {list.map((choice) => <ChoiceCard key={choice.supplyId} value={choice.supplyId} title={choice.name} fact={sub(choice)} lead={<DesignIcon name={formIcon[choice.form ?? ''] ?? 'bottle'} size={24} />} />)}
          </RadioGroup>
        )}
        {unavailable ? <Note>{text.sub.unavailable}</Note> : null}
        {mode === 'sub' && chosen !== null && chosen.fits && changes !== undefined && changes !== null && changes.length > 0 ? (
          <ChangeCard heading={text.sub.changes} changes={changes.map((change) => ({
            title: capital(change.stage),
            ...(change.from === null ? {} : { from: line(change.from) }),
            to: change.to === null ? text.noStep : line(change.to),
          }))} />
        ) : null}
        {note === undefined ? null : <Note>{note}</Note>}
        <ErrorNotice error={error ?? null} />
      </div>
    </Sheet>
  )
}

/**
 * "Ran out? Switch product" at Preparation. A load's steps are fixed once it is started, so the
 * switch cancels this load, plans the same garments again with the chosen detergent (the one that ran
 * out is marked so, and nothing is substituted by the planner), and opens the new plan; the load then
 * goes through the washer and the recipe once more. Nothing is poured by it.
 */
export function SessionDetergentSheet({ sessionId, planId, loadId, householdId, current, added, online, onClose, onSwitched }: {
  sessionId: Id<'sessions'>
  planId: Id<'plans'>
  loadId: string
  householdId: Id<'households'>
  current: { readonly supplyId: string; readonly name: string }
  added: { readonly amount: string | null } | null
  online: boolean
  onClose: () => void
  /** The new plan, planned with the chosen detergent. */
  onSwitched: (planId: Id<'plans'>) => void
}) {
  const plan = useQuery(api.plans.get, { planId })
  const inventory = useQuery(api.inventory.list, { householdId })
  const [picked, setPicked] = useState<string | null>(null)
  const preview = useQuery(api.plans.detergentPreview, picked === null ? 'skip' : { planId, loadId, supplyId: picked as Id<'supplies'> })
  const cancel = useConvexCall(api.execution.cancel)
  const ranOut = useConvexCall(api.inventory.setRanOut)
  const recompute = useConvexCall(api.plans.recompute)
  const load = plan?.result.loads.find((entry) => entry.id === loadId)
  const choices = load === undefined || inventory === undefined ? [] : detergentChoices(load, inventory.supplies)
  const pending = cancel.pending || ranOut.pending || recompute.pending
  const switchTo = async (supplyId: string) => {
    if (plan === undefined || plan === null || plan.textileIds === null) return
    if (await cancel.run({ sessionId }) === undefined) return
    await ranOut.run({ supplyId: current.supplyId as Id<'supplies'>, ranOut: true })
    const result = await recompute.run({
      householdId,
      selectedTextileIds: plan.textileIds,
      clientInputHash: plan.inputHash,
      ...passArgs({ ...plan.pass, detergentId: supplyId as Id<'supplies'> }),
    })
    if (result !== undefined) onSwitched(result.planId)
  }
  return (
    <DetergentSheet
      mode="sub"
      loadTitle=""
      current={current}
      choices={choices}
      added={added}
      changes={preview === undefined ? undefined : preview === null ? null : preview.changes}
      note={online ? text.sub.restart : text.sub.offline}
      pending={pending || !online}
      error={cancel.error ?? ranOut.error ?? recompute.error}
      onSelect={setPicked}
      onClose={onClose}
      onConfirm={(supplyId) => void switchTo(supplyId)}
    />
  )
}
