import { v } from 'convex/values'
import { buildPushPayload } from '@block65/webcrypto-web-push'
import { internal } from './_generated/api'
import { internalAction } from './_generated/server'

declare const process: { readonly env: Readonly<Record<string, string | undefined>> }

/** Payloads contain no garment, wearer, product, or household names on a locked phone. */
export const send = internalAction({
  args: { deliveryId: v.id('pushDeliveries') },
  returns: v.null(),
  handler: async (ctx, { deliveryId }) => {
    if (process.env.WASHCLOSET_RECOVERY_MODE === 'rehearsal') return null
    const publicKey = process.env.WEB_PUSH_PUBLIC_KEY
    const privateKey = process.env.WEB_PUSH_PRIVATE_KEY
    const subject = process.env.WEB_PUSH_SUBJECT
    if (!publicKey || !privateKey || !subject) return null
    const delivery = await ctx.runMutation(internal.pushDelivery.claim, { deliveryId })
    if (delivery === null) return null
    let result: 'sent' | 'failed' | 'expired' = 'sent'
    try {
      const payload = await buildPushPayload({ data: JSON.stringify({ title: 'A Laundered Closet', body: 'A laundry step needs your attention.', tag: delivery.tag, url: delivery.url }), options: { ttl: delivery.ttl } }, { endpoint: delivery.endpoint, keys: delivery.keys, expirationTime: null }, { subject, publicKey, privateKey })
      const response = await fetch(delivery.endpoint, { ...payload, redirect: 'error', signal: AbortSignal.timeout(10_000) })
      if (!response.ok) result = response.status === 404 || response.status === 410 ? 'expired' : 'failed'
    } catch (error) {
      const status = error !== null && typeof error === 'object' && 'statusCode' in error ? error.statusCode : null
      result = status === 404 || status === 410 ? 'expired' : 'failed'
    }
    await ctx.runMutation(internal.pushDelivery.finish, { deliveryId, attempt: delivery.attempt, result })
    return null
  },
})
