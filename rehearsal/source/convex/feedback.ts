import { v } from 'convex/values'

import { mutation, query } from './_generated/server'
import { authorize } from './access'
import { fail } from './errors'

const kind = v.union(v.literal('bug'), v.literal('confusing'), v.literal('idea'), v.literal('other'))
const status = v.union(v.literal('new'), v.literal('seen'), v.literal('done'))

const maxMessage = 4000
const maxScreen = 200
const maxBuildId = 100
const maxUserAgent = 300

/** An optional note field: blank is absent, and too long is refused rather than cut. */
function optionalText(value: string | undefined, max: number, what: string): string | undefined {
  const trimmed = value?.trim()
  if (trimmed === undefined || trimmed.length === 0) return undefined
  if (trimmed.length > max) fail('invalid', `${what} is too long`)
  return trimmed
}

/** A member sends trial feedback to the household's owners. */
export const send = mutation({
  args: {
    householdId: v.id('households'),
    kind,
    message: v.string(),
    screen: v.optional(v.string()),
    buildId: v.optional(v.string()),
    userAgent: v.optional(v.string()),
  },
  returns: v.id('feedback'),
  handler: async (ctx, args) => {
    const actor = (await authorize(ctx, 'feedback.send', { householdId: args.householdId })).actor
    const message = args.message.trim()
    if (message.length === 0) fail('invalid', 'Write a few words about what happened.')
    if (message.length > maxMessage) fail('invalid', `Keep it under ${maxMessage} characters.`)
    const screen = optionalText(args.screen, maxScreen, 'Screen')
    const buildId = optionalText(args.buildId, maxBuildId, 'Build')
    const userAgent = optionalText(args.userAgent, maxUserAgent, 'Device')
    return ctx.db.insert('feedback', {
      householdId: args.householdId,
      principalKey: actor.key,
      kind: args.kind,
      message,
      ...(screen === undefined ? {} : { screen }),
      ...(buildId === undefined ? {} : { buildId }),
      ...(userAgent === undefined ? {} : { userAgent }),
      createdAt: Date.now(),
      status: 'new',
    })
  },
})

/** What the household has received, newest first. Owners only. */
export const list = query({
  args: { householdId: v.id('households') },
  returns: v.array(v.object({
    feedbackId: v.id('feedback'),
    kind,
    message: v.string(),
    screen: v.union(v.string(), v.null()),
    buildId: v.union(v.string(), v.null()),
    userAgent: v.union(v.string(), v.null()),
    senderName: v.union(v.string(), v.null()),
    createdAt: v.number(),
    status,
  })),
  handler: async (ctx, args) => {
    await authorize(ctx, 'feedback.read', { householdId: args.householdId })
    const rows = await ctx.db
      .query('feedback')
      .withIndex('by_household_created', (q) => q.eq('householdId', args.householdId))
      .order('desc')
      .take(100)
    return Promise.all(rows.map(async (row) => {
      const person = await ctx.db.query('people').withIndex('by_principal_key', (q) => q.eq('principalKey', row.principalKey)).unique()
      return {
        feedbackId: row._id,
        kind: row.kind,
        message: row.message,
        screen: row.screen ?? null,
        buildId: row.buildId ?? null,
        userAgent: row.userAgent ?? null,
        senderName: person?.displayName ?? null,
        createdAt: row.createdAt,
        status: row.status,
      }
    }))
  },
})

/** An owner marks a piece of feedback new, seen or done. */
export const setStatus = mutation({
  args: { feedbackId: v.id('feedback'), status },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.feedbackId)
    if (row === null) fail('not_found', 'Not found')
    await authorize(ctx, 'feedback.manage', { householdId: row.householdId })
    await ctx.db.patch(args.feedbackId, { status: args.status })
    return null
  },
})
