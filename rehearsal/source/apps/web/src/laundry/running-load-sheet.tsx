import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useQuery } from 'convex/react'
import { useState, type ReactNode } from 'react'
import { isDryerPhase } from '@washcloset/planner'

import type { Id } from '@convex/_generated/dataModel'
import { api } from '@/api'
import { byHandActions, byHandDue, chemistryGroups, ChemistryGroups } from '@/laundry/chemistry-view'
import { homeText, loadText, sessionText } from '@/copy'
import { AddTimeSheet } from '@/kit/add-time-sheet'
import { useOnline } from '@/connectivity'
import { addTimeText, timerText } from '@/copy-run'
import { chemistryText, runningScreenText, runningText } from '@/copy-laundry'
import { Note, Section, StepsCard } from '@/laundry/laundry-ui'
import { RecordRow } from '@/kit/record-row'
import { sessionStage } from '@/laundry/session-stage'
import { LoadCard, RunningRing } from '@/laundry/laundry-kit'
import { loadPieces, loadStageAt, loadSummaryActionClassName } from '@/laundry/load-summary'
import { minutesLeft, sessionModel, stageFacts, TimeCard, washerName, type Action, type Detail } from '@/laundry/session-view'
import { Sheet } from '@/kit/sheet'
import { ErrorNotice, Loading, clockTime, useConvexCall } from '@/kit/ui'
import { DesignIcon } from '@/kit/design-icons'

/**
 * One running load, as a sheet: where it is, when it is done by the machine's recorded times, what
 * is in it, the recipe it started with and the by-hand additions the product records time. Several
 * loads can run at once, each with its own sheet. Finishing uses the existing drying-queue operation;
 * unresolved recorded steps stay on the load page instead of being skipped by the quick action.
 */


export function RunningLoadSheet({ sessionId, now, onClose, openLink }: {
  sessionId: string
  now: number
  onClose: () => void
  /** The link to the load's own page; the sheet itself never navigates. */
  openLink: (props: { className: string; children: string }) => ReactNode
}) {
  const online = useOnline()
  const [addingTime, setAddingTime] = useState(false)
  const queue = useConvexCall(api.dryingQueue.queueFromWasher)
  const served = useQuery(api.execution.sessionDetail, { sessionId: sessionId as Id<'sessions'> })
  const detail = served === undefined ? undefined : sessionModel(served)
  if (detail === undefined) {
    return <Sheet title={runningText.sheetKicker} onClose={onClose}><Loading what="this load" /></Sheet>
  }
  if (addingTime) return <AddTimeSheet sessionId={sessionId as Id<'sessions'>} washer={washerName(detail.machineName)} online={online} onClose={() => setAddingTime(false)} onDone={() => setAddingTime(false)} />
  const canFinish = detail.status === 'running' && detail.machineStartedAt !== null && detail.dryerStartedAt === null
    && detail.actions.every((action) => action.status !== 'pending' || isDryerPhase(action.phase))
  return <RunningLoadSheetView detail={detail} now={now} onClose={onClose} openLink={openLink}
    pending={queue.pending} error={queue.error} online={online}
    onAddTime={detail.status === 'running' && detail.machineStartedAt !== null && detail.washFinishedAt === null && detail.dryerStartedAt === null ? () => setAddingTime(true) : undefined}
    onFinished={canFinish ? () => { if (!queue.pending && online) void queue.run({ sessionId: sessionId as Id<'sessions'>, at: Date.now() }).then((result) => { if (result !== undefined) onClose() }) } : undefined} />
}

export type RunningLoadDetail = Pick<Detail, 'status' | 'machineStartedAt' | 'estimatedFinishAt' | 'washFinishedAt' | 'dryerStartedAt' | 'drying' | 'actions' | 'machineName' | 'textiles' | 'doorLocks' | 'cycleMinutes' | 'finishConfidence'>

/** The real drawer presenter, also used with inert indexed fixture data. */
export function RunningLoadSheetView({ detail, now, onClose, openLink, onAddTime, onFinished, pending = false, error = null, online = true }: {
  detail: RunningLoadDetail
  now: number
  onClose: () => void
  openLink: (props: { className: string; children: string }) => ReactNode
  onAddTime?: () => void
  onFinished?: () => void
  pending?: boolean
  error?: string | null
  online?: boolean
}) {
  const times = sessionStage(stageFacts(detail), now)
  const inDryer = detail.dryerStartedAt !== null
  const machine = inDryer ? detail.drying?.dryerName ?? null : detail.machineName
  const doneAt = times.stage === 'drying' || times.stage === 'dry' ? times.dryReadyAt : times.washReadyAt
  const timer = doneAt === null ? null : doneAt <= now ? runningScreenText.timeIsUp : minutesLeft(doneAt, now)
  // A confirmed wash finish is a record of when, not a timer that ran out (as on the load page).
  const washFinishedAt = inDryer ? null : detail.washFinishedAt
  const steps = [...detail.actions].sort((left, right) => left.order - right.order)
  const byHand = byHandActions<Action>(steps)
  const recipe = chemistryGroups(steps.filter((action) => action.phase !== 'cycle'), detail.doorLocks, { clothes: true })
  const settings = steps.flatMap((action) => action.kind === 'task' && action.task === 'start' && action.detail ? [{ text: action.detail }] : [])
  const startedAt = inDryer ? detail.dryerStartedAt : detail.machineStartedAt
  const progress = startedAt === null || doneAt === null || doneAt <= startedAt ? null : Math.max(0, Math.min(1, (now - startedAt) / (doneAt - startedAt)))
  const timerSubtitle = doneAt !== null && doneAt <= now ? inDryer ? 'Check whether the pieces are dry' : timerText.check(washerName(machine))
    : !inDryer && detail.finishConfidence === 'observed' && detail.cycleMinutes !== null ? timerText.fromEntered(detail.cycleMinutes)
    : doneAt === null ? runningText.doneUnknown : inDryer ? `Check at ${clockTime(doneAt)}` : runningText.doneAt(clockTime(doneAt))
  return (
    <Sheet
      title={washerName(machine)}
      kicker={inDryer && times.stage === 'dry' ? 'Check dryness' : homeText.band.stages[times.stage]}
      subtitle={doneAt === null ? runningText.doneUnknown : inDryer ? `Check at ${clockTime(doneAt)}` : runningText.doneAt(clockTime(doneAt))}
      onClose={onClose}
      footer={onFinished === undefined ? openLink({ className: cn(buttonVariants({ size: 'lg' }), 'w-full'), children: runningText.openLoad }) : <Button size="lg" className="w-full" disabled={pending || !online} onClick={onFinished}>{pending ? 'Moving to drying…' : `${washerName(machine)} has finished`}</Button>}
    >
      {washFinishedAt !== null ? <TimeCard big={timerText.finished} sub={timerText.finishedAt(washerName(machine), clockTime(washFinishedAt))} />
        : timer === null || doneAt === null ? null
        : doneAt <= now ? <TimeCard big={timer} sub={timerSubtitle} tone={inDryer ? 'drying' : 'washing'} expired />
        : <RunningRing label={washerName(machine)} minutes={Math.max(1, Math.ceil((doneAt - now - 1000) / 60_000))} remaining={progress === null ? 1 : 1 - progress}
            chips={[inDryer ? detail.drying?.heatLabel ?? null : detail.doorLocks ? sessionText.doorLocked : null]} note={!inDryer && detail.finishConfidence === 'observed' && detail.cycleMinutes !== null ? timerText.fromEntered(detail.cycleMinutes) : undefined} />}
      <LoadCard label={sessionText.loadSummary} at={loadStageAt(times.stage)}
        pieces={loadPieces(detail.textiles).map((piece) => ({ key: piece.key, kind: null, label: piece.guest ? `${piece.label} (${loadText.guestItem})` : piece.label, count: piece.count }))} />
      {/* With the quick finish as the footer, opening the load is one link under the card. */}
      {onFinished === undefined ? null : openLink({ className: loadSummaryActionClassName, children: runningText.openLoad })}
      {byHand.length === 0 ? null : (
        <Section heading={runningText.byHand}>
          {byHand.map((step) => {
            const due = byHandDue(step)
            return (
              <RecordRow
                key={step.id}
                media={<DesignIcon name="drop" size="1em" strokeWidth={2.2}  />}
                title={step.supplyName ?? chemistryText.aProduct}
                fact={[step.timing === null ? null : chemistryText.when(step.timing), step.status === 'pending' ? due : step.status === 'confirmed' ? runningText.byHandDone : runningText.byHandLeftOut].filter((part) => part !== null).join(' · ')}
              />
            )
          })}
        </Section>
      )}
      {!inDryer && onFinished !== undefined ? <Note>When it finishes, each piece joins the drying queue. Drying follows each garment’s care label.</Note> : null}
      <ErrorNotice error={error} />
      {!online && onFinished !== undefined ? <Note>Reconnect before moving this load to drying.</Note> : null}
      <div className="flex flex-wrap gap-2">
        {onAddTime === undefined ? null : <Button variant="outline" size="sm" className="min-h-11" disabled={pending || !online} onClick={onAddTime}>{addTimeText.link}</Button>}
      </div>
      {recipe.length === 0 && settings.length === 0 ? null : <details>
        <summary className="min-h-11 cursor-pointer rounded-control px-3 py-3 text-[length:var(--step-1)] font-semibold focus-visible:outline-3 focus-visible:outline-ring">{runningText.recipeUsed}</summary>
        <div className="grid gap-3">
          <ChemistryGroups groups={recipe} caption={runningScreenText.lockedForSession} />
          {settings.length === 0 ? null : <StepsCard heading={chemistryText.settings} steps={settings} />}
        </div>
      </details>}
    </Sheet>
  )
}
