import { renderToStaticMarkup } from '@/test/markup'
import { ConvexError } from 'convex/values'
import { expect, test } from 'vitest'

import { ActionError, actionOutcome, runAction, type ActionFailure } from '@/kit/action-feedback'
import { RetryBanner } from '@/account/auth-pages'

const recorder = () => {
  const log: string[] = []
  let failure: ActionFailure | null = null
  return {
    log,
    failure: () => failure,
    report: {
      pending: (pending: boolean) => log.push(pending ? 'pending' : 'idle'),
      failure: (next: ActionFailure | null) => { failure = next; log.push(next === null ? 'clear' : `failed: ${next.message}`) },
      toast: (message: string) => log.push(`toast: ${message}`),
    },
  }
}

test('success is a brief confirmation; an empty result says nothing', () => {
  expect(actionOutcome('Loads ready.', 'good')).toEqual({ toast: 'Loads ready.' })
  expect(actionOutcome(null, 'good')).toBeNull()
  expect(actionOutcome('', 'bad')).toBeNull()
  expect(actionOutcome('That load changed.', 'bad')).toEqual({ failure: { message: 'That load changed.', retry: null } })
})

test('a failed action stays until the next attempt, and Try again runs the same work once more', async () => {
  const run = recorder()
  let calls = 0
  const work = async () => {
    calls += 1
    if (calls === 1) throw new ConvexError({ code: 'stale', message: 'The plan changed. Try again.' })
    return 'Moved.'
  }
  await runAction(work, run.report)
  // Held, not a timed toast: nothing clears it but another attempt.
  expect(run.failure()).toEqual({ message: 'The plan changed. Try again.', retry: work })
  expect(run.log).toEqual(['clear', 'pending', 'idle', 'failed: The plan changed. Try again.'])

  run.log.length = 0
  await runAction(run.failure()!.retry!, run.report)
  expect(calls).toBe(2)
  expect(run.failure()).toBeNull()
  expect(run.log).toEqual(['clear', 'pending', 'idle', 'toast: Moved.'])
})

test('work that would add a second record when repeated fails without a retry', async () => {
  const run = recorder()
  await runAction(async () => { throw new Error('offline') }, run.report, { retry: false })
  expect(run.failure()?.retry).toBeNull()
  expect(run.failure()?.message).toBe('Something went wrong. Try again in a moment.')
})

test('the held failure is an inline alert with Try again only when the work can repeat', () => {
  const retryable = renderToStaticMarkup(<ActionError failure={{ message: 'The plan changed.', retry: async () => null }} pending={false} onRetry={() => undefined} />)
  expect(retryable).toContain('role="alert"')
  expect(retryable).toContain('The plan changed.')
  expect(retryable).toMatch(/<button[^>]*>Try again<\/button>/)
  const pending = renderToStaticMarkup(<ActionError failure={{ message: 'The plan changed.', retry: async () => null }} pending onRetry={() => undefined} />)
  expect(pending).toMatch(/<button[^>]*disabled=""[^>]*>Try again<\/button>/)
  const final = renderToStaticMarkup(<ActionError failure={{ message: 'Already added.', retry: null }} pending={false} onRetry={() => undefined} />)
  expect(final).not.toContain('<button')
  expect(renderToStaticMarkup(<ActionError failure={null} pending={false} onRetry={() => undefined} />)).toBe('')
})

test('the sign-in retry banner uses the same Try again action shape', () => {
  const markup = renderToStaticMarkup(<RetryBanner message="We couldn’t reach the server." pending onRetry={() => undefined} />)
  expect(markup).toContain('role="alert"')
  expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Try again<\/button>/)
  expect(renderToStaticMarkup(<RetryBanner message="Link expired." />)).not.toContain('<button')
})
