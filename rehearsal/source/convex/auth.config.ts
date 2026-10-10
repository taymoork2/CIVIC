import { getAuthConfigProvider } from '@convex-dev/better-auth/auth-config'
import type { AuthConfig } from 'convex/server'

// Better Auth runs inside this deployment and issues RS256 JWTs from its own site URL.
export default {
  providers: [getAuthConfigProvider()],
} satisfies AuthConfig
