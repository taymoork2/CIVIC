import { createFileRoute } from '@tanstack/react-router'

import { authHandler } from '../../../convex-site.server'

const handleAuth = ({ request }: { request: Request }) => authHandler(request)

export const authHandlers = {
  GET: handleAuth,
  POST: handleAuth,
}

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: authHandlers,
  },
})
