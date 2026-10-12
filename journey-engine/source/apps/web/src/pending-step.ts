import type { FunctionArgs } from 'convex/server'
import { api } from './api'
import { privateAccountKey } from './private-state'

type StepArgs = FunctionArgs<typeof api.actions.recordAction>
export type PendingStep = { householdId: string; title: string; args: StepArgs & { receiptId: string } }
const key = 'washcloset:private:pending-steps'
const limit = 30

function read(accountId: string | null): PendingStep[] {
  const scopedKey = privateAccountKey('pending-steps', accountId)
  if (scopedKey === null) return []
  try {
    const values: unknown = JSON.parse(window.localStorage.getItem(scopedKey) ?? '[]')
    if (!Array.isArray(values)) return []
    return values.filter((entry): entry is PendingStep => typeof entry?.householdId === 'string' && typeof entry?.title === 'string'
      && typeof entry?.args?.sessionId === 'string' && typeof entry?.args?.actionId === 'string'
      && /^[a-zA-Z0-9-]{16,100}$/.test(entry?.args?.receiptId ?? '')
      && ['confirmed', 'skipped', 'missed'].includes(entry?.args?.status)
      && Number.isFinite(entry?.args?.at)).slice(0, limit)
  } catch { return [] }
}

/** Store only the tap's allowed fields, before handing it to the network. No auth or photos. */
export function savePendingStep(accountId: string | null, householdId: string, title: string, args: StepArgs): PendingStep | null {
  const scopedKey = privateAccountKey('pending-steps', accountId)
  if (scopedKey === null) return null
  const entry: PendingStep = { householdId, title: title.slice(0, 200), args: {
    sessionId: args.sessionId, actionId: args.actionId, status: args.status,
    receiptId: args.receiptId ?? crypto.randomUUID(), at: args.at ?? Date.now(),
    ...(args.minutes === undefined ? {} : { minutes: args.minutes }),
    ...(args.expectedTimelineRevision === undefined ? {} : { expectedTimelineRevision: args.expectedTimelineRevision }),
    ...(args.usage === undefined ? {} : { usage: { supplyId: args.usage.supplyId, amount: args.usage.amount, unit: args.usage.unit,
      placement: args.usage.placement, ...(args.usage.mark === undefined ? {} : { mark: args.usage.mark }), ...(args.usage.fractionOfMark === undefined ? {} : { fractionOfMark: args.usage.fractionOfMark }),
      ...(args.usage.target === undefined ? {} : { target: args.usage.target }), ...(args.usage.approximate === undefined ? {} : { approximate: args.usage.approximate }) } }),
  } }
  try {
    const entries = read(accountId).filter((value) => value.args.receiptId !== entry.args.receiptId)
    // Never evict a tap that has not been acknowledged.
    if (entries.length >= limit) return null
    window.localStorage.setItem(scopedKey, JSON.stringify([...entries, entry]))
    return entry
  } catch { return null }
}

export function pendingSteps(accountId: string | null, householdId: string, sessionId: string): PendingStep[] {
  return read(accountId).filter((entry) => entry.householdId === householdId && entry.args.sessionId === sessionId)
}

export function hasPendingSteps(): boolean {
  try {
    const legacy = window.localStorage.getItem(key)
    if (legacy !== null && legacy !== '[]') return true
    // An update must not erase an older or another tab's unacknowledged tap.
    return Object.keys(window.localStorage).some(name => (name === key || name.startsWith('washcloset:private:signed-in:') && name.endsWith(',"pending-steps"]')) && window.localStorage.getItem(name) !== '[]')
  } catch { return true }
}

export function clearPendingStep(accountId: string | null, receiptId: string): void {
  const scopedKey = privateAccountKey('pending-steps', accountId)
  if (scopedKey === null) return
  try {
    const remaining = read(accountId).filter((entry) => entry.args.receiptId !== receiptId)
    if (remaining.length === 0) window.localStorage.removeItem(scopedKey)
    else window.localStorage.setItem(scopedKey, JSON.stringify(remaining))
  } catch { /* Keep the receipt visible for a later recovery attempt. */ }
}
