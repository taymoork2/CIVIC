import { useId, useState } from 'react'
import { useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { api } from '@/api'
import { Sheet } from '@/kit/sheet'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ItemGroup } from '@/components/ui/item'
import { Input } from '@/components/ui/input'
import { Field, FieldLabel } from '@/components/ui/field'
import { NativeSelect } from '@/components/ui/native-select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ErrorNotice, Loading, useConvexCall } from '@/kit/ui'
import type { Textile } from '@/household/inventory-types'
import { materialCareProblem, type DryingMethod, type DryerHeat } from '@washcloset/planner'
import { dryMethodText } from '@/copy'
import { DesignIcon } from '@/kit/design-icons'
import { MoreSection } from '@/kit/more-section'
import { SwitchRow } from '@/laundry/laundry-ui'

type Review = FunctionReturnType<typeof api.personalRoutines.review>
type LabelValues = Pick<NonNullable<Review[number]['care']>, 'washMethod' | 'cycle' | 'maxTemperatureC' | 'dryMethod' | 'dryHeat'>

/** Prefill shared recorded values only; a prohibition does not choose an alternative method. */
export function routineLabelDefaults(pieces: readonly { care: LabelValues | null }[]) {
  const shared = <T,>(read: (care: LabelValues | null) => T): T | undefined => {
    const value = read(pieces[0]?.care ?? null)
    return pieces.length > 0 && pieces.every((piece) => read(piece.care) === value) ? value : undefined
  }
  const wash = shared((care) => care?.washMethod)
  const cycle = shared((care) => care?.cycle)
  const temperature = shared((care) => care?.maxTemperatureC)
  const dry = shared((care) => care?.dryMethod)
  const heat = shared((care) => care?.dryHeat)
  return {
    method: wash === 'machine' || wash === 'hand_wash' ? wash : '' as const,
    cycle: cycle === 'normal' || cycle === 'permanent_press' || cycle === 'delicate' ? cycle : '' as const,
    temperature: temperature === undefined ? '' : String(temperature),
    dryMethod: dry === 'tumble_dry' ? 'tumble' as const : dry === 'dry_flat' ? 'flat' as const : dry === 'line_dry' || dry === 'drip_dry' ? 'rack_line' as const : '' as const,
    heat: heat === 'no_heat' || heat === 'delicate' || heat === 'low' || heat === 'medium' || heat === 'high' ? heat : '' as const,
  } as const
}
const words = (value: string | null | undefined) => value?.replaceAll('_', ' ') ?? 'not recorded'
const labelWords = (piece: Review[number]) => [words(piece.care?.washMethod),
  ...(piece.care?.cycle ? [words(piece.care.cycle)] : []),
  piece.care?.maxTemperatureC === undefined ? 'water limit not recorded' : `up to ${piece.care.maxTemperatureC} °C`,
  words(piece.care?.dryMethod), ...(piece.care?.dryMethod === 'tumble_dry' ? [`${words(piece.care.dryHeat)} heat`] : []),
].join('; ')

/** The remembered routines and their sheet; the garment sheet's care list holds the row that opens it. */
export function PersonalRoutine({ textiles, open, onClose }: { textiles: readonly Pick<Textile, 'textileId' | 'name' | 'personalRoutine'>[]; open: boolean; onClose: () => void }) {
  const routines = textiles.filter((textile) => textile.personalRoutine !== undefined)
  return <div className="grid min-w-0 gap-2">
    {routines.map((textile) => <p key={textile.textileId} className="m-0 text-[length:var(--step--1)]">{textile.name}: Wash & dry preferences · {textile.personalRoutine!.scope === 'once' ? 'this wash only' : 'remembered'}{textile.personalRoutine!.current ? '' : ' · review needed after label changes'}</p>)}
    {open ? <RoutineSheet textiles={textiles} onClose={onClose} /> : null}
  </div>
}

function RoutineSheet({ textiles, onClose }: { textiles: readonly Pick<Textile, 'textileId' | 'name' | 'personalRoutine'>[]; onClose: () => void }) {
  const review = useQuery(api.personalRoutines.review, { textileIds: textiles.map((textile) => textile.textileId) })
  return review === undefined ? <Sheet title="Wash & dry preferences" className="[&_.sheet-title]:text-[length:var(--step-2)]" onClose={onClose} closeAtTop><Loading what="Reading selected items" /></Sheet> : <RoutineForm review={review} onClose={onClose} />
}

function RoutineForm({ review, onClose }: { review: Review; onClose: () => void }) {
  const id = useId()
  // Preserve the facts reviewed when this draft opened; the server rejects concurrent changes.
  const [initial] = useState(review)
  const defaults = routineLabelDefaults(review.length === 1 && review[0]!.canChoose ? review : [])
  const [selected, setSelected] = useState<string[]>(() => review.length === 1 && review[0]!.canChoose ? [review[0]!.textileId] : [])
  const [useWash, setUseWash] = useState(false)
  const [useDry, setUseDry] = useState(false)
  const [method, setMethod] = useState(defaults.method)
  const [cycle, setCycle] = useState<'' | 'normal' | 'permanent_press' | 'delicate'>(defaults.cycle)
  const [temperature, setTemperature] = useState(defaults.temperature)
  const [dryMethod, setDryMethod] = useState<'' | DryingMethod>(defaults.dryMethod)
  const [heat, setHeat] = useState<'' | DryerHeat>(defaults.heat)
  const [scope, setScope] = useState<'once' | 'remembered'>('once')
  const [accept, setAccept] = useState(false)
  const [missing, setMissing] = useState(false)
  const save = useConvexCall(api.personalRoutines.set)
  const chosen = initial.filter((piece) => selected.includes(piece.textileId))
  const labelReviews = initial.every((piece) => piece.labelHash === initial[0]?.labelHash) ? initial.slice(0, 1) : initial
  const problemFor = (settings: Parameters<typeof materialCareProblem>[1]) => chosen.map((piece) => materialCareProblem(piece.care?.material, settings)).find((problem) => problem !== null)
  const materialProblem = problemFor({ washMethod: useWash ? method || undefined : undefined, cycle: useWash ? cycle || undefined : undefined, maxTemperatureC: useWash && temperature !== '' ? Number(temperature) : undefined, dryMethod: useDry && dryMethod === 'tumble' ? 'tumble_dry' : undefined, dryHeat: useDry && dryMethod === 'tumble' ? heat || undefined : undefined })
  const lacksLabel = chosen.some((piece) => piece.missingLabel)
  const dirty = initial.length > 1 && selected.length > 0 || useWash || useDry || scope !== 'once'
  const hasPreferences = chosen.some((piece) => piece.routine !== null || piece.hasDryingPreference)
  const canSave = materialProblem === undefined && chosen.length > 0 && accept && (!lacksLabel || missing) && (useWash || useDry) && (!useWash || method !== '' && cycle !== '' && Number.isFinite(Number(temperature)) && Number(temperature) >= 1 && Number(temperature) <= 95) && (!useDry || dryMethod !== '' && (dryMethod !== 'tumble' || heat !== '')) && !save.pending
  const commit = async (follow = false) => {
    if (follow ? chosen.length === 0 || save.pending : !canSave) return
    const settings = follow ? null : {
      ...(useWash && method !== '' && cycle !== '' ? { wash: { method, cycle, maximumTemperatureC: Number(temperature) } } : {}),
      ...(useDry && dryMethod !== '' ? { dry: { method: dryMethod, ...(dryMethod === 'tumble' && heat !== '' ? { heat } : {}) } } : {}),
    }
    if (await save.run({ pieces: chosen.map((piece) => ({ textileId: piece.textileId, revision: piece.revision, labelHash: piece.labelHash })),
      settings, scope, acceptedDamage: accept, missingLabelAccepted: missing }) !== undefined) onClose()
  }
  const resetAcceptance = () => { setAccept(false); setMissing(false) }
  const selectPieces = (ids: string[]) => {
    setSelected(ids)
    const values = routineLabelDefaults(initial.filter((piece) => ids.includes(piece.textileId)))
    setMethod(values.method); setCycle(values.cycle); setTemperature(values.temperature); setDryMethod(values.dryMethod); setHeat(values.heat)
    resetAcceptance()
  }
  return <Sheet title="Wash & dry preferences" className="[&_.sheet-title]:text-[length:var(--step-2)]" onClose={onClose} closeAtTop tall compactActions busy={save.pending} dirty={dirty} footer={<>
    <ErrorNotice error={save.error} />
    {hasPreferences ? <Button variant="outline" className="whitespace-normal" disabled={chosen.length === 0 || save.pending} onClick={() => void commit(true)}>Follow care label</Button> : null}
    <Button className="whitespace-normal" disabled={!canSave} onClick={() => void commit()}>Save preferences</Button>
  </>}>
    <fieldset disabled={save.pending} className="m-0 grid min-w-0 gap-4 border-0 p-0">
      <section className="grid min-w-0 gap-2" aria-label={initial.length === 1 ? 'Selected item' : 'Choose pieces'}>
        {initial.length === 1 ? null : <h3 className="m-0 font-semibold">Choose pieces</h3>}
        <ItemGroup aria-label={initial.length === 1 ? 'Selected item' : 'Choose pieces'}>
          {initial.map((piece, index) => initial.length === 1 ? <li key={piece.textileId} className="flex min-h-14 items-center gap-3 px-4 py-3 font-semibold"><DesignIcon name="shirt" aria-hidden="true" /><span>{piece.name}{piece.canChoose ? '' : ' · Only the owner can change these preferences'}</span></li> : <SwitchRow key={piece.textileId} role="checkbox" media={<DesignIcon name="shirt" />} title={`${piece.name} · piece ${index + 1}`} fact={piece.canChoose ? undefined : 'Only the owner can change these preferences'} on={selected.includes(piece.textileId)} disabled={!piece.canChoose || save.pending} onToggle={() => selectPieces(selected.includes(piece.textileId) ? selected.filter((entry) => entry !== piece.textileId) : [...selected, piece.textileId])} />)}
        </ItemGroup>
        <MoreSection variant="section" title={labelReviews.length === 1 ? 'Care label' : 'Care labels'}>
          {labelReviews.map((piece) => <div key={piece.textileId} className="grid gap-1">
          {labelReviews.length === 1 ? null : <p className="m-0 font-semibold">{piece.name}</p>}
          <p className="m-0 break-words text-[length:var(--step--1)]">{labelWords(piece)}.</p>
          {piece.care?.material ? <p className="m-0 text-[length:var(--step--1)]">Material: {piece.care.material}</p> : null}
          {piece.care?.restrictions.map((instruction) => <p key={instruction} className="m-0 break-words text-[length:var(--step--1)]">{instruction}</p>)}
          {piece.care?.instructions ? <p className="m-0 text-[length:var(--step--1)]">Additional label instructions still apply. Source: {piece.care.instructions.source}</p> : null}
          </div>)}
        </MoreSection>
        {initial.filter((piece) => piece.routine !== null || piece.hasDryingPreference).map((piece) => <div key={piece.textileId}>
          {piece.routine ? <p className="m-0 break-words text-[length:var(--step--1)]">Current preferences: {piece.routine.departures.join('; ')} · {piece.current ? piece.routine.scope === 'once' ? 'this wash only' : 'remembered' : 'review needed'}</p> : null}
          {piece.hasDryingPreference ? <p className="m-0 text-[length:var(--step--1)]">Following the care label clears the remembered drying preference.</p> : null}
        </div>)}
      </section>
      {initial.length === 1 ? null : <p role="status" className="m-0 text-[length:var(--step--1)] text-ink-2">{chosen.length} {chosen.length === 1 ? 'piece' : 'pieces'} selected</p>}
      <Tabs defaultValue="wash">
        <TabsList aria-label="Wash and dry settings">
          <TabsTrigger value="wash" className="gap-2"><DesignIcon name="washer" aria-hidden="true" />Wash{useWash ? <DesignIcon name="check" size="1em" aria-hidden="true" /> : null}</TabsTrigger>
          <TabsTrigger value="dry" className="gap-2"><DesignIcon name="dryer" aria-hidden="true" />Dry{useDry ? <DesignIcon name="check" size="1em" aria-hidden="true" /> : null}</TabsTrigger>
        </TabsList>
        <TabsContent value="wash">
      <ItemGroup aria-label="Wash settings">
        <SwitchRow role="checkbox" media={<DesignIcon name="washer" />} title="Wash settings" on={useWash} disabled={save.pending} onToggle={() => { setUseWash(!useWash); resetAcceptance() }} issues={useWash ? <div className="grid min-w-0 gap-3 px-4 pb-4">
        <Field><FieldLabel htmlFor={`${id}-method`}>Wash method</FieldLabel><NativeSelect id={`${id}-method`} value={method} onChange={(event) => { setMethod(event.target.value as typeof method); resetAcceptance() }}><option value="" disabled>Choose a method</option><option value="machine">Machine wash</option><option value="hand_wash">Hand wash</option></NativeSelect></Field>
        <Field><FieldLabel htmlFor={`${id}-cycle`}>Wash cycle</FieldLabel><NativeSelect id={`${id}-cycle`} value={cycle} onChange={(event) => { setCycle(event.target.value as typeof cycle); resetAcceptance() }}><option value="" disabled>Choose a cycle</option><option value="normal" disabled={method === 'machine' && problemFor({ washMethod: method, cycle: 'normal' }) !== undefined}>Normal</option><option value="permanent_press" disabled={method === 'machine' && problemFor({ washMethod: method, cycle: 'permanent_press' }) !== undefined}>Permanent press</option><option value="delicate">Delicate</option></NativeSelect></Field>
        <Field><FieldLabel htmlFor={`${id}-temperature`}>Water limit (°C)</FieldLabel><Input id={`${id}-temperature`} type="number" min={1} max={95} placeholder="Not recorded" value={temperature} onChange={(event) => { setTemperature(event.target.value); resetAcceptance() }} /></Field>
      </div> : undefined} />
      </ItemGroup>
        </TabsContent>
        <TabsContent value="dry">
      <ItemGroup aria-label="Drying settings">
        <SwitchRow role="checkbox" media={<DesignIcon name="dryer" />} title="Drying settings" on={useDry} disabled={save.pending} onToggle={() => { setUseDry(!useDry); resetAcceptance() }} issues={useDry ? <div className="grid min-w-0 gap-3 px-4 pb-4"><Field><FieldLabel htmlFor={`${id}-dry`}>Drying method</FieldLabel><NativeSelect id={`${id}-dry`} value={dryMethod} onChange={(event) => { setDryMethod(event.target.value as typeof dryMethod); resetAcceptance() }}><option value="" disabled>Choose a method</option>{Object.entries(dryMethodText.methods).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</NativeSelect></Field>
        {dryMethod !== 'tumble' ? null : <Field><FieldLabel htmlFor={`${id}-heat`}>Tumble heat limit</FieldLabel><NativeSelect id={`${id}-heat`} value={heat} onChange={(event) => { setHeat(event.target.value as typeof heat); resetAcceptance() }}><option value="" disabled>Choose a heat limit</option><option value="no_heat">No heat</option><option value="delicate">Delicate heat</option><option value="low">Low heat</option><option value="medium" disabled={problemFor({ dryMethod: 'tumble_dry', dryHeat: 'medium' }) !== undefined}>Medium heat</option><option value="high" disabled={problemFor({ dryMethod: 'tumble_dry', dryHeat: 'high' }) !== undefined}>High heat</option></NativeSelect></Field>}
      </div> : undefined} />
      </ItemGroup>
        </TabsContent>
      </Tabs>
      {useWash || useDry ? <>
        <Field><FieldLabel htmlFor={`${id}-scope`}>Apply preferences</FieldLabel><NativeSelect id={`${id}-scope`} value={scope} onChange={(event) => { setScope(event.target.value as typeof scope); resetAcceptance() }}><option value="once">This wash only</option><option value="remembered">Remember for these items</option></NativeSelect></Field>
        {materialProblem === undefined ? null : <p role="alert" className="m-0 rounded-control bg-conflict-bg p-3 text-conflict-ink">{materialProblem}</p>}
        {chosen.length === 0 ? null : <section className="grid gap-2 rounded-control bg-surface-2 p-3" aria-label="Confirm preferences">
          <p className="m-0 text-[length:var(--step--1)] text-ink-2">These settings can override the care label. Product, machine and other items’ limits still apply.</p>
          {lacksLabel ? <label className="flex min-h-11 items-start gap-3 py-2"><Checkbox className="mt-1 shrink-0" checked={missing} onCheckedChange={(checked) => setMissing(checked === true)} /><span>I’m choosing settings without a complete care label.</span></label> : null}
          <label className="flex min-h-11 items-start gap-3 py-2"><Checkbox className="mt-1 shrink-0" checked={accept} onCheckedChange={(checked) => setAccept(checked === true)} /><span>I accept possible wear or damage to the selected items.</span></label>
        </section>}
      </> : null}
    </fieldset>
  </Sheet>
}
