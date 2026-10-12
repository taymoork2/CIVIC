import { v } from 'convex/values'

import { internalAction, internalMutation } from './_generated/server'
import { internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { createAuth, testUtilsEnabled } from './auth'
import { fail } from './errors'

declare const process: { readonly env: Readonly<Record<string, string | undefined>> }

/** What Better Auth's testUtils plugin adds to the auth context; the plugin does not type it. */
type BrowserCookie = Record<string, string | number | boolean>
type TestUtilsContext = { test: { getCookies: (args: { userId: string; domain: string }) => Promise<BrowserCookie[]> } }

/** Browser cookies in the shape Playwright's `addCookies` takes (name, value, domain, path, flags). */
const browserCookie = v.record(v.string(), v.union(v.string(), v.number(), v.boolean()))

/**
 * Creates a user with Better Auth's testUtils and returns browser cookies for a signed-in
 * session. Internal (run only with deployment admin access, e.g. `npx convex run`) and
 * refused unless WASHCLOSET_TEST_UTILS is enabled on a development deployment.
 */
export const createSignedInUser = internalAction({
  args: { email: v.string(), name: v.string(), domain: v.string(), password: v.optional(v.string()) },
  returns: v.object({ userId: v.string(), cookies: v.array(browserCookie) }),
  handler: async (ctx, args) => {
    if (!testUtilsEnabled()) fail('disabled', 'Test utilities are disabled')
    if (args.password !== undefined && args.password.length < 12) fail('invalid', 'Test password must be at least 12 characters')
    const auth = createAuth(ctx)
    // Convex assigns document ids, so the user is created through the server API rather than
    // testUtils.createUser (which pre-assigns one); testUtils then issues the session cookies.
    const password = args.password ?? `${crypto.randomUUID()}-${crypto.randomUUID()}`
    const { user } = await auth.api.signUpEmail({ body: { email: args.email, name: args.name, password } })
    const { test } = (await auth.$context) as unknown as TestUtilsContext
    const cookies = await test.getCookies({ userId: user.id, domain: args.domain })
    return { userId: user.id, cookies }
  },
})

/** Admin-only restore verification uses an existing restored account, without creating inventory. */
export const recoveredSignedInUser = internalAction({
  args: { userId: v.string(), domain: v.string() },
  returns: v.object({ cookies: v.array(browserCookie) }),
  handler: async (ctx, args) => {
    if (process.env.WASHCLOSET_RECOVERY_MODE !== 'rehearsal' || !testUtilsEnabled()) fail('disabled', 'Restore verification is disabled')
    const { test } = (await createAuth(ctx).$context) as unknown as TestUtilsContext
    return { cookies: await test.getCookies({ userId: args.userId, domain: args.domain }) }
  },
})

/** Synthetic file/reminder only inside the disposable restore target; never seeds owner data. */
export const recoveryFixture = internalAction({
  args: { textileId: v.id('textiles'), sessionId: v.id('sessions') },
  returns: v.object({ photoId: v.id('carePhotos'), reminderId: v.id('reminders') }),
  handler: async (ctx, args): Promise<{ photoId: Id<'carePhotos'>; reminderId: Id<'reminders'> }> => {
    if (process.env.WASHCLOSET_RECOVERY_MODE !== 'rehearsal') fail('disabled', 'Restore fixtures are disabled')
    const bytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOqkAAAAASUVORK5CYII='), (value) => value.charCodeAt(0))
    const storageId = await ctx.storage.store(new Blob([bytes], { type: 'image/png' }))
    return ctx.runMutation(internal.testing.linkRecoveryFixture, { ...args, storageId, size: bytes.length })
  },
})

export const linkRecoveryFixture = internalMutation({
  args: { textileId: v.id('textiles'), sessionId: v.id('sessions'), storageId: v.id('_storage'), size: v.number() },
  returns: v.object({ photoId: v.id('carePhotos'), reminderId: v.id('reminders') }),
  handler: async (ctx, args) => {
    if (process.env.WASHCLOSET_RECOVERY_MODE !== 'rehearsal') fail('disabled', 'Restore fixtures are disabled')
    const textile = await ctx.db.get(args.textileId)
    const session = await ctx.db.get(args.sessionId)
    const timeline = await ctx.db.query('timelines').withIndex('by_session', (q) => q.eq('sessionId', args.sessionId)).unique()
    const action = timeline?.actions.find((entry) => entry.status === 'pending')
    if (textile === null || session === null || session.status !== 'running' || session.householdId !== textile.householdId || action === undefined) fail('invalid', 'A recovered active load is required for the drill')
    const photoId = await ctx.db.insert('carePhotos', { householdId: textile.householdId, textileId: textile._id,
      storageId: args.storageId, contentType: 'image/png', size: args.size, uploadedBy: session.startedBy!, createdAt: Date.now() })
    const reminderId = await ctx.db.insert('reminders', { householdId: session.householdId, sessionId: session._id,
      actionId: action.id, status: 'scheduled', dueAt: Date.now() + 300_000 })
    const scheduledFunctionId = await ctx.scheduler.runAfter(300_000, internal.reminders.deliver, { reminderId })
    await ctx.db.patch(reminderId, { scheduledFunctionId })
    return { photoId, reminderId }
  },
})
