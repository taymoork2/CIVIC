import { httpRouter } from 'convex/server'

import { internal } from './_generated/api'
import { httpAction } from './_generated/server'
import { createAuth } from './auth'
import { verifyViewToken } from './photos'

declare const process: { readonly env: Readonly<Record<string, string | undefined>> }

const http = httpRouter()

// Better Auth endpoints under /api/auth; the web app proxies its same-origin /api/auth here.
// Select the exact configured frontend origin before Better Auth creates its cookie names/attributes.
// A global HTTPS base URL otherwise makes loopback HTTP previews issue unusable Secure cookies.
const handleAuth = httpAction(async (ctx, request) => {
  try {
    return await createAuth(ctx, request).handler(request)
  } catch (error) {
    if (error instanceof Error && error.message === 'Untrusted authentication origin') {
      return new Response('Untrusted authentication origin', { status: 403 })
    }
    throw error
  }
})
for (const method of ['GET', 'POST'] as const) http.route({ pathPrefix: '/api/auth/', method, handler: handleAuth })
http.route({
  path: '/.well-known/openid-configuration',
  method: 'GET',
  handler: httpAction(async () => Response.redirect(`${process.env.CONVEX_SITE_URL}/api/auth/convex/.well-known/openid-configuration`)),
})

const denied = () => new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } })

/** Serves a care-label photo only for an unexpired signed link whose viewer is still a household member. */
http.route({
  path: '/care-photo',
  method: 'GET',
  handler: httpAction(async (ctx, request) => {
    const token = new URL(request.url).searchParams.get('token')
    const claim = token === null ? null : await verifyViewToken(token, Date.now())
    if (claim === null) return denied()
    const photo = await ctx.runQuery(internal.photos.deliverable, claim)
    if (photo === null) return denied()
    const blob = await ctx.storage.get(photo.storageId)
    if (blob === null) return denied()
    return new Response(blob, {
      headers: {
        'content-type': photo.contentType,
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer',
      },
    })
  }),
})

export default http
