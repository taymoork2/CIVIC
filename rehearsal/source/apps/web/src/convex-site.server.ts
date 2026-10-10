import { convexBetterAuthReactStart } from '@convex-dev/better-auth/react-start'
import { getToken as fetchToken } from '@convex-dev/better-auth/utils'
import { getRequest } from '@tanstack/react-start/server'
import { ConvexHttpClient } from 'convex/browser'
import type { FunctionReference, FunctionReturnType, OptionalRestArgs } from 'convex/server'
import { cache } from 'react'

// Server-only: the web server reaches Convex on its local addresses.
const convexUrl = import.meta.env.VITE_CONVEX_URL as string
export const convexSiteUrl = (import.meta.env.VITE_CONVEX_SITE_URL as string).replace(/\/$/, '')

export const { handler: authHandler } = convexBetterAuthReactStart({ convexUrl, convexSiteUrl })

// The library's SSR token helper forwards cookies but drops the frontend origin. Keep it here as
// the HTTP auth proxy does, so loopback and HTTPS requests select their own cookie attributes.
export const getToken = cache(async () => {
  const request = getRequest()
  const url = new URL(request.url)
  const headers = new Headers(request.headers)
  for (const name of ['content-length', 'transfer-encoding', 'connection']) headers.delete(name)
  headers.set('accept-encoding', 'identity')
  headers.set('x-better-auth-forwarded-host', url.host)
  headers.set('x-better-auth-forwarded-proto', url.protocol.slice(0, -1))
  return (await fetchToken(convexSiteUrl, headers)).token
})

export async function fetchAuthQuery<Query extends FunctionReference<'query'>>(query: Query, ...args: OptionalRestArgs<Query>): Promise<FunctionReturnType<Query>> {
  const client = new ConvexHttpClient(convexUrl, { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) })
  const token = await getToken()
  if (token) client.setAuth(token)
  return client.query(query, ...args)
}
