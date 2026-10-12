import { sha256 } from '@washcloset/planner'
import { v } from 'convex/values'
import { internal } from './_generated/api'
import type { Doc, Id } from './_generated/dataModel'
import { internalMutation, type MutationCtx } from './_generated/server'
import { fail } from './errors'

type Kind = Doc<'intakeSaves'>['kind']
type Result = Doc<'intakeSaves'>['result']

export async function eraseIntakeSaves(ctx: MutationCtx, principalKey: string): Promise<void> {
  const rows = await ctx.db.query('intakeSaves').withIndex('by_principal', q => q.eq('principalKey', principalKey)).take(128)
  for (const row of rows) await ctx.db.delete(row._id)
  if (rows.length === 128) await ctx.scheduler.runAfter(0, internal.intakeSaves.eraseBatch, { principalKey })
}

export const eraseBatch = internalMutation({ args: { principalKey: v.string() }, returns: v.null(), handler: async (ctx, args) => { await eraseIntakeSaves(ctx, args.principalKey); return null } })

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object') return `{${Object.entries(value).filter(([, entry]) => entry !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([name, entry]) => `${JSON.stringify(name)}:${canonical(entry)}`).join(',')}}`
  return JSON.stringify(value)
}

/** Authorization happens before this indexed read; the receipt and records commit together. */
export async function intakeSave(ctx: MutationCtx, householdId: Id<'households'>, principalKey: string, kind: Kind, key: string | undefined, payload: unknown) {
  if (key === undefined) return null
  if (!/^[A-Za-z0-9:_-]{12,128}$/.test(key)) fail('invalid', 'Invalid intake save identity')
  const payloadHash = sha256(canonical(payload))
  const previous = await ctx.db.query('intakeSaves').withIndex('by_request', q => q.eq('householdId', householdId).eq('principalKey', principalKey).eq('kind', kind).eq('key', key)).unique()
  if (previous !== null && previous.payloadHash !== payloadHash) fail('conflict', 'This draft was already saved with different answers. Close this form and check the saved record before adding again.')
  return { previous, record: async (result: Result) => {
    await ctx.db.insert('intakeSaves', { householdId, principalKey, kind, key, payloadHash, result })
  } }
}
