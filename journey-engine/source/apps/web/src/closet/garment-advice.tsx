import { useId, useState } from 'react'
import type { FunctionArgs } from 'convex/server'
import { printfulCareSource, constructionCareSource, constructionFeatures, type ConstructionFeature } from '@washcloset/planner'
import { api } from '@/api'
import { Sheet } from '@/kit/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldLabel } from '@/components/ui/field'
import { NativeSelect } from '@/components/ui/native-select'
import { ErrorNotice, useConvexCall } from '@/kit/ui'
import type { Textile } from '@/household/inventory-types'
import { matchingGroups, type MatchingGroup } from '@/closet/garment-groups'
import { countWord } from '@/copy'
import { ActionList } from '@/laundry/laundry-ui'

type Decoration = FunctionArgs<typeof api.garmentAdvice.setDecoration>['facts']
type Construction = FunctionArgs<typeof api.garmentAdvice.setConstruction>['facts']
type Advice = { reason: string; source: string }
const empty: Decoration = { kind: 'unknown', method: 'unknown', manufacturer: '', source: '', confidence: 'unknown' }
const scope = (count: number) => count === 1 ? 'this piece' : `these ${count} pieces`
const featureNames: Record<ConstructionFeature, string> = { zipper: 'Zippers', hooks: 'Hooks and eyes', buttons: 'Buttons', delicateTrim: 'Delicate trim (such as lace, beads or sequins)' }
const unclear = { presence: 'unknown' as const, confidence: 'unknown' as const, source: '' }

/** A fact as comparable text: object keys sorted, so the same facts written by different editors compare equal. */
const sameFact = (value: unknown) => JSON.stringify(value ?? null, (_key, entry: unknown) => entry !== null && typeof entry === 'object' && !Array.isArray(entry) ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b))) : entry)

export type FactGroup = MatchingGroup<Textile> & { readonly label?: string }

/**
 * A record's matching pieces that share one fact, shown once. Only when the pieces disagree is each
 * group labelled, by its count and what it records, never by position ("piece 2 of 2"). The record
 * already holds one matching group, so pieces split only by `fact`.
 */
export function factGroups(textiles: readonly Textile[], fact: (piece: Textile) => unknown, describe: (piece: Textile) => string): FactGroup[] {
  const groups = matchingGroups(textiles, () => ({ name: '' }), (piece) => sameFact(fact(piece)))
  if (groups.length < 2) return groups
  const seen = new Set<string>()
  return groups.map((group) => {
    const words = describe(group.first)
    const label = `${countWord(group.members.length, 'piece')} · ${seen.has(words) ? `${words}, recorded differently` : words}`
    seen.add(words)
    return { ...group, label }
  })
}

/** Decoration facts without their per-piece write stamps. */
const decorationFact = (piece: Textile) => {
  if (piece.decoration === undefined) return null
  const { revision: _revision, recordedAt: _at, recordedBy: _by, ...facts } = piece.decoration
  return facts
}
const decorationWords = (piece: Textile) => piece.decoration?.kind === undefined || piece.decoration.kind === 'unknown' ? 'Decoration not recorded' : piece.decoration.kind === 'none' ? 'No decoration recorded' : piece.decoration.kind === 'printed' ? `Printed · ${piece.decoration.method.replaceAll('_', ' ')}` : 'Embroidered'

export function AdviceExplanation({ advice }: { advice: Advice }) {
  const id = useId()
  const [open, setOpen] = useState(false)
  return <div className="grid min-w-0 gap-2">
    <p className="m-0 text-ink-2">{advice.reason}</p>
    <Button type="button" variant="outline" className="justify-self-start whitespace-normal" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>Advice source</Button>
    {open ? <div id={id} className="grid min-w-0 gap-2 break-words text-[length:var(--step--1)]">
      {advice.source === printfulCareSource || advice.source === constructionCareSource ? <a className="text-link font-semibold" href={advice.source} target="_blank" rel="noopener noreferrer">{advice.source === printfulCareSource ? 'Printful product care guidance' : 'Whirlpool general laundry guidance'}</a> : <p className="m-0">{advice.source}</p>}
      <p className="m-0 text-ink-2">Optional handling advice. The recorded label and your reviewed routine stay unchanged.</p>
    </div> : null}
  </div>
}

export function AdviceReminderControls({ textiles, disabled = false }: { textiles: readonly Textile[]; disabled?: boolean }) {
  const save = useConvexCall(api.garmentAdvice.setReminder)
  const hidden = textiles.filter((piece) => piece.adviceReminder?.enabled === false).length
  const stored = textiles.some((piece) => piece.adviceReminder !== undefined)
  const change = (enabled: boolean | null) => void save.run({ textileIds: textiles.map((piece) => piece.textileId), enabled })
  return <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 rounded-control border border-line p-3 [overflow-wrap:anywhere]">
    <p className="m-0">Optional advice for {scope(textiles.length)}: {hidden === textiles.length ? 'hidden' : hidden > 0 ? 'mixed preferences' : 'shown when supported'}{stored ? ' · remembered' : ' · default'}</p>
    <p className="m-0 text-ink-2 text-[length:var(--step--1)]">Applies to future washes of {scope(textiles.length)}. Required label instructions remain visible.</p>
    <div className="flex min-w-0 flex-wrap gap-2">
      <Button type="button" variant="outline" className="min-w-0 max-w-full whitespace-normal px-3" disabled={disabled || save.pending || textiles.length === 0} onClick={() => change(hidden === textiles.length)}>{hidden === textiles.length ? 'Show optional advice' : 'Hide optional advice'}</Button>
      {stored ? <Button type="button" variant="outline" className="min-w-0 max-w-full whitespace-normal px-3" disabled={disabled || save.pending} onClick={() => change(null)}>Reset advice preference</Button> : null}
    </div>
    <ErrorNotice error={save.error} />
  </div>
}

/** The print and advice details; the garment sheet's care list holds the row that expands them. */
export function GarmentPrintDetails({ textiles, expanded, editable = true }: { textiles: readonly Textile[]; expanded: boolean; editable?: boolean }) {
  const [open, setOpen] = useState(false)
  const [constructionOpen, setConstructionOpen] = useState(false)
  const id = useId()
  return <div className="grid min-w-0 gap-3">
    {expanded ? <div id={id} className="grid min-w-0 gap-3">
      {factGroups(textiles, decorationFact, decorationWords).map(({ key, first: piece, label }) => <div key={key} className="grid min-w-0 gap-1 break-words text-[length:var(--step--1)]">
        <p className="m-0">{label ?? decorationWords(piece)}</p>
        {piece.decoration?.source ? <p className="m-0 text-ink-2">{piece.decoration.manufacturer ? `Maker: ${piece.decoration.manufacturer} · ` : ''}Source: {piece.decoration.source}</p> : null}
        {piece.decoration?.kind !== undefined && piece.decoration.kind !== 'unknown' ? <p className="m-0 text-ink-2">Decoration evidence: {piece.decoration.confidence}{piece.decoration.guidanceSource === printfulCareSource ? ' · checked Printful embroidery care source' : ''}</p> : null}
        <ConstructionSummary facts={piece.decoration?.construction} />
      </div>)}
      {editable ? <><ActionList label="Record details" chevrons actions={[
        { key: 'print', label: 'Record print details', onClick: () => setOpen(true) },
        { key: 'construction', label: 'Record construction details', onClick: () => setConstructionOpen(true) },
      ]} />
      <AdviceReminderControls textiles={textiles} /></> : null}
    </div> : null}
    {open ? <DecorationSheet textiles={textiles} onClose={() => setOpen(false)} /> : null}
    {constructionOpen ? <ConstructionSheet textiles={textiles} onClose={() => setConstructionOpen(false)} /> : null}
  </div>
}

export function ConstructionSummary({ facts }: { facts?: Construction }) {
  return <div className="grid min-w-0 gap-1">
    {constructionFeatures.map((feature) => {
      const fact = facts?.[feature]
      return <p key={feature} className="m-0 text-ink-2">{featureNames[feature]}: {fact === undefined || fact.presence === 'unknown' ? 'not recorded or unclear' : `${fact.presence === 'present' ? 'present' : 'not present'} · ${fact.confidence} · Source: ${fact.source}`}</p>
    })}
  </div>
}

export function ConstructionSheet({ textiles, onClose }: { textiles: readonly Textile[]; onClose: () => void }) {
  const id = useId()
  const [initial] = useState(textiles)
  const [selected, setSelected] = useState<string[]>([])
  const [draft, setDraft] = useState<Construction>({})
  const [feature, setFeature] = useState<ConstructionFeature>(constructionFeatures[0]!)
  const [checked, setChecked] = useState(false)
  const save = useConvexCall(api.garmentAdvice.setConstruction)
  const chosen = initial.filter((piece) => selected.includes(piece.textileId))
  const choose = (ids: string[]) => {
    setSelected(ids); setChecked(false)
    // Each piece can have different facts. Never seed a bulk edit from just one of them.
    setDraft(ids.length === 1 ? initial.find((piece) => piece.textileId === ids[0])?.decoration?.construction ?? {} : {})
  }
  const update = (feature: ConstructionFeature, fact: NonNullable<Construction[ConstructionFeature]>) => {
    setDraft({ ...draft, [feature]: fact }); setChecked(false)
  }
  const valid = constructionFeatures.every((feature) => {
    const fact = draft[feature]
    return fact === undefined || fact.presence === 'unknown' || fact.confidence !== 'unknown' && Boolean(fact.source.trim())
  })
  const commit = async () => {
    if (await save.run({ textileIds: chosen.map((piece) => piece.textileId), facts: draft, expectedRevisions: chosen.map((piece) => ({ textileId: piece.textileId, revision: piece.decoration?.revision ?? 0 })) }) !== undefined) onClose()
  }
  return <Sheet title="Construction details" onClose={onClose} closeAtTop tall dirty={selected.length > 0 || Object.keys(draft).length > 0} footer={<>
    <ErrorNotice error={save.error} /><Button className="min-w-0 whitespace-normal [overflow-wrap:anywhere]" variant="outline" disabled={save.pending} onClick={onClose}>Cancel</Button>
    <Button className="min-w-0 whitespace-normal [overflow-wrap:anywhere]" disabled={save.pending || chosen.length === 0 || !checked || !valid} onClick={() => void commit()}>Save construction details</Button>
  </>}>
    <p className="m-0 text-ink-2">Record checked features only. Unknown does not mean absent. These support optional advice; the care label still controls washing and settings.</p>
    <fieldset disabled={save.pending} className="m-0 grid min-w-0 gap-4 border-0 p-0">
      <fieldset className="m-0 grid min-w-0 gap-2 rounded-control border border-line p-3"><legend>Choose pieces</legend>
        {initial.map((piece, index) => <label key={piece.textileId} className="flex min-h-11 items-start gap-3 py-2"><input type="checkbox" className="mt-1 size-5 shrink-0" checked={selected.includes(piece.textileId)} onChange={(event) => choose(event.target.checked ? [...selected, piece.textileId] : selected.filter((key) => key !== piece.textileId))} /><span>{piece.name}{initial.length > 1 ? ` · matching piece ${index + 1}` : ''}</span></label>)}
        {initial.length > 1 ? <Button type="button" variant="outline" className="justify-self-start whitespace-normal" onClick={() => choose(initial.map((piece) => piece.textileId))}>Select all matching pieces</Button> : null}
      </fieldset>
      <Field><FieldLabel htmlFor={`${id}-feature`}>Construction feature</FieldLabel><NativeSelect id={`${id}-feature`} value={feature} onChange={(event) => setFeature(event.target.value as ConstructionFeature)}>{constructionFeatures.map((entry) => <option key={entry} value={entry}>{featureNames[entry]}{draft[entry]?.presence === 'present' ? ' · present' : draft[entry]?.presence === 'absent' ? ' · absent' : ''}</option>)}</NativeSelect></Field>
      {constructionFeatures.filter((entry) => entry === feature).map((feature) => {
        const fact = draft[feature] ?? unclear
        return <fieldset key={feature} className="m-0 grid min-w-0 gap-3 rounded-control border border-line p-3"><legend>{featureNames[feature]}</legend>
          <Field><FieldLabel htmlFor={`${id}-${feature}`}>{featureNames[feature]} present?</FieldLabel><NativeSelect id={`${id}-${feature}`} value={fact.presence} onChange={(event) => update(feature, event.target.value === 'unknown' ? unclear : { ...fact, presence: event.target.value as 'present' | 'absent', confidence: fact.confidence === 'unknown' ? 'observed' : fact.confidence })}><option value="unknown">Not recorded or unclear</option><option value="absent">Checked: not present</option><option value="present">Checked: present</option></NativeSelect></Field>
          {fact.presence !== 'unknown' ? <>
            <Field><FieldLabel htmlFor={`${id}-${feature}-confidence`}>{featureNames[feature]} evidence</FieldLabel><NativeSelect id={`${id}-${feature}-confidence`} value={fact.confidence} onChange={(event) => update(feature, { ...fact, confidence: event.target.value as 'observed' | 'verified' })}><option value="observed">Observed on these pieces</option><option value="verified">Verified from an exact garment reference</option></NativeSelect></Field>
            <Field><FieldLabel htmlFor={`${id}-${feature}-source`}>Where you checked {featureNames[feature].toLowerCase()}</FieldLabel><Input id={`${id}-${feature}-source`} maxLength={500} value={fact.source} onChange={(event) => update(feature, { ...fact, source: event.target.value })} /></Field>
          </> : null}
        </fieldset>
      })}
      <label className="flex min-h-11 items-start gap-3 py-2"><input type="checkbox" className="mt-1 size-5 shrink-0" checked={checked} onChange={(event) => setChecked(event.target.checked)} /><span>I’ve checked these construction facts for {scope(chosen.length)}.</span></label>
    </fieldset>
  </Sheet>
}

function DecorationSheet({ textiles, onClose }: { textiles: readonly Textile[]; onClose: () => void }) {
  const id = useId()
  const [initial] = useState(textiles)
  const [selected, setSelected] = useState<string[]>([])
  const [draft, setDraft] = useState<Decoration>(empty)
  const [checked, setChecked] = useState(false)
  const save = useConvexCall(api.garmentAdvice.setDecoration)
  const chosen = initial.filter((piece) => selected.includes(piece.textileId))
  const update = (next: Decoration) => { setDraft(next); setChecked(false) }
  const commit = async () => {
    if (await save.run({ textileIds: chosen.map((piece) => piece.textileId), facts: draft, expectedRevisions: chosen.map((piece) => ({ textileId: piece.textileId, revision: piece.decoration?.revision ?? 0 })) }) !== undefined) onClose()
  }
  return <Sheet title="Print details" onClose={onClose} closeAtTop tall dirty={selected.length > 0 || JSON.stringify(draft) !== JSON.stringify(empty)} footer={<>
    <ErrorNotice error={save.error} /><Button variant="outline" disabled={save.pending} onClick={onClose}>Cancel</Button>
    <Button disabled={save.pending || chosen.length === 0 || !checked || draft.kind !== 'unknown' && !draft.source.trim()} onClick={() => void commit()}>Save print details</Button>
  </>}>
    <p className="m-0 text-ink-2">Record checked details only. A graphic does not establish its print method or care instructions. The care label stays unchanged.</p>
    <fieldset disabled={save.pending} className="m-0 grid min-w-0 gap-4 border-0 p-0">
      <fieldset className="m-0 grid min-w-0 gap-2 rounded-control border border-line p-3"><legend>Choose pieces</legend>
        {initial.map((piece, index) => <label key={piece.textileId} className="flex min-h-11 items-start gap-3 py-2"><input type="checkbox" className="mt-1 size-5 shrink-0" checked={selected.includes(piece.textileId)} onChange={(event) => { setSelected(event.target.checked ? [...selected, piece.textileId] : selected.filter((key) => key !== piece.textileId)); setChecked(false) }} /><span>{piece.name}{initial.length > 1 ? ` · matching piece ${index + 1}` : ''}</span></label>)}
        {initial.length > 1 ? <Button type="button" variant="outline" className="justify-self-start whitespace-normal" onClick={() => { setSelected(initial.map((piece) => piece.textileId)); setChecked(false) }}>Select all matching pieces</Button> : null}
      </fieldset>
      <Field><FieldLabel htmlFor={`${id}-kind`}>Decoration</FieldLabel><NativeSelect id={`${id}-kind`} value={draft.kind} onChange={(event) => { const { guidanceSource: _source, ...rest } = draft; update({ ...rest, kind: event.target.value as Decoration['kind'], method: 'unknown', confidence: event.target.value === 'unknown' ? 'unknown' : 'observed' }) }}><option value="unknown">Not recorded or unclear</option><option value="none">No decoration</option><option value="printed">Printed graphic</option><option value="embroidered">Embroidery</option></NativeSelect></Field>
      {draft.kind === 'printed' ? <Field><FieldLabel htmlFor={`${id}-method`}>Print method</FieldLabel><NativeSelect id={`${id}-method`} value={draft.method} onChange={(event) => update({ ...draft, method: event.target.value as Decoration['method'] })}><option value="unknown">Not recorded or unclear</option><option value="dtg">Direct to garment (DTG)</option><option value="dtflex">Printful DTFlex</option><option value="screen_print">Screen print</option><option value="other">Other recorded method</option></NativeSelect></Field> : null}
      <Field><FieldLabel htmlFor={`${id}-maker`}>Manufacturer, if recorded</FieldLabel><Input id={`${id}-maker`} value={draft.manufacturer} maxLength={120} onChange={(event) => { const { guidanceSource: _source, ...rest } = draft; update({ ...rest, manufacturer: event.target.value }) }} /></Field>
      <Field><FieldLabel htmlFor={`${id}-source`}>Where you checked these facts</FieldLabel><Input id={`${id}-source`} value={draft.source} maxLength={500} onChange={(event) => update({ ...draft, source: event.target.value })} /></Field>
      {draft.kind === 'embroidered' ? <>
        <Field><FieldLabel htmlFor={`${id}-evidence`}>Embroidery evidence</FieldLabel><NativeSelect id={`${id}-evidence`} value={draft.confidence} onChange={(event) => { const { guidanceSource: _source, ...rest } = draft; update({ ...rest, confidence: event.target.value as 'observed' | 'verified' }) }}><option value="observed">Observed on these pieces</option><option value="verified">Verified maker and embroidery from an exact garment reference</option></NativeSelect></Field>
        {draft.confidence === 'verified' && draft.manufacturer.trim().toLowerCase() === 'printful' ? <label className="flex min-h-11 items-start gap-3 py-2"><input type="checkbox" className="mt-1 size-5 shrink-0" checked={draft.guidanceSource === printfulCareSource} onChange={(event) => { const { guidanceSource: _source, ...rest } = draft; update(event.target.checked ? { ...rest, guidanceSource: printfulCareSource } : rest) }} /><span>I checked the <a href={printfulCareSource} className="text-link font-semibold" target="_blank" rel="noopener noreferrer">Printful embroidered clothing care guidance</a> for these pieces.</span></label> : null}
      </> : null}
      <label className="flex min-h-11 items-start gap-3 py-2"><input type="checkbox" className="mt-1 size-5 shrink-0" checked={checked} onChange={(event) => setChecked(event.target.checked)} /><span>I’ve checked these facts for {scope(chosen.length)}.</span></label>
    </fieldset>
  </Sheet>
}
