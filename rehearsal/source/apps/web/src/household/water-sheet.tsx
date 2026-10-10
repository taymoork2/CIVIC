import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Button } from '@/components/ui/button'
import { useId, useState } from 'react'

import type { Id } from '@convex/_generated/dataModel'
import { classifyWater, ebmudAreas, mgLOf, ebmudForZip, lookupWater, qualifyingWaterCondition, staleReport, validZip, type HouseholdWater, type ReadingUnit, type WaterAnswers, type WaterUtility } from '@convex/waterHardness'
import { api } from '@/api'
import { helpTipText } from '@/copy'
import { waterCopy } from '@/copy-household'
import { trialText } from '@/copy-trial'
import { DesignIcon } from '@/kit/design-icons'
import { HelpTip } from '@/kit/help-tip'
import { FactsCard, RowSection, SheetText } from '@/household/household-blocks'
import { ActionList, TrialNote } from '@/laundry/laundry-ui'
import { RecordRow } from '@/kit/record-row'
import { Sheet } from '@/kit/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Choices, ErrorNotice, useConvexCall } from '@/kit/ui'

type Override = 'strip' | 'softener' | 'utility_report'
type Step = 'result' | 'zip' | 'bill' | 'area' | 'pick' | Override

const shortDate = (at: number) => new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
const town = (area: string | undefined) => ebmudAreas.find(([id]) => id === area)?.[1] ?? waterCopy.band.unknown

/** Where the band came from, in plain words: the bill and town, or the reading and its date. */
export function waterSourceWords(water: HouseholdWater): string {
  const date = shortDate(water.setAt)
  if (water.source === 'unknown') return waterCopy.source.unknown
  if (water.source === 'softener') return water.reading === undefined ? waterCopy.source.softenerNoStrip : waterCopy.source.softener(date)
  if (water.source !== 'lookup') return waterCopy.source[water.source](date)
  return water.utility === 'ebmud' ? waterCopy.source.ebmud(town(water.area)) : waterCopy.source[water.utility ?? 'not_listed']
}

/**
 * What the planner would count now, not what was saved: a soft reading that no longer qualifies (a
 * seasonal plant can serve the town, a strip past its window, an old report) says so and asks to test again.
 */
export function waterStatus(water: HouseholdWater, now: number): { title: string; note?: string } {
  const { band } = classifyWater(water, now)
  if (band !== 'soft' || qualifyingWaterCondition(water, now) === 'soft') return { title: waterCopy.band[band] }
  const reportYear = water.reading?.reportYear
  const oldReport = water.source === 'utility_report' && (reportYear === undefined || staleReport(reportYear, now)) && (water.utility !== 'ebmud' || lookupWater(water, now).band === 'soft')
  return { title: waterCopy.softNotCounted, note: oldReport ? waterCopy.notCounted.oldReport : waterCopy.notCounted.season }
}

/** The Water row under Appliances, with the trial note that it changes no dose yet. */
export function WaterSection({ water, onOpen }: { water: HouseholdWater | undefined; onOpen: () => void }) {
  const [now] = useState(Date.now)
  const title = water === undefined ? waterCopy.notSet : waterStatus(water, now).title
  const fact = water === undefined ? waterCopy.rowHint : waterSourceWords(water)
  return <RowSection heading={<span className="flex items-center gap-1">{waterCopy.title}<HelpTip topic={helpTipText.water.topic}>{helpTipText.water.words}</HelpTip></span>}>
    <RecordRow media={<DesignIcon name="drop" strokeWidth={1.6} />} title={title} fact={fact} onOpen={onOpen} label={`${waterCopy.title}: ${title}. ${fact}. Change`} />
    <TrialNote>{trialText.water}</TrialNote>
  </RowSection>
}

type Draft = Omit<WaterAnswers, 'setAt'>

/** The bounds `inventory.setWater` enforces, so the sheet never offers an answer the server refuses. */
export const readingOk = (value: number, unit: ReadingUnit) => Number.isFinite(value) && value >= 0 && mgLOf(value, unit) <= 2000
export const reportYearOk = (text: string, now: number) => /^\d{4}$/.test(text) && Number(text) >= 1990 && Number(text) <= new Date(now).getUTCFullYear()

/**
 * ZIP → the result. The company is asked only where the ZIP has more than one, the town only for EBMUD
 * (its hardness differs by area and no ZIP settles it). Nothing saves until Done; a strip reading, a
 * softener (counted only through a strip) or a number from the water report always wins.
 */
export function WaterSheet({ householdId, water, onClose }: { householdId: Id<'households'>; water: HouseholdWater | undefined; onClose: () => void }) {
  const [step, setStep] = useState<Step>(water === undefined ? 'zip' : 'result')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [editing, setEditing] = useState(water === undefined)
  const [zip, setZip] = useState(water?.zip ?? '')
  const [utility, setUtility] = useState<WaterUtility | null>(null)
  const [area, setArea] = useState('')
  const [reading, setReading] = useState('')
  const [unit, setUnit] = useState<ReadingUnit>('gpg')
  const [year, setYear] = useState('')
  const [readingStep, setReadingStep] = useState<Override | null>(null)
  const [tried, setTried] = useState(false)
  const [now] = useState(Date.now)
  const save = useConvexCall(api.inventory.setWater)
  const ids = { zip: useId(), zipText: useId(), area: useId(), reading: useId(), readingError: useId(), unit: useId(), year: useId(), yearError: useId() }
  const match = validZip(zip) ? ebmudForZip(zip) : null
  // What the result shows: the unsaved answers if there are any, else what is saved.
  const shown: HouseholdWater | undefined = draft === null ? water : { ...draft, ...classifyWater({ ...draft, setAt: now }, now), setAt: now }
  const choose = (answers: Draft) => { setDraft(answers); setTried(false); setStep('result') }
  // A new ZIP starts over: its town and any override belong to the old address.
  const lookup = (picked: WaterUtility, town?: string) => choose({ zip, utility: picked, ...(town === undefined ? {} : { area: town }), source: 'lookup' })
  const kept = { ...(shown?.zip === undefined ? {} : { zip: shown.zip }), ...(shown?.utility === undefined ? {} : { utility: shown.utility }), ...(shown?.area === undefined ? {} : { area: shown.area }) }
  const value = Number(reading.trim())
  const readingValid = reading.trim() !== '' && readingOk(value, unit)
  const reportYear = Number(year.trim())
  const yearValid = step !== 'utility_report' || reportYearOk(year.trim(), now)
  const readingWrong = tried && !readingValid && !(step === 'softener' && reading.trim() === '')
  const yearWrong = tried && !yearValid
  const zipWrong = tried && !validZip(zip)
  const status = shown === undefined ? undefined : waterStatus(shown, now)
  const done = async () => {
    if (draft !== null && await save.run({ householdId, water: draft }) === undefined) return
    onClose()
  }
  const cancelEdit = () => { setDraft(null); setZip(water?.zip ?? ''); setReading(''); setYear(''); setReadingStep(null); setTried(false); setEditing(false); setStep('result') }
  const onZip = () => {
    setTried(true)
    if (!validZip(zip)) return
    setReading(''); setYear(''); setReadingStep(null)
    if (match === null) return lookup('not_listed')
    if (match === 'only') { setArea(''); setStep('area'); return setTried(false) }
    setUtility(null)
    setTried(false)
    setStep('bill')
  }
  const footer = (() => {
    if (step === 'zip') return <Button type="button" onClick={onZip}>{waterCopy.continue}</Button>
    if (step === 'bill') return <Button type="button" disabled={utility === null} onClick={() => utility === 'ebmud' ? setStep('area') : utility !== null && lookup(utility)}>{waterCopy.continue}</Button>
    if (step === 'area') return <Button type="button" disabled={area === ''} onClick={() => lookup('ebmud', area)}>{waterCopy.save}</Button>
    if (step === 'result') return <Button type="button" disabled={save.pending} onClick={() => void done()}>{waterCopy.done}</Button>
    if (step === 'pick') return undefined
    return <Button type="button" onClick={() => {
      setTried(true)
      if (readingValid && yearValid) choose({ ...kept, source: step, reading: { value, unit, ...(step === 'utility_report' ? { reportYear } : {}) } })
      else if (step === 'softener' && reading.trim() === '') choose({ ...kept, source: 'softener' })
    }}>{waterCopy.save}</Button>
  })()
  const startReading = (kind: Override) => { if (kind !== readingStep) { setReading(''); setYear('') }; setReadingStep(kind); setTried(false); setStep(kind) }
  const back = (): Step | undefined => {
    if (step === 'result') return undefined
    if (step === 'zip') return shown === undefined ? undefined : 'result'
    if (step === 'area') return match === 'only' ? 'zip' : 'bill'
    if (step === 'bill') return 'zip'
    return step === 'pick' ? 'result' : 'pick'
  }
  const previous = back()
  const tab = step === 'pick' || step === 'strip' || step === 'softener' || step === 'utility_report' ? 'reading' : 'location'
  return <Sheet key={editing ? 'edit' : 'record'} title={step === 'strip' || step === 'softener' || step === 'utility_report' ? waterCopy.readingTitle[step] : waterCopy.title} step={step} onClose={editing && water !== undefined ? cancelEdit : onClose} closeAtTop={!editing || water === undefined} closeLabel="Cancel" compactActions busy={save.pending} dirty={editing && (draft !== null || zip !== (water?.zip ?? '') || reading !== '' || year !== '')}
    onEdit={!editing && water !== undefined ? () => { setEditing(true); setStep('zip') } : undefined} editLabel="Edit water details"
    onBack={previous === undefined ? undefined : () => setStep(previous)}
    footer={<><ErrorNotice error={save.error} />{footer}</>}>
    <fieldset disabled={save.pending} className="m-0 grid min-w-0 gap-4 border-0 p-0">
    <Tabs value={tab} onValueChange={(value) => { if (!save.pending && value !== null) { setTried(false); setStep(value === 'reading' ? readingStep ?? 'pick' : 'zip') } }}>
    {editing && water !== undefined ?
      <TabsList aria-label="Water editor sections"><TabsTrigger value="location" disabled={save.pending}>Location</TabsTrigger><TabsTrigger value="reading" disabled={save.pending}>Reading</TabsTrigger></TabsList>
    : null}
    <TabsContent value={tab}>
    {step === 'zip' ? <Field>
      <FieldLabel htmlFor={ids.zip}>{waterCopy.zipQuestion}</FieldLabel>
      <Input id={ids.zip} value={zip} inputMode="numeric" autoComplete="postal-code" maxLength={5} aria-invalid={zipWrong || undefined} aria-describedby={ids.zipText} onChange={(event) => setZip(event.target.value.replace(/\D/g, ''))} />
      <SheetText id={ids.zipText} role={zipWrong ? 'alert' : undefined}>{zipWrong ? waterCopy.zipProblem : waterCopy.zipHint}</SheetText>
    </Field> : null}
    {step === 'bill' ? <Choices label={waterCopy.billQuestion} options={['ebmud', 'not_listed', 'well'] as const} value={utility} onPick={setUtility} words={(bill) => waterCopy.bills[bill]} /> : null}
    {step === 'area' ? <Field>
      <FieldLabel htmlFor={ids.area}>{waterCopy.areaQuestion}</FieldLabel>
      <NativeSelect id={ids.area} value={area} onChange={(event) => setArea(event.target.value)}>
        <option value="" disabled>{waterCopy.pickArea}</option>
        {ebmudAreas.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </NativeSelect>
      <SheetText>{waterCopy.areaHint}</SheetText>
    </Field> : null}
    {step === 'result' && shown !== undefined && status !== undefined ? <>
      <FactsCard label={waterCopy.title} rows={[[waterCopy.title, status.title], [waterCopy.fromLabel, waterSourceWords(shown)], ...(shown.zip === undefined ? [] : [[waterCopy.zipLabel, shown.zip] as const])]} />
      {status.note === undefined ? null : <SheetText muted={false}>{status.note}</SheetText>}
      {shown.source === 'lookup' && shown.utility === 'not_listed' ? <SheetText muted={false}>{waterCopy.noMatch}</SheetText> : null}
      <TrialNote>{trialText.water}</TrialNote>
      {editing ? <ActionList label={waterCopy.testIt} chevrons actions={[
        { key: 'pick', label: waterCopy.testIt, quiet: true, onClick: () => setStep('pick') },
        ...(shown.utility === 'well' || !validZip(zip) ? [] : [{ key: 'well', label: waterCopy.onWell, quiet: true, onClick: () => lookup('well') }]),
      ]} /> : null}
    </> : null}
    {step === 'pick' ? <ActionList label={waterCopy.testIt} chevrons actions={[
      { key: 'strip', label: waterCopy.strip, onClick: () => startReading('strip') },
      { key: 'report', label: waterCopy.report, onClick: () => startReading('utility_report') },
      { key: 'softener', label: waterCopy.softener, onClick: () => startReading('softener') },
    ]} /> : null}
    {step === 'strip' || step === 'softener' || step === 'utility_report' ? <>
      <SheetText>{waterCopy.readingHint[step]}</SheetText>
      <Field>
        <FieldLabel htmlFor={ids.reading}>{waterCopy.readingLabel}</FieldLabel>
        <Input id={ids.reading} value={reading} inputMode="decimal" autoComplete="off" aria-invalid={readingWrong || undefined} aria-describedby={readingWrong ? ids.readingError : undefined} onChange={(event) => setReading(event.target.value)} />
      </Field>
      <Field>
        <FieldLabel htmlFor={ids.unit}>{waterCopy.unitLabel}</FieldLabel>
        <NativeSelect id={ids.unit} value={unit} onChange={(event) => setUnit(event.target.value as ReadingUnit)}>
          {(['gpg', 'mg_l'] as const).map((option) => <option key={option} value={option}>{waterCopy.units[option]}</option>)}
        </NativeSelect>
      </Field>
      {step === 'utility_report' ? <Field>
        <FieldLabel htmlFor={ids.year}>{waterCopy.reportYearLabel}</FieldLabel>
        <Input id={ids.year} value={year} inputMode="numeric" autoComplete="off" maxLength={4} aria-invalid={yearWrong || undefined} aria-describedby={yearWrong ? ids.yearError : undefined} onChange={(event) => setYear(event.target.value.replace(/\D/g, ''))} />
      </Field> : null}
      {readingWrong ? <SheetText id={ids.readingError} role="alert" muted={false}>{waterCopy.readingProblem}</SheetText> : null}
      {yearWrong ? <SheetText id={ids.yearError} role="alert" muted={false}>{waterCopy.reportYearProblem}</SheetText> : null}
    </> : null}
    </TabsContent>
    </Tabs>
    </fieldset>
  </Sheet>
}
