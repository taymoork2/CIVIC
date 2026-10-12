import { createClient, type AuthFunctions, type GenericCtx } from '@convex-dev/better-auth'
import { convex } from '@convex-dev/better-auth/plugins'
import { betterAuth, type BetterAuthOptions } from 'better-auth'
import { testUtils } from 'better-auth/plugins'

import { components, internal } from './_generated/api'
import type { DataModel } from './_generated/dataModel'
import authConfig from './auth.config'
import { authRequestOrigin } from './authOrigin'
import { removePrincipalData } from './identity'
import { principalIssuer, principalKeyFor } from './principal'

declare const process: { readonly env: Readonly<Record<string, string | undefined>> }

const authFunctions: AuthFunctions = internal.auth

/** Development/test only: exposes Better Auth's testUtils so journeys can create signed-in users. */
export function testUtilsEnabled(): boolean {
  return process.env.WASHCLOSET_TEST_UTILS === 'enabled'
}

export const authComponent = createClient<DataModel>(components.betterAuth, {
  authFunctions,
  triggers: {
    user: {
      // Deleting a Better Auth user removes that person's household access in the same transaction.
      onDelete: async (ctx, authUser) => {
        const principalKey = await principalKeyFor(principalIssuer(`${process.env.CONVEX_SITE_URL}`), authUser._id)
        await removePrincipalData(ctx, principalKey)
      },
    },
  },
})

export const { onCreate, onUpdate, onDelete } = authComponent.triggersApi()

export function authOptions(ctx: GenericCtx<DataModel>, request?: Request): BetterAuthOptions {
  const trustedOrigins = (process.env.WASHCLOSET_TRUSTED_ORIGINS ?? '').split(',').map((origin) => origin.trim()).filter(Boolean)
  return {
    appName: 'WashCloset',
    baseURL: request ? authRequestOrigin(request, process.env.SITE_URL ?? '', trustedOrigins) : process.env.SITE_URL,
    trustedOrigins,
    database: authComponent.adapter(ctx),
    emailAndPassword: { enabled: true, requireEmailVerification: false },
    // No email is sent in this trial: an unverified address (every one here) changes straight away.
    user: { deleteUser: { enabled: true }, changeEmail: { enabled: true, updateEmailWithoutVerification: true } },
    // Stored in the component's rateLimit table: each Convex request is a fresh instance, so memory limits would not hold.
    // Convex fetches public signing keys while validating requests; throttling that GET rejects valid sessions.
    // On by default. Only the worktree's loopback dev script turns it off: every local caller shares one
    // 127.0.0.1 bucket there, so seeding and testing lock each other out.
    rateLimit: { enabled: process.env.WASHCLOSET_AUTH_RATE_LIMIT !== 'disabled', storage: 'database', customRules: { '/convex/jwks': false } },
    plugins: [convex({ authConfig }), ...(testUtilsEnabled() ? [testUtils()] : [])],
  }
}

export const createAuth = (ctx: GenericCtx<DataModel>, request?: Request) => betterAuth(authOptions(ctx, request))
