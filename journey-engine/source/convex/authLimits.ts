import { v } from 'convex/values'
import { components } from './_generated/api'
import { internalMutation, internalQuery, type MutationCtx } from './_generated/server'

const value = { key: v.string(), count: v.number(), lastRequest: v.number() }
const where = (key: string) => [{ field: 'key' as const, value: key }]

export const get = internalQuery({
  args: { key: v.string() }, returns: v.union(v.null(), v.object(value)),
  handler: async (ctx, { key }) => {
    const row = await ctx.runQuery(components.betterAuth.adapter.findOne, { model: 'rateLimit', where: where(key) })
    return row === null ? null : { key: row.key, count: row.count, lastRequest: row.lastRequest }
  },
})

async function write(ctx: MutationCtx, next: { key: string; count: number; lastRequest: number }, exists: boolean) {
  if (exists) await ctx.runMutation(components.betterAuth.adapter.updateOne, { input: { model: 'rateLimit', where: where(next.key), update: { count: next.count, lastRequest: next.lastRequest } } })
  else await ctx.runMutation(components.betterAuth.adapter.create, { input: { model: 'rateLimit', data: next } })
}

export const set = internalMutation({
  args: value, returns: v.null(),
  handler: async (ctx, next) => {
    await write(ctx, next, await ctx.runQuery(components.betterAuth.adapter.findOne, { model: 'rateLimit', where: where(next.key) }) !== null)
    return null
  },
})

/** The installed adapter lacks atomic incrementOne; nested component calls share this transaction. */
export const consume = internalMutation({
  args: { key: v.string(), window: v.number(), max: v.number() },
  returns: v.object({ allowed: v.boolean(), retryAfter: v.union(v.number(), v.null()) }),
  handler: async (ctx, { key, window, max }) => {
    const row = await ctx.runQuery(components.betterAuth.adapter.findOne, { model: 'rateLimit', where: where(key) })
    const now = Date.now(), current = row !== null && now - row.lastRequest <= window * 1000
    if (current && row.count >= max) return { allowed: false, retryAfter: Math.max(1, Math.ceil((row.lastRequest + window * 1000 - now) / 1000)) }
    await write(ctx, { key, count: current ? row.count + 1 : 1, lastRequest: now }, row !== null)
    return { allowed: true, retryAfter: null }
  },
})
