import type { GenericCtx } from '@convex-dev/better-auth'
import { v } from 'convex/values'

import { query } from './_generated/server'
import type { DataModel } from './_generated/dataModel'
import { authComponent } from './auth'
import { fail } from './errors'

declare const process: { readonly env: Readonly<Record<string, string | undefined>> }

/** Deployment relocation preserves opaque account keys using its captured original issuer. */
export function principalIssuer(verifiedIssuer: string): string {
  return verifiedIssuer === process.env.CONVEX_SITE_URL
    ? process.env.WASHCLOSET_PRINCIPAL_ISSUER ?? verifiedIssuer : verifiedIssuer
}

declare const principalKeyBrand: unique symbol

/** An opaque internal identifier; the issuer and subject it was derived from never leave `principalKeyFor`. */
export type PrincipalKey = string & { readonly [principalKeyBrand]: 'PrincipalKey' }

export function principalKey(value: string): PrincipalKey {
  if (value.length === 0) throw new Error('PrincipalKey must not be empty')
  return value as PrincipalKey
}

const authenticatedPrincipalBrand = Symbol('AuthenticatedPrincipal')

export interface AuthenticatedPrincipal {
  readonly key: PrincipalKey
  readonly [authenticatedPrincipalBrand]: true
}

/**
 * The stable key for a verified (issuer, subject) pair: `principal:v1:` plus the hex SHA-256 of
 * the JSON array `[issuer, subject]`. Stored principal keys depend on this exact algorithm.
 */
export async function principalKeyFor(issuer: string, subject: string): Promise<PrincipalKey> {
  if (issuer.length === 0 || subject.length === 0) {
    fail('unauthenticated', 'Verified identity must include issuer and subject')
  }

  const input = new TextEncoder().encode(JSON.stringify([issuer, subject]))
  const digest = await crypto.subtle.digest('SHA-256', input)
  const encoded = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  return principalKey(`principal:v1:${encoded}`)
}

// Cache only within one invocation; bulk checks must not repeat the same component reads.
const principals = new WeakMap<GenericCtx<DataModel>, Promise<AuthenticatedPrincipal>>()

export function principalFromAuth(ctx: GenericCtx<DataModel>): Promise<AuthenticatedPrincipal> {
  const cached = principals.get(ctx)
  if (cached !== undefined) return cached
  const principal = (async () => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null || typeof identity.sessionId !== 'string' || await authComponent.safeGetAuthUser(ctx) === undefined) fail('unauthenticated', 'Unauthenticated')
    return Object.freeze({
      key: await principalKeyFor(principalIssuer(identity.issuer), identity.subject),
      [authenticatedPrincipalBrand]: true as const,
    })
  })()
  principals.set(ctx, principal)
  return principal
}

export function requirePrincipal(actor: AuthenticatedPrincipal, owner: PrincipalKey): void {
  if (actor?.[authenticatedPrincipalBrand] !== true) {
    throw new Error('Authorization requires an authenticated internal principal')
  }
  if (actor.key !== owner) fail('forbidden', 'Forbidden')
}

export const current = query({
  args: {},
  returns: v.string(),
  handler: async (ctx): Promise<PrincipalKey> => (await principalFromAuth(ctx)).key,
})
