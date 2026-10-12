import { createFileRoute } from '@tanstack/react-router'

import { convexSiteUrl } from '../convex-site.server'

/** Same-origin proxy for short-lived care-photo links; Convex verifies the token and membership. */
export const Route = createFileRoute('/care-photo')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const token = new URL(request.url).searchParams.get('token') ?? ''
        const upstream = await fetch(`${convexSiteUrl}/care-photo?token=${encodeURIComponent(token)}`)
        return new Response(upstream.body, {
          status: upstream.status,
          headers: {
            'content-type': upstream.headers.get('content-type') ?? 'application/octet-stream',
            'cache-control': 'private, no-store',
            'x-content-type-options': 'nosniff',
            'referrer-policy': 'no-referrer',
          },
        })
      },
    },
  },
})
