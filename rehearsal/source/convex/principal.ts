import type { Auth } from 'convex/server'
import { v } from 'convex/values'

import { query } from './_generated/server'
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

export async function principalFromAuth(auth: Auth): Promise<AuthenticatedPrincipal> {
  const identity = await auth.getUserIdentity()
  if (identity === null) fail('unauthenticated', 'Unauthenticated')

  return Object.freeze({
    key: await principalKeyFor(principalIssuer(identity.issuer), identity.subject),
    [authenticatedPrincipalBrand]: true as const,
  })
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
  handler: async (ctx): Promise<PrincipalKey> => (await principalFromAuth(ctx.auth)).key,
})
