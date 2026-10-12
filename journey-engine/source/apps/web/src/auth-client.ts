import { convexClient } from '@convex-dev/better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'

// Same-origin: the web server forwards /api/auth to Better Auth running inside Convex.
export const authClient = createAuthClient({ plugins: [convexClient()] })
