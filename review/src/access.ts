import { git } from './git.ts'
import type { Checkout } from './git.ts'
import type { Identity } from './identity.ts'

/**
 * Who may do what with the shared records (roadmap step 5). `read` sees annotations and
 * requests; `write` annotates, asks, claims, comments, reports fixes and adds checks;
 * `approve` accepts a check and escalates a lane; `resolve` resolves and reopens requests.
 * The graph's own rules still apply on top: an agent never resolves or accepts its own check.
 */
export const SCOPES = ['read', 'write', 'approve', 'resolve'] as const
export type Scope = (typeof SCOPES)[number]

/**
 * `civic.access.json` at the repository root: scopes per person handle, and the scopes of
 * everyone the file doesn't name. An agent has the scopes of the person it acts for.
 */
export interface AccessPolicy {
  people: Record<string, Scope[]>
  others: Scope[]
  /**
   * Each person's Ed25519 public keys, `ed25519:<base64>`. Once any are listed, every shared
   * sync must be signed by a key of the person it names (`civic keygen` makes one).
   */
  keys: Record<string, string[]>
}

export const ACCESS_FILE = 'civic.access.json'

/**
 * The policy on the default branch, so a change to who may resolve is itself a reviewed,
 * merged change, and an edit in a worktree (an agent's, say) grants nothing. No file means
 * one team that trusts itself: everyone has every scope, as before step 5.
 */
export function loadAccess(checkout: Pick<Checkout, 'root' | 'defaultBranch'>): AccessPolicy | undefined {
  let text: string
  try {
    text = git(checkout.root, 'show', `${checkout.defaultBranch}:${ACCESS_FILE}`)
  } catch {
    return undefined
  }
  return parseAccess(text)
}

export function parseAccess(text: string): AccessPolicy {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (error) {
    throw new Error(`${ACCESS_FILE} isn't valid JSON: ${(error as Error).message}`)
  }
  const scopes = (value: unknown, at: string): Scope[] => {
    if (!Array.isArray(value) || value.some((scope) => !(SCOPES as readonly unknown[]).includes(scope))) {
      throw new Error(`${ACCESS_FILE}: ${at} is a list of scopes from ${SCOPES.join(', ')}.`)
    }
    return value as Scope[]
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error(`${ACCESS_FILE} is an object with "people" and "others".`)
  const { people = {}, others = ['read'], keys = {} } = raw as { people?: unknown; others?: unknown; keys?: unknown }
  if (typeof people !== 'object' || people === null || Array.isArray(people)) throw new Error(`${ACCESS_FILE}: "people" maps each handle to its scopes.`)
  if (typeof keys !== 'object' || keys === null || Array.isArray(keys)) throw new Error(`${ACCESS_FILE}: "keys" maps each handle to its public keys.`)
  const keyList = (value: unknown, at: string): string[] => {
    const valid = (key: unknown) => typeof key === 'string' && /^ed25519:[A-Za-z0-9+/]{43}=$/.test(key)
    if (!Array.isArray(value) || !value.every(valid)) throw new Error(`${ACCESS_FILE}: ${at} is a list of ed25519:<base64> public keys, as civic keygen prints them.`)
    return value as string[]
  }
  return {
    people: Object.fromEntries(Object.entries(people).map(([handle, value]) => [handle, scopes(value, `people.${handle}`)])),
    others: scopes(others, 'others'),
    keys: Object.fromEntries(Object.entries(keys).map(([handle, value]) => [handle, keyList(value, `keys.${handle}`)])),
  }
}

/** The person accountable for an identity: the person, or the person an agent acts for. */
export function personOf(identity: Identity): string {
  return identity.type === 'person' ? identity.handle : identity.for
}

/** Whether shared syncs must be signed: once anyone has a key listed, everyone's must be. */
export function signingRequired(policy: AccessPolicy | undefined): boolean {
  return Object.values(policy?.keys ?? {}).some((keys) => keys.length > 0)
}

export function scopesOf(policy: AccessPolicy | undefined, identity: Identity): ReadonlySet<Scope> {
  if (!policy) return new Set(SCOPES)
  return new Set(policy.people[personOf(identity)] ?? policy.others)
}

/** A command the access policy doesn't allow. */
export class ForbiddenError extends Error {
  /** For the overlay server's HTTP response. */
  readonly status = 403
  constructor(identity: Identity, scope: Scope, what: string) {
    const person = personOf(identity)
    super(`${identity.type === 'agent' ? `${identity.harness} for ${person}` : person} can't ${what}: ${ACCESS_FILE} on the default branch doesn't give ${person} the ${scope} scope.`)
    this.name = 'ForbiddenError'
  }
}
