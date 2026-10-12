import { useState } from 'react'
import { toast } from 'sonner'
import { uiText } from '@/copy'
import { Banner } from '@/kit/record-row'
import { errorMessage } from '@/kit/ui'

/** Work an action does; what it resolves to is the confirmation to show, if any. */
export type ActionWork = () => Promise<string | null | void>

/** A failed action: its words, and the same work again when repeating it cannot duplicate anything. */
export type ActionFailure = { readonly message: string; readonly retry: ActionWork | null }

/**
 * Where an action's outcome goes. A success is a brief Sonner confirmation; a failure is held as
 * the inline notice until the next attempt or edit, so it never fades before it is read.
 */
export function actionOutcome(message: string | null | void, tone: 'good' | 'bad', retry: ActionWork | null = null): { toast: string } | { failure: ActionFailure } | null {
  if (message === null || message === undefined || message.length === 0) return null
  return tone === 'good' ? { toast: message } : { failure: { message, retry } }
}

/** What running an action reports, in order: the cleared failure and pending, then one outcome. */
export type ActionReport = {
  readonly pending: (pending: boolean) => void
  readonly failure: (failure: ActionFailure | null) => void
  readonly toast: (message: string) => void
}

/**
 * Runs one action: the last failure clears as it starts, a success confirms, and a thrown error is
 * held with that same work as its Try again. Work that would duplicate a record when repeated
 * (adding something) passes `{ retry: false }`, so its failure offers no retry.
 */
export async function runAction(work: ActionWork, report: ActionReport, options: { retry?: boolean } = {}): Promise<void> {
  report.failure(null)
  report.pending(true)
  let outcome: ReturnType<typeof actionOutcome>
  try {
    outcome = actionOutcome(await work(), 'good')
  } catch (caught) {
    outcome = actionOutcome(errorMessage(caught), 'bad', options.retry === false ? null : work)
  } finally {
    report.pending(false)
  }
  deliver(outcome, report)
}

function deliver(outcome: ReturnType<typeof actionOutcome>, report: ActionReport): void {
  if (outcome === null) return
  if ('toast' in outcome) report.toast(outcome.toast)
  else report.failure(outcome.failure)
}

/** The page-level action convention (Laundry, Closet), as state: `run`, `say` and the held `failure`. */
export function useActionFeedback() {
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<ActionFailure | null>(null)
  const report: ActionReport = { pending: setPending, failure: setFailure, toast: (message) => toast.success(message) }
  const say = (message: string | null, tone: 'good' | 'bad' = 'good') => deliver(actionOutcome(message, tone), report)
  const run = (work: ActionWork, options: { retry?: boolean } = {}) => runAction(work, report, options)
  return { pending, failure, say, run, clear: () => setFailure(null) }
}

/** The held failure, inline beside the section that acted, with Try again when the work can repeat. */
export function ActionError({ failure, pending, onRetry }: { failure: ActionFailure | null; pending: boolean; onRetry: (work: ActionWork) => void }) {
  if (failure === null) return null
  const retry = failure.retry
  return <Banner tone="conflict" role="alert" actions={retry === null ? undefined : [{ label: uiText.tryAgain, disabled: pending, onClick: () => onRetry(retry) }]}>{failure.message}</Banner>
}
