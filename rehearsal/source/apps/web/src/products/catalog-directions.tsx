import { useId, useState } from 'react'
import { useQuery } from 'convex/react'
import type { FunctionArgs, FunctionReturnType } from 'convex/server'
import { rowTextFor } from '@washcloset/planner'
import { api } from '@/api'
import { Sheet } from '@/kit/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldLabel } from '@/components/ui/field'
import { NativeSelect } from '@/components/ui/native-select'
import { Checkbox } from '@/components/ui/checkbox'
import { SheetClose } from '@/components/ui/sheet'
import { ErrorNotice, useConvexCall } from '@/kit/ui'
import { doseParts } from '@/kit/units'

export type SourceDirectionsDraft = NonNullable<FunctionReturnType<typeof api.catalog.directionsDraft>>
type ApplyArgs = FunctionArgs<typeof api.catalog.applyDirections>
export type DirectionConfirmation = { optionId: string; confirmedClaimIds: string[]; confirmation: ApplyArgs['confirmation'] }
const blank = (): DirectionConfirmation => ({ optionId: '', confirmedClaimIds: [], confirmation: { market: '', packIdentifier: '', labelRevision: '', physicalPackChecked: false, factsChecked: false, replaceDirections: false, ordinaryFillOnly: false } })

export function canApplySourceDirections(draft: SourceDirectionsDraft, value: DirectionConfirmation): boolean {
  const option = draft.options.find((option) => option.id === value.optionId)
  const confirmed = value.confirmation
  return option !== undefined && option.table !== null && option.blockers.length === 0
    && draft.requiredClaimIds.length > 0 && draft.missingClaimIds.length === 0
    && draft.requiredClaimIds.length === new Set(value.confirmedClaimIds).size
    && draft.requiredClaimIds.every((id) => value.confirmedClaimIds.includes(id))
    && confirmed.factsChecked && confirmed.physicalPackChecked && confirmed.replaceDirections
    && confirmed.market.trim() === draft.market && confirmed.packIdentifier.trim() === draft.packIdentifier && confirmed.labelRevision.trim() === draft.labelRevision
    && (!value.optionId.startsWith('tide-') || value.optionId === 'tide-pods' || confirmed.ordinaryFillOnly)
}

export function CatalogDirections({ supplyId, name, onClose }: { supplyId: ApplyArgs['supplyId']; name: string; onClose: () => void }) {
  const draft = useQuery(api.catalog.directionsDraft, { supplyId })
  return draft === undefined
    ? <Sheet title="Source directions" kicker={name} onClose={onClose} closeAtTop><p role="status">Loading the saved source…</p></Sheet>
    : <DirectionEditor key={supplyId} draft={draft} supplyId={supplyId} name={name} onClose={onClose} />
}

function DirectionEditor({ draft, supplyId, name, onClose }: { draft: SourceDirectionsDraft | null; supplyId: ApplyArgs['supplyId']; name: string; onClose: () => void }) {
  // Live queries must not move an open confirmation to a new product/reference or reset its checked facts.
  const [opening] = useState(draft)
  const [value, setValue] = useState(blank)
  const save = useConvexCall(api.catalog.applyDirections)
  const stale = opening === null || draft === null || opening.stateToken !== draft.stateToken
  const ready = !stale && opening !== null && canApplySourceDirections(opening, value)
  const dirty = value.optionId !== '' || value.confirmedClaimIds.length > 0 || Object.values(value.confirmation).some((entry) => entry !== '' && entry !== false)
  const apply = async () => {
    if (!ready || opening === null) return
    const result = await save.run({ supplyId, revisionId: opening.revisionId, reviewId: opening.reviewId, stateToken: opening.stateToken, ...value })
    if (result !== undefined) onClose()
  }
  if (opening === null) return <Sheet title="Source directions" kicker={name} onClose={onClose} closeAtTop><p role="status">The saved source reference is unavailable. Close this sheet and check the product reference again. Prior directions stay saved.</p></Sheet>
  return <Sheet title="Source directions" kicker={name} onClose={onClose} dirty={dirty} busy={save.pending} closeAtTop tall
    footer={<><ErrorNotice error={save.error} /><SheetClose render={<Button variant="outline" disabled={save.pending} />}>Cancel</SheetClose><Button disabled={save.pending || !ready} onClick={() => void apply()}>Replace saved directions</Button></>}>
    {stale ? <p role="alert">The product, reference or saved directions changed. Your checks remain here; close and reopen to review the current facts.</p> : null}
    <CatalogDirectionContent draft={opening} value={value} onChange={setValue} disabled={save.pending || stale} />
  </Sheet>
}

function claimLabel(id: string): string {
  if (id === 'function') return 'Product use'
  if (id === 'handling') return 'Handling precautions'
  if (id === 'rinse-minimum-contact') return 'Minimum rinse contact: 16 minutes'
  if (id.startsWith('directions-rinse')) return 'Rinse directions'
  if (id.startsWith('directions-main-wash')) return 'Main-wash directions'
  if (id.startsWith('restriction-')) return `Restriction ${Number(id.slice('restriction-'.length)) + 1}`
  return 'Source fact'
}
function restrictionText(text: string): string {
  try {
    const value: unknown = JSON.parse(text)
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) return Object.values(value).flat().filter((entry) => typeof entry === 'string').join('. ')
  } catch { /* Plain source restrictions are already readable text. */ }
  return text
}

/** Controlled content keeps every confirmation explicit; there are no preselected checks or routes. */
export function CatalogDirectionContent({ draft, value, onChange, disabled = false }: { draft: SourceDirectionsDraft; value: DirectionConfirmation; onChange: (value: DirectionConfirmation) => void; disabled?: boolean }) {
  const id = useId()
  const option = draft.options.find((option) => option.id === value.optionId)
  const changeConfirmation = (change: Partial<DirectionConfirmation['confirmation']>) => onChange({ ...value, confirmation: { ...value.confirmation, ...change } })
  return <div className="grid gap-4 min-w-0 break-words">
    <h3 className="m-0 text-lg font-semibold">{draft.name}</h3>
    <p className="m-0 text-ink-2">{draft.market} · {draft.packIdentifier} · source revision {draft.labelRevision}</p>
    <p className="m-0">Check your pack’s formulation, marks and label revision before replacing directions. A reviewed source or similar name doesn’t confirm your pack.</p>
    {draft.limitations.map((text) => <p className="m-0 text-ink-2" key={text}>{text}</p>)}
    {draft.missingClaimIds.length === 0 ? null : <p role="alert">Return to Source details and select the checked facts first: {draft.missingClaimIds.map(claimLabel).join(', ')}. Saved directions remain unchanged.</p>}
    {draft.options.length === 0 ? <p role="status">No supported source directions are available for this revision. Keep using the manual directions editor.</p> : <Field>
      <FieldLabel htmlFor={`${id}-route`}>Directions to apply</FieldLabel>
      <NativeSelect id={`${id}-route`} value={value.optionId} disabled={disabled} onChange={(event) => onChange({ ...blank(), optionId: event.target.value })}>
        <option value="">Choose a supported route to review</option>
        {draft.options.map((option) => <option key={option.id} value={option.id}>{option.label}{option.blockers.length === 0 ? '' : ' · needs more details'}</option>)}
      </NativeSelect>
    </Field>}
    {option === undefined ? null : <>
      {option.table === null ? null : <div className="grid gap-2">
        <h4 className="m-0 font-semibold">Dose rows from the selected source</h4>
        {option.table.rows.map((row, index) => <p className="m-0" key={index}><strong>{row.rowText ?? rowTextFor(row)}</strong>: {row.cells.map((cell) => `${cell.machineClass === undefined ? '' : cell.machineClass === 'he' ? 'HE: ' : 'Standard: '}${option.id.startsWith('paks-') ? `${cell.amount} intact Pak${cell.amount === 1 ? '' : 's'}` : doseParts(cell, 'metric').spoken}`).join('; ')}</p>)}
        <p className="m-0">{option.table.placement === 'softener_compartment' ? 'Fabric-softener compartment' : 'Directly in the washer drum'} · {option.table.timing}</p>
      </div>}
      {option.blockers.length === 0 ? null : <div role="status" className="grid gap-2"><strong>This route cannot be saved yet.</strong>{option.blockers.map((text) => <p className="m-0" key={text}>{text}</p>)}<p className="m-0">Your prior directions stay saved.</p></div>}
    </>}
    {draft.restrictions.length === 0 ? null : <div className="grid gap-2"><h4 className="m-0 font-semibold">Source restrictions and handling</h4>{draft.restrictions.map((claim) => <p className="m-0" key={claim.claimId}>{restrictionText(claim.text)}</p>)}</div>}
    <details className="min-w-0"><summary className="min-h-11 py-3 cursor-pointer">Pinned sources</summary><div className="grid gap-2">{draft.sources.map((source) => <p className="m-0" key={source.id}><a href={source.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-link font-semibold">{source.provider}</a><span className="block text-sm text-ink-2">Captured {source.retrievedAt}</span></p>)}</div></details>
    {option === undefined || option.blockers.length > 0 || draft.missingClaimIds.length > 0 ? null : <>
      <fieldset className="grid gap-3 min-w-0" disabled={disabled}><legend className="font-semibold">Check the exact physical pack</legend>
        {(['market', 'packIdentifier', 'labelRevision'] as const).map((field) => <Field key={field}><FieldLabel htmlFor={`${id}-${field}`}>{field === 'market' ? 'Pack market' : field === 'packIdentifier' ? 'Exact pack identifier' : 'Checked label revision'}</FieldLabel><Input id={`${id}-${field}`} maxLength={200} value={value.confirmation[field]} onChange={(event) => changeConfirmation({ [field]: event.target.value })} /></Field>)}
        <label className="flex items-start gap-2 min-h-11"><Checkbox disabled={disabled} checked={value.confirmation.physicalPackChecked} onCheckedChange={(checked) => changeConfirmation({ physicalPackChecked: checked === true })} /><span>I checked this actual pack, its formulation, label revision and printed marks against the selected source.</span></label>
        {value.optionId.startsWith('tide-') && value.optionId !== 'tide-pods' ? <label className="flex items-start gap-2 min-h-11"><Checkbox disabled={disabled} checked={value.confirmation.ordinaryFillOnly} onCheckedChange={(checked) => changeConfirmation({ ordinaryFillOnly: checked === true })} /><span>Use these rows for ordinary fill only. Deep-fill dosing remains unresolved.</span></label> : null}
      </fieldset>
      <fieldset className="grid gap-3 min-w-0" disabled={disabled}><legend className="font-semibold">Confirm the selected facts</legend>
        {draft.requiredClaimIds.map((claimId) => <label className="flex items-start gap-2 min-h-11" key={claimId}><Checkbox disabled={disabled} checked={value.confirmedClaimIds.includes(claimId)} onCheckedChange={(checked) => {
          const confirmedClaimIds = checked ? [...new Set([...value.confirmedClaimIds, claimId])] : value.confirmedClaimIds.filter((id) => id !== claimId)
          onChange({ ...value, confirmedClaimIds, confirmation: { ...value.confirmation, factsChecked: draft.requiredClaimIds.every((id) => confirmedClaimIds.includes(id)) } })
        }} /><span>I checked: {claimLabel(claimId)}.</span></label>)}
        <label className="flex items-start gap-2 min-h-11"><Checkbox disabled={disabled} checked={value.confirmation.replaceDirections} onCheckedChange={(checked) => changeConfirmation({ replaceDirections: checked === true })} /><span>Replace this product’s saved dose rows with only this route. Other routes and unsupported loads still need directions.</span></label>
      </fieldset>
    </>}
  </div>
}
