import { useMutation, usePaginatedQuery } from 'convex/react'
import type { FunctionArgs } from 'convex/server'
import { ConvexError } from 'convex/values'
import { useId, useRef, useState } from 'react'

import { api } from '@/api'
import type { GarmentRecord } from '@/closet/garment-record'
import { Disclosure } from '@/kit/disclosure'
import { Sheet } from '@/kit/sheet'
import { errorMessage, ErrorNotice, Loading } from '@/kit/ui'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { TrialNote } from '@/laundry/laundry-ui'
import { trialText } from '@/copy-trial'

type Wash = GarmentRecord['washes'][number]
type Choice = FunctionArgs<typeof api.outcomeAssessments.save>
type Dimension = Choice['dimension']
type Stage = Choice['checkedWhen']
type Result = NonNullable<Choice['result']>

const dimensions: Record<Dimension, string> = { overall: 'Overall', stain: 'Stain', appearance: 'Appearance', odor: 'Odor', feel: 'Feel', damage: 'Garment damage' }
const stages: Record<Stage, string> = { after_wash: 'After washing', after_drying: 'After drying', after_wearing: 'After wearing' }
const results: Record<Result, string> = { unknown: 'Not sure', improved: 'Improved', unchanged: 'No change', worse: 'Worse', irritation: 'Irritation noticed', damage: 'Fabric damage noticed' }
const date = (at: number) => new Date(at).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })
const resultWords = (result: Choice['result']) => result === null ? 'Result cleared' : results[result]

/** Unknown, unanswered and explicitly cleared slots are distinct. */
export function assessmentFor(wash: Wash, dimension: Dimension, checkedWhen: Stage) {
  const slot = wash.assessments?.find((entry) => entry.dimension === dimension && entry.checkedWhen === checkedWhen)
  return { result: slot?.result ?? null, note: slot?.note ?? '', revision: slot?.revision ?? 0, recorded: slot !== undefined && slot.result !== null }
}

export type WashNote = { text: string; tone: 'ready' | 'neutral' | 'warn' }
const resultTone: Record<Result, WashNote['tone']> = { improved: 'ready', unknown: 'neutral', unchanged: 'neutral', worse: 'warn', irritation: 'warn', damage: 'warn' }

/** The reader's own results as tinted history notes: only an improvement reads as good news. */
export function assessmentNotes(wash: Wash): WashNote[] {
  return (wash.assessments ?? []).filter((slot) => slot.result !== null).map((slot) => ({ text: `${dimensions[slot.dimension]} · ${resultWords(slot.result)} · ${stages[slot.checkedWhen]}${slot.note ? ` · ${slot.note}` : ''}`, tone: resultTone[slot.result!] }))
}

export function assessmentLines(wash: Wash): string[] {
  const slots = wash.assessments ?? []
  return slots.filter((slot) => slot.result !== null).map((slot) => `Your result: ${dimensions[slot.dimension]} · ${resultWords(slot.result)} · ${stages[slot.checkedWhen]}${slot.note ? ` · ${slot.note}` : ''}`)
}

/** Select a recent wash/observation first. The nested draft sheet guards every dismissal. */
export function OutcomeAssessment({ washes }: { washes: GarmentRecord['washes'] }) {
  const id = useId()
  const [selected, setSelected] = useState<string>('')
  const [dimension, setDimension] = useState<Dimension>('overall')
  const [stage, setStage] = useState<Stage>('after_wash')
  const [editing, setEditing] = useState<Wash | null>(null)
  const [history, setHistory] = useState(false)
  const recent = washes.filter((wash) => wash.recordId !== undefined)
  const wash = recent.find((entry) => entry.recordId === selected) ?? recent[0]
  // A newly completed wash must not move an open draft to a different record.
  const editingWash = editing === null ? null : recent.find((entry) => entry.recordId === editing.recordId) ?? editing
  if (wash === undefined || wash.recordId === undefined) return null
  const current = assessmentFor(wash, dimension, stage)
  return <Disclosure summary="How did a wash turn out?">
    <div className="grid min-w-0 gap-3 pt-3">
      <p className="text-sm text-ink-2">Private to you · all checks belong to the same wash.</p>
      <Field><FieldLabel htmlFor={`${id}-wash`}>Which wash?</FieldLabel><NativeSelect id={`${id}-wash`} value={wash.recordId} onChange={(event) => { setSelected(event.target.value); setHistory(false) }}>{recent.map((entry, index) => <NativeSelectOption key={entry.recordId} value={entry.recordId}>{index === 0 ? 'Latest · ' : ''}{date(entry.at)} · {entry.washerName} · {entry.cycle}</NativeSelectOption>)}</NativeSelect></Field>
      <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-3">
      <Field><FieldLabel htmlFor={`${id}-dimension`}>What are you checking?</FieldLabel><NativeSelect id={`${id}-dimension`} value={dimension} onChange={(event) => { setDimension(event.target.value as Dimension); setHistory(false) }}>{Object.entries(dimensions).map(([value, label]) => <NativeSelectOption key={value} value={value}>{label}</NativeSelectOption>)}</NativeSelect></Field>
      <Field><FieldLabel htmlFor={`${id}-stage`}>When did you check?</FieldLabel><NativeSelect id={`${id}-stage`} value={stage} onChange={(event) => { setStage(event.target.value as Stage); setHistory(false) }}>{Object.entries(stages).map(([value, label]) => <NativeSelectOption key={value} value={value}>{label}</NativeSelectOption>)}</NativeSelect></Field>
      </div>
      <p aria-live="polite">{current.recorded ? `Your result: ${resultWords(current.result)}${current.note ? ` · ${current.note}` : ''}` : current.revision > 0 ? 'Your result was cleared.' : 'No assessment yet.'}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => { setSelected(wash.recordId!); setEditing(wash) }}>{current.recorded ? 'Correct result' : 'Record result'}</Button>
        {current.revision > 0 ? <Button type="button" variant="outline" onClick={() => setHistory(!history)} aria-expanded={history}>{history ? 'Hide correction history' : 'Show correction history'}</Button> : null}
      </div>
      {history ? <AssessmentHistory key={`${wash.recordId}-${dimension}-${stage}`} recordId={wash.recordId} dimension={dimension} checkedWhen={stage} /> : null}
    </div>
    {editingWash?.recordId === undefined ? null : <AssessmentEditor key={`${editingWash.recordId}-${dimension}-${stage}`} wash={editingWash} recordId={editingWash.recordId} dimension={dimension} checkedWhen={stage} onClose={() => setEditing(null)} />}
  </Disclosure>
}

function AssessmentEditor({ wash, recordId, dimension, checkedWhen, onClose }: { wash: Wash; recordId: Choice['recordId']; dimension: Dimension; checkedWhen: Stage; onClose: () => void }) {
  const id = useId()
  const mutate = useMutation(api.outcomeAssessments.save)
  const current = assessmentFor(wash, dimension, checkedWhen)
  const [base, setBase] = useState(current)
  const [result, setResult] = useState<Result | ''>(current.result ?? '')
  const [note, setNote] = useState(current.note)
  const [checked, setChecked] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [unconfirmed, setUnconfirmed] = useState(false)
  // An uncertain request retains its exact payload/revision/receipt until acknowledged or rejected.
  const request = useRef<Choice | null>(null)
  const inFlight = useRef(false)
  const changedElsewhere = current.revision !== base.revision || current.result !== base.result || current.note !== base.note
  const edited = result !== (base.result ?? '') || note !== base.note
  const dirty = edited || pending || unconfirmed
  const correction = base.recorded || base.revision > 0
  const canSave = result !== '' && (edited || !base.recorded) && (!correction || checked) && !changedElsewhere
  const reviewLatest = () => {
    setBase(current); setResult(current.result ?? ''); setNote(current.note); setChecked(false)
    setError(null); setNotice(null); setUnconfirmed(false); setClearing(false); request.current = null
  }
  const save = async (clear = false) => {
    if (inFlight.current) return
    if (request.current === null) {
      if (changedElsewhere || (!clear && !canSave) || (clear && (!base.recorded || !checked))) return
      request.current = { recordId, dimension, checkedWhen, result: clear ? null : result as Result,
        ...(clear || !note.trim() ? {} : { note: note.trim() }), expectedRevision: base.revision, receiptId: crypto.randomUUID() }
    }
    const payload = request.current
    inFlight.current = true; setPending(true); setError(null); setNotice(null)
    try {
      const ack = await mutate(payload)
      const next = { result: payload.result, note: payload.note ?? '', revision: ack.revision, recorded: payload.result !== null }
      setBase(next); setResult(payload.result ?? ''); setNote(payload.note ?? ''); setChecked(false); setClearing(false)
      setNotice(ack.replay ? 'Original save confirmed. Review the latest result if it changed later.' : payload.result === null ? 'Result cleared. Correction history is retained.' : 'Assessment saved.')
      setUnconfirmed(false); request.current = null
    } catch (caught) {
      setError(errorMessage(caught))
      // A server rejection is resolved; a transport failure needs the same receipt for safe retry.
      if (caught instanceof ConvexError) { request.current = null; setUnconfirmed(false) }
      else setUnconfirmed(true)
    } finally { inFlight.current = false; setPending(false) }
  }
  return <Sheet title="Assess wash" subtitle={`${date(wash.at)} · ${wash.washerName} · ${dimensions[dimension]} · ${stages[checkedWhen]}`} onClose={onClose} dirty={dirty} busy={pending} compactActions closeAtTop
    footer={<Button type="button" disabled={pending || (!unconfirmed && !canSave)} onClick={() => void save()}>{pending ? 'Saving…' : unconfirmed ? 'Retry save' : 'Save assessment'}</Button>}>
    <form className="grid min-w-0 gap-3" onSubmit={(event) => { event.preventDefault(); void save() }}>
      <Field><FieldLabel htmlFor={`${id}-result`}>What changed?</FieldLabel><NativeSelect id={`${id}-result`} value={result} disabled={pending || unconfirmed} onChange={(event) => { setResult(event.target.value as Result); setNotice(null) }}>
        <NativeSelectOption value="" disabled>Choose a result</NativeSelectOption>{Object.entries(results).map(([value, label]) => <NativeSelectOption key={value} value={value}>{label}</NativeSelectOption>)}</NativeSelect></Field>
      <Field><FieldLabel htmlFor={`${id}-note`}>Notes (optional)</FieldLabel><Input id={`${id}-note`} maxLength={300} value={note} disabled={pending || unconfirmed} onChange={(event) => { setNote(event.target.value); setNotice(null) }} /></Field>
      <p className="text-sm text-ink-2">Private to you. “Not sure” is saved as your observation.</p>
      <TrialNote>{trialText.assessment}</TrialNote>
      {correction ? <FieldLabel className="min-h-11" htmlFor={`${id}-checked`}><Input id={`${id}-checked`} type="checkbox" checked={checked} disabled={pending || unconfirmed} onChange={(event) => setChecked(event.target.checked)} />I’ve checked this result</FieldLabel> : null}
      {changedElsewhere && !pending ? <div className="grid gap-2" role="status"><p>This result changed elsewhere. Your draft has been kept.</p><p className="break-words">Latest: {current.recorded ? resultWords(current.result) : 'No current result'}{current.note ? ` · ${current.note}` : ''}</p>
        {!unconfirmed ? <Button type="button" variant="outline" onClick={reviewLatest}>{edited ? 'Discard draft and use latest result' : 'Use latest result'}</Button> : null}</div> : null}
      {unconfirmed ? <p role="status">The save was not confirmed. Retry keeps the same result and avoids recording it twice.</p> : null}
      {base.recorded && !unconfirmed ? <Button type="button" variant="outline" disabled={pending || changedElsewhere} onClick={() => setClearing(true)}>Clear result</Button> : null}
      {clearing ? <div className="grid gap-2" role="group" aria-label="Clear this result?"><p>Clear this result and its current note? Correction history is retained.</p><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => setClearing(false)}>Keep result</Button><Button type="button" variant="destructive" disabled={pending || !checked || changedElsewhere} onClick={() => void save(true)}>Confirm clear result</Button></div></div> : null}
      {result === 'worse' || result === 'irritation' || result === 'damage' ? <p className="text-sm text-ink-2">Review recorded products and doses, rinsing, machine condition, drying and storage before trying another treatment. Do not combine products or increase the dose based on this result.</p> : null}
      {notice ? <p role="status">{notice}</p> : null}<ErrorNotice error={error} />
    </form>
  </Sheet>
}

function AssessmentHistory({ recordId, dimension, checkedWhen }: Pick<Choice, 'recordId' | 'dimension' | 'checkedWhen'>) {
  const { results: revisions, status, loadMore } = usePaginatedQuery(api.outcomeAssessments.history, { recordId, dimension, checkedWhen }, { initialNumItems: 10 })
  return <section aria-label="Your correction history" className="grid min-w-0 gap-2">
    <p className="text-sm text-ink-2">Only your corrections are shown. Clearing a result retains this history.</p>
    {status === 'LoadingFirstPage' ? <Loading what="correction history" /> : <ol className="grid list-none gap-2 p-0">{revisions.map((revision) => <li key={revision.revision} className="grid gap-1 break-words"><span>Revision {revision.revision} · {date(revision.recordedAt)} · {resultWords(revision.result)}</span>{revision.note ? <span>{revision.note}</span> : null}</li>)}</ol>}
    {status === 'CanLoadMore' || status === 'LoadingMore' ? <Button type="button" variant="outline" disabled={status === 'LoadingMore'} onClick={() => loadMore(10)}>Older corrections</Button> : null}
  </section>
}
