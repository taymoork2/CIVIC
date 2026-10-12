import type { DryingMethod } from '@washcloset/planner'
import { useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { createContext, useContext, useState, type ReactNode } from 'react'

import type { Id } from '@convex/_generated/dataModel'
import { api } from '@/api'
import { Facts, Segmented } from '@/closet/closet-parts'
import { cycleWord, dryMethodText, garmentRecordText } from '@/copy'
import { garmentTabText } from '@/copy-closet'
import { midCheckText } from '@/copy-drying'
import { DesignIcon } from '@/kit/design-icons'
import { ReceiptRows, type KitFact } from '@/laundry/laundry-kit'
import { DryingPreferenceSheet, labelWords } from '@/drying/drying-method'
import { CareEmpty } from '@/products/product-ui'
import { cn } from '@/lib/utils'
import { assessmentLines, assessmentNotes, OutcomeAssessment, type WashNote } from '@/laundry/outcome-assessment'
import { dryerHeatLabels, ErrorNotice, Loading, useConvexCall } from '@/kit/ui'
import { doseParts, useUnits, type UnitSystem } from '@/kit/units'

export type GarmentRecord = FunctionReturnType<typeof api.sessions.garmentRecord>
type Drying = GarmentRecord['washes'][number]['drying']
export type GarmentTab = 'care' | 'details' | 'history'

const methodWords = (method: string | undefined): string | null => (method !== undefined && method in dryMethodText.methods ? dryMethodText.methods[method as DryingMethod] : null)
/** How a piece dried, in the past tense ("Hung to dry", "Dried flat"). */
const pastWords = (method: string | undefined): string | null => (method !== undefined && method in dryMethodText.past ? dryMethodText.past[method as DryingMethod] : null)

/**
 * How one wash dried, in the history's words: "Dried with Heated hanging dryer (this time only) ·
 * compatibility not established by label (Don't tumble dry)". A label-led drying says where it dried.
 */
export function dryingLine(drying: Drying): string {
  if (drying.outcome === 'queued') return garmentRecordText.waiting
  // Taken out at a mid-run check and hung (design 12.2 item 11).
  if (drying.tumbledMinutes !== undefined) return midCheckText.tumbledThenHung(drying.tumbledMinutes, drying.dryerName ?? null)
  const scope = drying.scope === 'once' || drying.scope === 'preference' || drying.scope === 'routine' ? drying.scope : null
  if (scope !== null) {
    const machine = (drying.method === 'heated_hanging' || drying.method === 'tumble') && drying.dryerName ? garmentRecordText.driedWith(drying.dryerName) : null
    const how = machine ?? pastWords(drying.method) ?? garmentRecordText.hung
    const evidence = drying.evidence === undefined || drying.evidence === 'allowed' ? null : garmentRecordText.evidence[drying.evidence]
    const label = drying.label === undefined ? '' : ` (${labelWords(drying.label)})`
    return `${how} ${scope === 'routine' ? '(Wash & dry preferences)' : garmentRecordText.scope[scope]}${evidence === null ? '' : ` · ${evidence}${label}`}`
  }
  if (drying.outcome === 'tumble_dried') {
    return [garmentRecordText.tumbled(drying.dryerName ?? null), drying.heat === undefined ? null : dryerHeatLabels[drying.heat as keyof typeof dryerHeatLabels] ?? drying.heat, drying.minutes === undefined ? null : garmentRecordText.minutes(drying.minutes), drying.checkMissed === true ? midCheckText.checkMissed : null].filter((part) => part !== null).join(' · ')
  }
  if (drying.method === 'heated_hanging') return garmentRecordText.driedWith(drying.dryerName ?? dryMethodText.methods.heated_hanging)
  return pastWords(drying.method) ?? garmentRecordText.hung
}

const noteTone = { ready: 'bg-ready-bg text-ready-ink', neutral: 'bg-surface-2 text-ink', warn: 'bg-warn-bg text-warn-ink' } as const

const dateWord = (at: number) => new Date(at).toLocaleDateString([], { day: 'numeric', month: 'short' })

type Wash = GarmentRecord['washes'][number]

/** One history entry: when it happened, an optional heading (a load names its pieces), and its lines. */
export type CareHistoryEntry = {
  at: number
  title?: string
  lines: string[]
  /** A wash as fact cells (washed, dried, used); with these, `lines` is the plain-text form for load history. */
  facts?: KitFact[]
  /** Where it happened, shown at the right of the date. */
  place?: string
  /** What was noticed or how it turned out: one tinted line each under the cells. */
  notes?: WashNote[]
}

/** Dried, in a word or two: tumble heat and minutes, or Hung; anything with a label verdict keeps its full sentence. */
export function dryingValue(drying: Drying): string {
  // A stored scope may be null: only a real one (this time, remembered, routine) keeps the full sentence.
  const scoped = drying.scope === 'once' || drying.scope === 'preference' || drying.scope === 'routine'
  if (!scoped && drying.tumbledMinutes == null && drying.checkMissed !== true) {
    if (drying.outcome === 'tumble_dried') {
      const heat = drying.heat === undefined ? null : dryerHeatLabels[drying.heat as keyof typeof dryerHeatLabels] ?? drying.heat
      return [heat, drying.minutes === undefined ? null : garmentRecordText.minutes(drying.minutes)].filter((part) => part !== null).join(', ') || dryingLine(drying)
    }
    if (drying.outcome === 'left_hanging' && drying.method !== 'heated_hanging' && methodWords(drying.method) === null) return garmentRecordText.fact.hung
  }
  return dryingLine(drying)
}

/** One wash as fact cells, its place and the lines that are about it rather than its steps. */
function washEntry(wash: Wash, system: UnitSystem): CareHistoryEntry {
  const lines = washLines(wash, system)
  const products = wash.products?.map((product) => `${product.name} · ${doseParts(product, system).spoken}`).join('; ')
  const facts: KitFact[] = [
    { key: 'washed', tone: 'wash', icon: <DesignIcon name="washer" />, label: garmentRecordText.fact.washed, value: cycleWord(wash.cycle) ?? garmentRecordText.fact.none },
    { key: 'dried', tone: 'dry', icon: <DesignIcon name={wash.drying.outcome === 'left_hanging' && wash.drying.method !== 'heated_hanging' ? 'hang' : 'dryer'} />, label: garmentRecordText.fact.dried, value: dryingValue(wash.drying) },
    ...(products ? [{ key: 'used', tone: 'used' as const, icon: <DesignIcon name="bottle" />, label: garmentRecordText.fact.used, value: products }] : []),
  ]
  return { at: wash.at, lines, facts, ...(wash.washerName === null ? {} : { place: wash.washerName }), notes: [...(wash.observation === undefined ? [] : [{ text: `${wash.observation.problem} · ${wash.observation.timing.replaceAll('_', ' ')}${wash.observation.recurring ? ' · recurring' : ''}${wash.observation.previousWash ? ` · ${wash.observation.previousWash}` : ''}`, tone: 'warn' as const }]), ...assessmentNotes(wash)] }
}

/** What one recorded wash says in history: washer and cycle, drying, products, what was noticed, and the reader's own assessment. */
export function washLines(wash: Wash, system: UnitSystem): string[] {
  return [
    garmentRecordText.washed(wash.washerName, cycleWord(wash.cycle)),
    dryingLine(wash.drying),
    ...(wash.products?.length ? [`Used: ${wash.products.map((product) => `${product.name} · ${doseParts(product, system).spoken}`).join('; ')}`] : []),
    ...(wash.observation === undefined ? [] : [`Noticed: ${wash.observation.problem} · ${wash.observation.timing.replaceAll('_', ' ')}${wash.observation.recurring ? ' · recurring' : ''}${wash.observation.previousWash ? ` · ${wash.observation.previousWash}` : ''}`]),
    ...assessmentLines(wash),
  ]
}

/** A garment's history: routine changes, washes and drying preference changes, newest first. */
export function careHistoryEntries(record: GarmentRecord, system: UnitSystem): CareHistoryEntry[] {
  return [
    ...(record.routineChanges ?? []).map((change) => ({ at: change.at, lines: [change.text] })),
    ...record.washes.map((wash) => washEntry(wash, system)),
    ...record.preferenceChanges.map((change) => ({ at: change.at, lines: [change.method === null ? garmentRecordText.preferenceRemoved : garmentRecordText.preferenceSet(methodWords(change.method) ?? change.method)] })),
  ].sort((left, right) => right.at - left.at)
}

/**
 * History entries as one list. A garment's entries are headed by date; a load's entries share one
 * date, so each is headed by its piece. `trailing` adds a per-entry link, such as to a piece's record.
 */
export function CareHistoryList({ entries, scope = 'garment', label = garmentRecordText.history, trailing }: {
  entries: CareHistoryEntry[]
  scope?: 'garment' | 'load'
  label?: string
  trailing?: (entry: CareHistoryEntry, index: number) => ReactNode
}) {
  return <ol aria-label={label} className="m-0 grid list-none gap-4 p-0">
    {entries.map((entry, index) => <li key={`${entry.at}-${index}`} className="grid gap-2">
      <div className="flex items-baseline justify-between gap-3 px-1 text-[length:var(--step--1)] font-semibold text-ink-2">
        <span>{scope === 'load' && entry.title !== undefined ? entry.title : dateWord(entry.at)}</span>
        {entry.place === undefined ? null : <span className="font-normal">{entry.place}</span>}
      </div>
      {entry.facts === undefined || scope === 'load'
        ? <div className="grid gap-0.5 rounded-control bg-surface px-3.5 py-2.5 shadow-[var(--e1)]">{entry.lines.map((line) => <span key={line} className="text-[length:var(--step-0)] leading-normal">{line}</span>)}</div>
        : <ReceiptRows label={dateWord(entry.at)} facts={entry.facts} />}
      {scope === 'load' ? null : entry.notes?.map((note) => <p key={note.text} className={cn('m-0 flex items-start gap-2 rounded-field px-3 py-2.5 text-[length:var(--step--1)] font-semibold [overflow-wrap:anywhere]', noteTone[note.tone])}>{note.text}</p>)}
      {trailing?.(entry, index)}
    </li>)}
  </ol>
}

const routeTab = createContext<GarmentTab | undefined>(undefined)

/** The tab a link asked the record to open on (Closet's `tab=history`), for records rendered below it. */
export function GarmentRecordTab({ value, children }: { value: GarmentTab | undefined; children: ReactNode }) {
  return <routeTab.Provider value={value}>{children}</routeTab.Provider>
}

/** The garment record as Care / Details / History tabs; Care adds the drying preference, History its washes. */
export function GarmentRecordTabs({ textileId, details, care }: { textileId: string; details: ReactNode; care: ReactNode }) {
  const initialTab = useContext(routeTab)
  const record = useQuery(api.sessions.garmentRecord, { textileId: textileId as Id<'textiles'> })
  const setPreference = useConvexCall(api.dryingQueue.setDryingPreference)
  const [open, setOpen] = useState(false)
  const save = (method: DryingMethod | null) => void setPreference.run({ textileId: textileId as Id<'textiles'>, method }).then((result) => { if (result !== undefined) setOpen(false) })

  return <>
    <GarmentRecordView record={record} details={details} care={care} initialTab={initialTab} error={setPreference.error} onEditPreference={() => setOpen(true)} assessment={record === undefined ? undefined : <OutcomeAssessment washes={record.washes} />} />
    {open && record !== undefined && record.preference !== null ? (
      <DryingPreferenceSheet name={garmentRecordText.dryingPreference} label={record.label} preference={record.preference} equipment={record.equipment} pending={setPreference.pending}
        onChange={(method) => save(method)} onFollowLabel={() => save(null)} onClose={() => setOpen(false)} />
    ) : null}
  </>
}

/** The same record panels with supplied data; no backend access or writes. */
export function GarmentRecordView({ record, details, care, error = null, onEditPreference, assessment, initialTab = 'care' }: {
  record?: GarmentRecord
  details: ReactNode
  care: ReactNode
  error?: string | null
  onEditPreference?: () => void
  assessment?: ReactNode
  /** The tab shown first, e.g. History when arriving from a load's record. */
  initialTab?: GarmentTab
}) {
  const [tab, setTab] = useState<GarmentTab>(initialTab)
  const { system } = useUnits()
  const history = record === undefined ? [] : careHistoryEntries(record, system)

  return <div className="grid gap-4">
    <Segmented tabs label={garmentTabText.tabs} value={tab} onChange={setTab} options={[
      { value: 'care', label: garmentTabText.care },
      { value: 'details', label: garmentTabText.details },
      { value: 'history', label: garmentTabText.history },
    ]} />
    <div role="tabpanel" aria-label={garmentTabText[tab]} className="grid gap-4">
      {tab === 'details' ? details : null}
      {tab === 'care' ? <>
        {care}
        {record === undefined || record.preference === null || record.hasRoutineDry === true ? null : <Facts rows={[{
          key: 'drying',
          label: garmentRecordText.dryingPreference,
          value: dryMethodText.methods[record.preference],
          ...(onEditPreference === undefined ? {} : { onEdit: onEditPreference }),
        }]} />}
        <ErrorNotice error={error} />
      </> : null}
      {tab === 'history' ? (record === undefined ? <Loading what={garmentRecordText.loadingHistory} /> : history.length === 0 ? <CareEmpty icon="history" title={garmentRecordText.noHistory} /> : <CareHistoryList entries={history} />) : null}
      {tab === 'history' ? assessment : null}
    </div>
  </div>
}
