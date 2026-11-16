import { decide, initial } from '@civic/core'
import * as Option from 'effect/Option'
import { machineFromJSON } from 'xstate'
import type { WorkRequest, RequestStatus } from '../../graph/src/index.ts'

export interface RequestEvent {
  type: 'CLAIM' | 'RELEASE' | 'RELEASE_REOPENED' | 'REPORT_FIX' | 'RESOLVE' | 'REOPEN' | 'AUTO_PASS' | 'AUTO_FAIL'
  by: string
  now: number
  note?: string
  auto?: boolean
}

const resolve = { target: 'resolved', guard: { type: 'canResolve' } }
const claim = { target: 'claimed', guard: { type: 'canClaim' } }

// Beta.3's JSON API retains static guarded transitions without code expressions.
export const requestMachine = machineFromJSON({
  id: 'request', initial: 'open', context: {},
  schemas: { events: Object.fromEntries(['CLAIM', 'RELEASE', 'RELEASE_REOPENED', 'REPORT_FIX', 'RESOLVE', 'REOPEN', 'AUTO_PASS', 'AUTO_FAIL'].map((type) => [type, {}])) },
  states: {
    open: { on: { CLAIM: claim, RESOLVE: resolve } },
    reopened: { on: { CLAIM: claim, RESOLVE: resolve } },
    claimed: { on: {
      CLAIM: claim,
      RELEASE: { target: 'open', guard: { type: 'releaseOpen' } },
      RELEASE_REOPENED: { target: 'reopened', guard: { type: 'releaseReopened' } },
      REPORT_FIX: { target: 'fix-ready', guard: { type: 'holder' } },
      RESOLVE: resolve,
    } },
    'fix-ready': { on: {
      RESOLVE: resolve, REOPEN: { target: 'reopened' },
      AUTO_PASS: { target: 'resolved', guard: { type: 'auto' } },
      AUTO_FAIL: { target: 'reopened', guard: { type: 'auto' } },
    } },
    resolved: { on: { REOPEN: { target: 'reopened' } } },
  },
}, { guards: {
  canClaim: ({ context, event }) => context.status !== 'claimed' || !context.claim || !(Date.parse(context.claim.expires) > event.now) || context.claim.by === event.by,
  holder: ({ context, event }) => context.claim?.by === event.by,
  releaseOpen: ({ context, event }) => context.claim?.by === event.by && !context.history.some((entry: { status: string }) => entry.status === 'reopened'),
  releaseReopened: ({ context, event }) => context.claim?.by === event.by && context.history.some((entry: { status: string }) => entry.status === 'reopened'),
  canResolve: ({ context, event }) => context.status === 'fix-ready' || Boolean(event.note),
  auto: ({ event }) => event.auto === true,
} })

export function moveRequest(request: WorkRequest, event: RequestEvent, message: string): void {
  const snapshot = requestMachine.resolveState({ value: request.status, context: request })
  const decision = decide(requestMachine, snapshot, event)
  if (Option.isNone(decision)) throw new Error(message)
  request.status = decision.value.snapshot.value as RequestStatus
}

export const initialRequestStatus = initial(requestMachine).value as RequestStatus