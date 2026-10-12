import { useId, useState } from 'react'
import { useQuery } from 'convex/react'
import type { FunctionArgs } from 'convex/server'
import { api } from '@/api'
import { Sheet } from '@/kit/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldLabel, FieldSet, FieldLegend } from '@/components/ui/field'
import { NativeSelect } from '@/components/ui/native-select'
import { Checkbox } from '@/components/ui/checkbox'
import { ErrorNotice, useConvexCall } from '@/kit/ui'
import type { Supply } from '@/household/inventory-types'
import { CatalogDirections } from '@/products/catalog-directions'
import { CatalogIdentifierLookup } from '@/products/catalog-identifier-lookup'

type Holding = FunctionArgs<typeof api.catalog.match>['holding']
type Binding = NonNullable<Supply['catalogBinding']>
const factLabels: Record<string, string> = {
  material: 'Material', care: 'Care instructions', massGrams: 'Measured garment weight (g)', dimensions: 'Dimensions', styleNumber: 'Style number',
  model: 'Model', drumVolumeCuFt: 'Drum volume (cu ft)', drumVolumeLitres: 'Drum volume (L)', highEfficiency: 'High efficiency', programs: 'Programs',
  function: 'Product use', ingredients: 'Disclosed ingredients', lipaseDisclosure: 'Lipase disclosure', directions: 'Directions', restrictions: 'Restrictions', rinseMinimumContactMinutes: 'Minimum rinse contact time (minutes)',
}

export function CatalogReference({ holding, binding, name, disabled = false }: { holding: Holding; binding?: Binding; name: string; disabled?: boolean }) {
  const [opened, setOpened] = useState(false)
  const [directionsOpened, setDirectionsOpened] = useState(false)
  return <>
    <FieldSet>
      <FieldLegend>{holding.kind === 'garment' ? 'Manufacturer reference' : 'Manufacturer details'}</FieldLegend>
      <Button type="button" variant="outline" className="justify-self-start whitespace-normal" disabled={disabled} onClick={() => setOpened(true)}>{binding === undefined ? 'Find manufacturer details' : 'View matched manufacturer details'}</Button>
      {holding.kind !== 'product' || binding === undefined ? null : <Button type="button" variant="outline" className="justify-self-start whitespace-normal" disabled={disabled} onClick={() => setDirectionsOpened(true)}>Review source directions</Button>}
    </FieldSet>
    {opened ? <CatalogSheet holding={holding} binding={binding} name={name} onClose={() => setOpened(false)} /> : null}
    {directionsOpened && holding.kind === 'product' ? <CatalogDirections supplyId={holding.id} name={name} onClose={() => setDirectionsOpened(false)} /> : null}
  </>
}

/** `onSaved` runs after a reference is saved, before the sheet closes. */
export function CatalogSheet({ holding, binding, name, onClose, onSaved }: { holding: Holding; binding?: Binding; name: string; onClose: () => void; onSaved?: () => void }) {
  const id = useId()
  const [brand, setBrand] = useState('')
  const [search, setSearch] = useState('')
  const [variantId, setVariantId] = useState<Binding['variantId'] | null>(binding?.variantId ?? null)
  const [selectedRevision, setSelectedRevision] = useState<Binding['revisionId'] | null>(binding?.revisionId ?? null)
  const [selectedReview, setSelectedReview] = useState<Binding['reviewId'] | null>(null)
  const [lookupDirty, setLookupDirty] = useState(false)
  const [claimIds, setClaimIds] = useState<string[]>(binding?.acceptedClaimIds ?? [])
  const [confirmation, setConfirmation] = useState({ market: '', packIdentifier: '', labelRevision: '' })
  const results = useQuery(api.catalog.find, search ? { kind: holding.kind, brand: search } : 'skip')
  const detail = useQuery(api.catalog.detail, variantId === null ? 'skip' : { variantId, ...(selectedRevision === null ? {} : { revisionId: selectedRevision }), ...(selectedReview !== null ? { reviewId: selectedReview } : variantId === binding?.variantId && selectedRevision === binding.revisionId ? { reviewId: binding.reviewId } : {}) })
  const match = useConvexCall(api.catalog.match)
  const unmatch = useConvexCall(api.catalog.unmatch)
  const revisions = detail?.revisions ?? []
  const revision = revisions.find((entry) => entry._id === selectedRevision) ?? revisions[0]
  const review = revision?.reviews[0]
  const accepted = revision?.claims.filter((claim) => review?.acceptedClaimIds.includes(claim.id)) ?? []
  const dirty = lookupDirty || brand !== '' || JSON.stringify([...claimIds].sort()) !== JSON.stringify([...(binding?.acceptedClaimIds ?? [])].sort()) || Object.values(confirmation).some((value) => value !== '') || variantId !== (binding?.variantId ?? null)
  const save = async () => {
    if (review === undefined || claimIds.length === 0) return
    const result = await match.run({ holding, reviewId: review._id, acceptedClaimIds: claimIds, confirmation })
    if (result !== undefined) { onSaved?.(); onClose() }
  }
  return <Sheet title="Source details" kicker={name} onClose={onClose} dirty={dirty} closeAtTop tall
    footer={<><ErrorNotice error={match.error ?? unmatch.error} /><Button variant="outline" disabled={match.pending || unmatch.pending} onClick={onClose}>Cancel</Button><Button disabled={match.pending || unmatch.pending || claimIds.length === 0 || review === undefined || Object.values(confirmation).some((value) => !value.trim())} onClick={() => void save()}>Save reference</Button></>}>
    <div className="grid gap-4 min-w-0">
      <p className="m-0 text-ink-2">Applies to this item only; saved care and doses stay unchanged.{holding.kind === 'product' ? ' To apply checked use, directions, handling and restrictions, open Review source directions after saving.' : ''}</p>
      {binding === undefined ? null : <div className="grid gap-2">
        <p className="m-0">This saved source stays fixed when the catalog updates.</p>
        <Button variant="outline" className="justify-self-start" disabled={unmatch.pending} onClick={async () => { if (await unmatch.run({ holding }) !== undefined) onClose() }}>Remove reference</Button>
      </div>}
      {holding.kind !== 'product' ? null : <CatalogIdentifierLookup onDraftChange={setLookupDirty} onChoose={(candidate) => {
        setVariantId(candidate.variant._id); setSelectedRevision(candidate.revisionId); setSelectedReview(candidate.reviewId); setClaimIds([]); setConfirmation({ market: '', packIdentifier: '', labelRevision: '' })
      }} />}
      <Field><FieldLabel htmlFor={`${id}-brand`}>Brand printed on the item</FieldLabel><Input id={`${id}-brand`} maxLength={200} value={brand} onChange={(event) => setBrand(event.target.value)} /></Field>
      <Button variant="outline" className="justify-self-start" disabled={!brand.trim()} onClick={() => setSearch(brand.trim())}>Find details</Button>
      {search && results === undefined ? <p role="status">Looking for details…</p> : null}
      {results?.length === 0 ? <p role="status">No manufacturer details saved for this brand. Enter the label manually.</p> : null}
      {results === undefined || results.length === 0 ? null : <Field><FieldLabel htmlFor={`${id}-variant`}>Product and exact variant</FieldLabel><NativeSelect id={`${id}-variant`} value={variantId ?? ''} onChange={(event) => {
        setVariantId(event.target.value ? event.target.value as Binding['variantId'] : null); setSelectedRevision(null); setSelectedReview(null); setClaimIds([]); setConfirmation({ market: '', packIdentifier: '', labelRevision: '' })
      }}><option value="">Choose an exact variant</option>{results.flatMap(({ product, variants }) => variants.map((variant) => <option key={variant._id} value={variant._id}>{product.name} · {variant.name} · {variant.market} · {variant.packIdentifier}</option>))}</NativeSelect></Field>}
      {variantId !== null && detail === undefined ? <p role="status">Loading captured facts…</p> : null}
      {detail === undefined || revision === undefined ? null : <>
        <h3 className="m-0 text-lg font-semibold break-words">{detail.product?.name} · {detail.variant.name}</h3>
        <p className="m-0 text-ink-2 break-words">{detail.variant.market} · {detail.variant.packIdentifier} · {revision.labelRevision}</p>
        {detail.revisionChoices.length < 2 ? null : <Field><FieldLabel htmlFor={`${id}-revision`}>Captured revision</FieldLabel><NativeSelect id={`${id}-revision`} value={revision._id} onChange={(event) => { setSelectedRevision(event.target.value as Binding['revisionId']); setSelectedReview(null); setClaimIds([]); setConfirmation({ market: '', packIdentifier: '', labelRevision: '' }) }}>{detail.revisionChoices.map((entry) => <option key={entry.revisionId} value={entry.revisionId}>{entry.labelRevision}</option>)}</NativeSelect></Field>}
        {accepted.length === 0 ? <p>No reviewed facts are available yet. Extracted claims need review before matching.</p> : <fieldset className="grid gap-3 min-w-0"><legend className="font-semibold">Select the facts you checked</legend>{accepted.map((claim) => <label key={claim.id} className="flex items-start gap-2 min-h-11 break-words">
          <Checkbox checked={claimIds.includes(claim.id)} onCheckedChange={(checked) => setClaimIds((current) => checked ? [...current, claim.id] : current.filter((id) => id !== claim.id))} />
          <span className="min-w-0"><strong>{factLabels[claim.key] ?? claim.key}</strong>: {Array.isArray(claim.value) ? claim.value.join(', ') : typeof claim.value === 'boolean' ? claim.value ? 'Yes' : 'No' : claim.value === 'not_listed' ? 'Not listed in this disclosure' : String(claim.value)}<span className="block text-ink-2 text-sm">{claim.conditions}</span></span>
        </label>)}</fieldset>}
        <details className="min-w-0"><summary className="min-h-11 py-3 cursor-pointer">Sources and review</summary><div className="grid gap-3">{review === undefined ? null : <p>{review.rationale}</p>}{revision.sources.map((source) => <div key={source.id} className="break-words"><a href={source.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-link font-semibold">{source.provider}</a><p className="text-sm text-ink-2">Captured {source.retrievedAt} · {source.snapshotKind === 'factual_summary' ? 'Factual summary' : 'Permitted source text'}</p><p>{source.snapshot}</p></div>)}</div></details>
        {accepted.length === 0 ? null : <>
          <p className="m-0 text-ink-2">Confirm these details on your item.</p>
          {(['market', 'packIdentifier', 'labelRevision'] as const).map((field) => <Field key={field}><FieldLabel htmlFor={`${id}-${field}`}>{field === 'market' ? 'Market' : field === 'packIdentifier' ? 'Pack or model identifier' : 'Label revision'}</FieldLabel><Input id={`${id}-${field}`} maxLength={200} value={confirmation[field]} onChange={(event) => setConfirmation((current) => ({ ...current, [field]: event.target.value }))} /></Field>)}
        </>}
      </>}
    </div>
  </Sheet>
}
