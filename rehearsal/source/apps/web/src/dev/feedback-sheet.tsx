import { useRouterState } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { useId, useState, type FormEvent, type ReactNode } from 'react'

import type { CurrentHousehold } from '@/account/account'
import { TextField, pageDetailClassName } from '@/account/account-page'
import { api } from '@/api'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { feedbackText, type FeedbackKind, type FeedbackStatus } from '@/copy-feedback'
import { SwitchRow } from '@/laundry/laundry-ui'
import { RecordList, RecordRow, type MarkTone } from '@/kit/record-row'
import { Sheet } from '@/kit/sheet'
import { ErrorNotice, Loading, relativeTime, useConvexCall } from '@/kit/ui'
import { DesignIcon } from '@/kit/design-icons'

/** Set by the build (vite define); absent in tests and tooling. */
declare const __WASHCLOSET_BUILD__: string | undefined

const kinds: readonly FeedbackKind[] = ['bug', 'confusing', 'idea', 'other']
const kindIcon: Record<FeedbackKind, ReactNode> = {
  bug: <DesignIcon name="bug" size="1em"  />,
  confusing: <DesignIcon name="help" size="1em"  />,
  idea: <DesignIcon name="lightbulb" size="1em"  />,
  other: <DesignIcon name="chat" size="1em"  />,
}
const statusTone: Record<FeedbackStatus, MarkTone> = { new: 'waiting', seen: 'washing', done: 'done' }
const nextStatus: Record<FeedbackStatus, FeedbackStatus> = { new: 'seen', seen: 'done', done: 'new' }

function buildId(): string | undefined {
  return typeof __WASHCLOSET_BUILD__ === 'string' ? __WASHCLOSET_BUILD__.slice(0, 100) : undefined
}

/**
 * The Settings section for the trial: anyone sends feedback; owners also read what came in.
 * Rendered only for a signed-in household member, so both queries and mutations are allowed.
 */
export function FeedbackSettings({ household }: { household: CurrentHousehold }) {
  const [sheet, setSheet] = useState<'send' | 'list' | null>(null)
  const isOwner = household.role === 'owner'
  const received = useQuery(api.feedback.list, isOwner ? { householdId: household.householdId } : 'skip')
  const fresh = received?.filter((row) => row.status === 'new').length ?? 0
  const close = () => setSheet(null)
  return <>
    <RecordList heading={feedbackText.section}>
      <RecordRow media={<DesignIcon name="chat" size="1em"  />} title={feedbackText.send} fact={feedbackText.sendHint} onOpen={() => setSheet('send')} />
      {isOwner ? <RecordRow media={<DesignIcon name="bug" size="1em"  />} title={feedbackText.received} fact={received === undefined ? undefined : feedbackText.receivedFact(fresh)} onOpen={() => setSheet('list')} /> : null}
    </RecordList>
    {sheet === 'send' ? <FeedbackSheet householdId={household.householdId} onClose={close} /> : null}
    {sheet === 'list' ? <FeedbackListSheet householdId={household.householdId} onClose={close} /> : null}
  </>
}

function FeedbackSheet({ householdId, onClose }: { householdId: CurrentHousehold['householdId']; onClose: () => void }) {
  const formId = useId()
  const kindLabelId = useId()
  const path = useRouterState({ select: (state) => state.location.pathname })
  const [kind, setKind] = useState<FeedbackKind>('bug')
  const [message, setMessage] = useState('')
  const [includeScreen, setIncludeScreen] = useState(true)
  const [problem, setProblem] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const send = useConvexCall(api.feedback.send)
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (message.trim().length === 0) return setProblem(feedbackText.messageMissing)
    setProblem(null)
    const build = buildId()
    const id = await send.run({
      householdId,
      kind,
      message: message.trim(),
      ...(includeScreen ? { screen: path.slice(0, 200), ...(build === undefined ? {} : { buildId: build }), userAgent: navigator.userAgent.slice(0, 300) } : {}),
    })
    if (id !== undefined) setSent(true)
  }
  return <Sheet title={feedbackText.send} dirty={!sent && message.trim() !== ''} onClose={onClose}
    footer={sent
      ? <Button type="button" onClick={onClose}>{feedbackText.done}</Button>
      : <Button type="submit" form={formId} disabled={send.pending}>{send.pending ? feedbackText.sending : feedbackText.send}</Button>}>
    {sent
      ? <p role="status" className="m-0 text-[length:var(--step-1)] font-semibold text-ready-ink">{feedbackText.sent}</p>
      : <form id={formId} className="grid gap-4" onSubmit={(event) => void submit(event)} noValidate>
        <div className="grid gap-2">
          <h3 id={kindLabelId} className="m-0 text-base font-semibold">{feedbackText.kindLabel}</h3>
          <RadioGroup variant="segment" value={kind} onValueChange={(value) => setKind(value as FeedbackKind)} aria-labelledby={kindLabelId} className="w-full">
            {kinds.map((value) => <RadioGroupItem variant="segment" key={value} value={value} className="flex-1">{feedbackText.kinds[value]}</RadioGroupItem>)}
          </RadioGroup>
        </div>
        <TextField label={feedbackText.message} hint={feedbackText.messageHint} error={problem ?? undefined}>
          {(field) => <Textarea id={field.id} rows={6} maxLength={4000} value={message} aria-invalid={field.invalid ? true : undefined}
            aria-describedby={field.describedBy} onChange={(event) => { setMessage(event.target.value); setProblem(null) }} />}
        </TextField>
        <ul className="m-0 grid list-none gap-0 p-0 rounded-control bg-background">
          <SwitchRow role="checkbox" media={<DesignIcon name="bug" size="1em"  />} title={feedbackText.includeScreen} fact={feedbackText.includeScreenFact(path)} on={includeScreen} onToggle={() => setIncludeScreen(!includeScreen)} />
        </ul>
        <ErrorNotice error={send.error} />
      </form>}
  </Sheet>
}

function FeedbackListSheet({ householdId, onClose }: { householdId: CurrentHousehold['householdId']; onClose: () => void }) {
  const rows = useQuery(api.feedback.list, { householdId })
  const setStatus = useConvexCall(api.feedback.setStatus)
  const now = Date.now()
  return <Sheet title={feedbackText.listTitle} onClose={onClose}>
    <div className="grid gap-4">
      {rows === undefined ? <Loading what={feedbackText.listLoading} /> : rows.length === 0
        ? <p className={pageDetailClassName}>{feedbackText.listEmpty}</p>
        : <RecordList>
          {rows.map((row) => {
            const line = row.message.split('\n').find((text) => text.trim() !== '')?.trim() ?? row.message
            return <RecordRow key={row.feedbackId} media={kindIcon[row.kind]} title={line}
              fact={[feedbackText.kinds[row.kind], row.senderName ?? feedbackText.unknownSender, relativeTime(row.createdAt, now), row.screen ?? feedbackText.unknownScreen].join(' · ')}
              mark={{ tone: statusTone[row.status], text: feedbackText.statuses[row.status] }}
              label={feedbackText.rowLabel(feedbackText.kinds[row.kind], line, feedbackText.statuses[row.status])}
              onOpen={() => void setStatus.run({ feedbackId: row.feedbackId, status: nextStatus[row.status] })} />
          })}
        </RecordList>}
      <ErrorNotice error={setStatus.error} />
    </div>
  </Sheet>
}
