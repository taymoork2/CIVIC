import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useState } from 'react'

import { helpTipText } from '@/copy'
import { nextStepText, sharedStartText } from '@/copy-drying'
import { HelpTip } from '@/kit/help-tip'
import { dryerWaitTrialText } from '@/copy-trial'
import { aboutTime, nextStepWords, type NextStep } from '@/home/hub-state'
import { saveDryerSays } from '@/laundry/laundry-day'
import { DesignIcon } from '@/kit/design-icons'
import { ReceiptRows } from '@/laundry/laundry-kit'
import { FooterLink, SegmentChoice, TextField, TrialNote } from '@/laundry/laundry-ui'
import { clockTime } from '@/kit/ui'

/** The Next card is a plain card on the page: a small label, the one step in words, its detail and, while the dryer runs, one field. */
const nextCardClassName = cn(
  "next-step-card",
  "grid min-w-0 gap-3 rounded-card bg-card p-4 shadow-[var(--shadow-sm)]",
)

const eyebrowClassName = cn(
  "next-step-eyebrow",
  "m-0 text-[length:var(--step--1)] font-semibold text-muted-foreground",
)

const nextTitleClassName = cn(
  "next-step-title",
  "m-0 text-[length:var(--step-2)] font-semibold leading-[1.3] [overflow-wrap:anywhere]",
)

const nextDetailClassName = cn(
  "next-step-detail",
  "m-0 max-w-none text-[length:var(--step-0)] leading-normal text-ink-2 [overflow-wrap:anywhere]",
)

const saysFormClassName = cn(
  "dryer-says-form",
  "grid gap-3 border-0 [border-block-start:1px_solid_var(--line)] pt-3",
)

/**
 * The Laundry tab's "Next" card at home (design 9.1): the next wash joined to this trip or held back
 * so it ends with the dryer, with "Dryer says: __ min" to re-time it and a server reminder for a
 * held-back start. Every time here is an estimate, and says so.
 */
export function NextStepCard({ step, moving, now }: { step: NextStep; moving: boolean; now: number }) {
  const words = nextStepWords(step, moving)
  const held = !moving && step.at !== null
  const [typed, setTyped] = useState('')
  const minutes = Number(typed)
  const valid = typed !== '' && Number.isInteger(minutes) && minutes > 0 && minutes <= 240
  return (
    <section className={nextCardClassName} aria-label={nextStepText.eyebrow}>
      <p className={eyebrowClassName} aria-hidden="true">{nextStepText.eyebrow}</p>
      <h2 className={nextTitleClassName}>{words.title}</h2>
      {held ? (
        <>
          <ReceiptRows flat label={nextStepText.eyebrow} facts={[
            { key: 'load', tone: 'neutral', icon: <DesignIcon name="fold" />, label: `Load ${step.number}`, value: step.name ?? '' },
            { key: 'wash', tone: 'wash', icon: <DesignIcon name="washer" />, label: nextStepText.heldFacts.washTakes, value: nextStepText.heldFacts.washMinutes(step.washMinutes, step.washSource, step.washCount) },
            { key: 'done', tone: 'dry', icon: <DesignIcon name="dryer" />, label: nextStepText.heldFacts.done, value: nextStepText.heldFacts.doneAt(clockTime(aboutTime(step.dryerEnd))) },
          ]} />
          <p className={nextDetailClassName}>{nextStepText.ifNow(Math.round(step.waitNow / 5) * 5)}</p>
        </>
      ) : <p className={nextDetailClassName}>{words.detail}</p>}
      {moving || step.at === null || step.loadId === null ? null : <p className={nextDetailClassName}>{nextStepText.remindAt(clockTime(aboutTime(step.at)))}<HelpTip topic={helpTipText.heldStart.topic}>{helpTipText.heldStart.words}</HelpTip></p>}
      {step.dryerKey === null ? null : (
        <form className={saysFormClassName} onSubmit={(event) => {
          event.preventDefault()
          if (!valid || step.dryerKey === null) return
          saveDryerSays({ key: step.dryerKey, end: now + minutes * 60_000 })
          setTyped('')
        }}>
          <TextField label={nextStepText.dryerSays} help={<HelpTip topic={helpTipText.dryerSays.topic}>{helpTipText.dryerSays.words}</HelpTip>} inputMode="numeric" pattern="[0-9]*" enterKeyHint="done" hint={nextStepText.dryerSaysHint}
            placeholder={nextStepText.minutes} value={typed} onChange={(event) => setTyped(event.target.value.replace(/\D/g, '').slice(0, 3))} />
          <Button type="submit" variant="tonal" className="w-full" disabled={!valid} aria-label={nextStepText.saveDryerTime}>{nextStepText.save}</Button>
        </form>
      )}
      <TrialNote>{dryerWaitTrialText.nextStep}</TrialNote>
    </section>
  )
}

const countsClassName = cn(
  "shared-counts",
  "grid w-full min-w-0 gap-3",
)

const countsHeadClassName = cn(
  "shared-counts-head",
  "flex min-w-0 items-center justify-between gap-2",
)

const countsTitleClassName = cn(
  "shared-counts-title",
  "m-0 min-w-0 text-[length:var(--step-1)] font-semibold",
)

const countsLabelClassName = cn(
  "shared-counts-label",
  "m-0 min-w-0 text-[length:var(--step-0)] font-semibold",
)

/**
 * A shared room at the start of a pass (design 11), in the footer under the thumb: "Washers free" and
 * "Dryers free", one tap each. The second tap answers; nothing is stored as machine status.
 */
export function SharedCounts({ onAnswer, onSkip }: { onAnswer: (washers: number, dryers: number) => void; onSkip: () => void }) {
  const [washers, setWashers] = useState<number | null>(null)
  const [dryers, setDryers] = useState<number | null>(null)
  const pick = (which: 'washers' | 'dryers', value: number) => {
    const next = { washers, dryers, [which]: value }
    if (which === 'washers') setWashers(value)
    else setDryers(value)
    if (next.washers !== null && next.dryers !== null) onAnswer(next.washers, next.dryers)
  }
  const row = (which: 'washers' | 'dryers', picked: number | null) => (
    <div className="grid gap-2">
      <p id={`shared-count-${which}`} className={countsLabelClassName}>{sharedStartText[which]}</p>
      <SegmentChoice labelledBy={`shared-count-${which}`} value={picked === null ? '' : String(picked)}
        options={sharedStartText.counts.map((count) => ({ value: String(count.value), label: count.label }))} onChange={(value) => pick(which, Number(value))} />
    </div>
  )
  return (
    <div className={countsClassName}>
      <div className={countsHeadClassName}>
        <p className={countsTitleClassName}>{sharedStartText.title}</p>
        <FooterLink onClick={onSkip}>{sharedStartText.skip}</FooterLink>
      </div>
      {row('washers', washers)}
      {row('dryers', dryers)}
    </div>
  )
}
