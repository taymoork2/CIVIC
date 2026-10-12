import { Button } from '@/components/ui/button'
import { RadioGroup } from '@/components/ui/radio-group'
import { dryingMethods, labelMethod, methodEvidence, neededBy, type DryMethod, type DryingMethod, type MethodEvidence, type MethodSource, type NeededBy } from '@washcloset/planner'
import { useState, type ReactNode } from 'react'

import { dryMethodText, dryingText } from '@/copy'
import { dryLabelWords, dryingDesignText } from '@/copy-drying'
import { AnswerRow, Callout, Note } from '@/laundry/laundry-ui'
import { SymbolTile, SymbolTiles } from '@/laundry/question-parts'
import type { CareSymbolKind } from '@/closet/care-symbols'
import { Sheet } from '@/kit/sheet'
import { ChipRow, dryMethodLabels } from '@/kit/ui'

/** The care symbol for each drying method. */
const methodSymbol: Record<DryingMethod, CareSymbolKind> = { tumble: 'tumble_dry', heated_hanging: 'drip_dry', rack_line: 'line_dry', flat: 'dry_flat' }

/** The drying label in words, as recorded. */
export function labelWords(label: string): string {
  return dryMethodLabels[label as DryMethod] ?? dryMethodLabels.unknown
}

/** What the recorded label says about a method, in the design's words ("Conflicts: label says do not tumble dry"). */
export function evidenceWords(evidence: MethodEvidence, label: string, labelText: string = dryLabelWords(label)): string {
  return evidence === 'conflict' ? dryMethodText.evidence.conflict(labelText) : dryMethodText.evidence[evidence]
}

/**
 * The short tag on a row whose method isn't simply the label's: "This time only · differs from label",
 * "Your preference · not specified by label". Empty when the label decides.
 */
export function methodTag(source: MethodSource | null, evidence: MethodEvidence | null): string {
  if (source === 'stain') return dryMethodText.stain.tag
  if (source === null || source === 'label' || evidence === null) return ''
  const head = source === 'routine' ? 'Wash & dry preferences' : source === 'once' ? dryMethodText.tag.once : dryMethodText.tag.preference
  const tail = evidence === 'conflict' ? dryMethodText.tag.conflict : evidence === 'not_specified' || evidence === 'tag_unknown' ? dryMethodText.tag.not_specified : evidence === 'not_established' ? dryMethodText.tag.not_established : null
  return tail === null ? head : `${head} · ${tail}`
}

export const stainAnswers = ['gone', 'lighter', 'still_there'] as const
export type StainAnswer = (typeof stainAnswers)[number]

export type MethodChoice = {
  /** The method to send: the chosen one, or null to fall back to the preference or label. */
  readonly method: DryingMethod | null
  /** False when only "Needed by" changed, or the current method was kept. */
  readonly methodChanged: boolean
  readonly remember: boolean
  readonly need: NeededBy | null
}

function Facts({ rows }: { rows: readonly (readonly [string, ReactNode])[] }) {
  return <dl className="m-0 rounded-control bg-background px-3.5">
    {rows.map(([term, value]) => <div key={term} className="flex min-h-11 items-center justify-between gap-3 py-2.5 text-[length:var(--step-0)] leading-normal [&+&]:[border-block-start:1px_solid_var(--line)]"><dt className="text-muted-foreground">{term}</dt><dd className="m-0 text-end font-semibold">{value}</dd></div>)}
  </dl>
}

/** Buttons that act at once, under the choices: two sit side by side, wrapping when the text is large. */
function Actions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-2 [&>*]:min-w-0 [&>*]:flex-[1_1_10rem] [&>*]:whitespace-normal">{children}</div>
}

type NeedValue = NeededBy | 'none'
const needOptions: readonly { value: NeedValue; label: string }[] = [
  { value: 'none', label: dryingDesignText.method.needNone },
  ...neededBy.map((entry) => ({ value: entry as NeedValue, label: dryingDesignText.method.needOptions[entry] })),
]

type Equipment = Readonly<Record<'tumble' | 'heated_hanging', boolean>>
const lacksEquipment = (method: DryingMethod, equipment: Equipment) => (method === 'tumble' || method === 'heated_hanging') && !equipment[method]
/**
 * The methods offered: hanging and laying flat need nothing anyone lacks; a dryer or a heated hanging dryer
 * only once the household has recorded one. `keep` stays listed so a piece can be moved off it.
 */
const usableMethods = (equipment: Equipment, keep: DryingMethod | null) => dryingMethods.filter((entry) => !lacksEquipment(entry, equipment) || entry === keep)

/**
 * "Change drying method" for one queued piece (design `case 'qmove'`): the garment and where it came
 * from, the label facts up front, four methods each described only by what the recorded label says,
 * then (for a method other than the one the label or preference gives) how to apply it, "Needed by"
 * chips, and the quick actions. Equipment must be recorded to use a tumble or heated hanging dryer.
 * The label itself is never edited, a do-not-tumble label never gets an assumed heat, and nothing
 * here declares a method safe.
 */
export function DryingMethodSheet({ name, count = 1, kicker, label, maxHeat = null, current, initialMethod, preference, routine = null, need, equipment, own, pending, onOwn, onFollowLabel, onStainAnswer, onSave, onClose }: {
  name: string
  count?: number
  /** "from Washer 9". */
  kicker?: ReactNode
  label: string
  /** The hottest heat the label allows, for the label's words ("Tumble dry, low heat"). */
  maxHeat?: string | null
  current: DryingMethod | null
  /** A caller-owned draft can reopen the chooser with an unsaved method selected. */
  initialMethod?: DryingMethod
  preference: DryingMethod | null
  routine?: DryingMethod | null
  need: NeededBy | null
  equipment: Equipment
  own?: boolean
  pending?: boolean
  onOwn?: () => void
  onFollowLabel?: () => void
  /** Present while the piece air dries for a stain: the answer to "Stain gone?". */
  onStainAnswer?: (answer: StainAnswer) => void
  onSave: (choice: MethodChoice) => void
  onClose: () => void
}) {
  const text = dryingDesignText.method
  const labelText = dryLabelWords(label, maxHeat)
  // An accepted routine precedes the older remembered method; event choices stay separate.
  const base = routine ?? preference ?? labelMethod(label as DryMethod)
  const [method, setMethod] = useState<DryingMethod | null>(initialMethod ?? current)
  const [scope, setScope] = useState<'keep' | 'once' | 'remember' | null>(null)
  const [needBy, setNeedBy] = useState<NeededBy | null>(need)
  const changedMethod = method !== null && method !== current
  const missing = method !== null && lacksEquipment(method, equipment)
  const evidence = method === null ? null : methodEvidence(method, label as DryMethod)
  const needsScope = changedMethod && !missing && method !== base
  const any = changedMethod || needBy !== need
  const ready = any && !missing && (!needsScope || scope !== null)
  const choiceFact = (entry: DryingMethod) => [
    lacksEquipment(entry, equipment) ? (entry === 'heated_hanging' ? text.noHangingDryer : text.noDryer) : evidenceWords(methodEvidence(entry, label as DryMethod), label, labelText),
    entry === current ? dryMethodText.current : '',
  ].filter((part) => part.length > 0).join(' · ')
  const save = () => {
    const apply = changedMethod && !missing && scope !== 'keep'
    onSave({ method: apply ? (needsScope ? method : null) : current, methodChanged: apply, remember: apply && scope === 'remember', need: needBy })
  }

  return <Sheet title={name} kicker={<>{dryingText.pieces(count)}{kicker === undefined ? null : <> · {kicker}</>}</>} onClose={onClose} dirty={any} compactActions
    footer={<Button type="button" disabled={!ready || pending === true} onClick={save}>{needsScope && scope === null ? text.chooseHow : text.save}</Button>}>
    <div className="grid gap-4">
      {onStainAnswer === undefined ? null : <div className="grid gap-2" role="group" aria-label={dryMethodText.stain.question}>
        <p className="m-0 text-[length:var(--step-0)] leading-normal">{dryMethodText.stain.note}</p>
        <p className="m-0 text-[length:var(--step-1)] font-semibold">{dryMethodText.stain.question}</p>
        <AnswerRow label={dryMethodText.stain.question} disabled={pending === true} answers={stainAnswers.map((answer) => ({ key: answer, label: dryMethodText.stain.answers[answer], onClick: () => onStainAnswer(answer) }))} />
      </div>}
      <Facts rows={[
        [dryMethodText.label, labelText],
        [dryMethodText.naturalNotRecorded, dryMethodText.notRecorded],
        ...(preference === null ? [] : [[text.yourPreference, dryMethodText.methods[preference]] as const]),
        ...(routine === null ? [] : [['Wash & dry preferences', dryMethodText.methods[routine]] as const]),
      ]} />
      <RadioGroup aria-label={`${name}, ${dryingText.pieces(count)}`} value={method ?? ''} onValueChange={(value) => { setMethod(value as DryingMethod); setScope(null) }}>
        <SymbolTiles label={`${name}, ${dryingText.pieces(count)}`}>
          {usableMethods(equipment, current).map((entry) => <SymbolTile key={entry} value={entry} title={dryMethodText.methods[entry]} fact={choiceFact(entry)} symbol={methodSymbol[entry]} />)}
        </SymbolTiles>
      </RadioGroup>
      {missing ? <Callout>{method === 'heated_hanging' ? text.missingHanging : text.missingTumble}</Callout> : null}
      {needsScope && evidence === 'conflict' ? <Callout tone="conflict">{text.conflict(name, count, dryMethodText.methods[method], labelText)}</Callout> : null}
      {needsScope ? (
        <div className="grid gap-2">
          <AnswerRow label={text.chooseHow} answers={[
            ...(evidence === 'conflict' && current !== null ? [{ key: 'keep', label: text.keep, pressed: scope === 'keep', onClick: () => setScope('keep') }] : []),
            { key: 'once', label: text.thisTime, pressed: scope === 'once', onClick: () => setScope('once') },
            { key: 'remember', label: text.remember, pressed: scope === 'remember', onClick: () => setScope('remember') },
          ]} />
          {scope === null ? null : <Note>{scope === 'keep' && current !== null ? dryMethodText.methods[current] : scope === 'once' ? text.thisTimeHint : text.rememberHint(dryMethodText.methods[method], name)}</Note>}
        </div>
      ) : null}
      <div className="grid gap-2">
        <ChipRow label={text.neededBy} options={needOptions} value={needBy ?? 'none'} onChange={(value) => setNeedBy(value === 'none' ? null : value)} />
        <Note>{text.neededByHint}</Note>
      </div>
      {(current === 'tumble' && onOwn !== undefined) || ((preference !== null || routine !== null) && onFollowLabel !== undefined) ? (
        <Actions>
          {current === 'tumble' && onOwn !== undefined ? <Button type="button" variant="tonal" disabled={pending === true} onClick={onOwn}>{own === true ? text.mergeBack : count > 1 ? text.individualLoads : text.ownLoad}</Button> : null}
          {(preference !== null || routine !== null) && onFollowLabel !== undefined ? <Button type="button" variant="tonal" disabled={pending === true} onClick={onFollowLabel}>{text.followLabel}</Button> : null}
        </Actions>
      ) : null}
    </div>
  </Sheet>
}

/**
 * The garment record's "Drying preference" (design `dpref`): the label unchanged, natural drying not
 * recorded, the remembered method, a chooser to change it, the scope note, Follow label again, and
 * Change preference.
 */
export function DryingPreferenceSheet({ label, preference, equipment, pending, onChange, onFollowLabel, onClose }: {
  /** Kept for callers that still pass it; the design's sheet has no kicker. */
  name?: string
  label: string
  preference: DryingMethod
  equipment: Equipment
  pending?: boolean
  onChange: (method: DryingMethod) => void
  onFollowLabel: () => void
  onClose: () => void
}) {
  const text = dryingDesignText
  const labelText = dryLabelWords(label)
  const [method, setMethod] = useState<DryingMethod>(preference)
  const needs = (entry: DryingMethod) => lacksEquipment(entry, equipment) && entry !== preference
  return <Sheet title={dryMethodText.preferenceTitle} onClose={onClose} dirty={method !== preference} compactActions
    footer={<Button type="button" disabled={method === preference || pending === true} onClick={() => onChange(method)}>{text.preference.changePreference}</Button>}>
    <div className="grid gap-4">
      <Facts rows={[[dryMethodText.label, dryMethodText.unchanged(labelText)], [dryMethodText.naturalNotRecorded, dryMethodText.notRecorded], [dryMethodText.preferenceMark, dryMethodText.methods[preference]]]} />
      <RadioGroup aria-label={dryMethodText.preferenceTitle} value={method} onValueChange={(value) => setMethod(value as DryingMethod)}>
        <SymbolTiles label={dryMethodText.preferenceTitle}>
          {usableMethods(equipment, preference).map((entry) => (
            <SymbolTile key={entry} value={entry} title={dryMethodText.methods[entry]} symbol={methodSymbol[entry]}
              fact={needs(entry) ? dryMethodText.needsEquipment : evidenceWords(methodEvidence(entry, label as DryMethod), label, labelText)} />
          ))}
        </SymbolTiles>
      </RadioGroup>
      <Note>{text.preference.scopeNote}</Note>
      <Actions><Button type="button" variant="tonal" disabled={pending === true} onClick={onFollowLabel}>{text.method.followLabel}</Button></Actions>
    </div>
  </Sheet>
}
