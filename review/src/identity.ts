import type { Actor, GraphDocument } from '../../graph/src/index.ts'
import { git, idPath } from './git.ts'

/**
 * Who is running a command (D35). A person runs as themselves. An agent runs with
 * `CIVIC_AGENT` (its harness, such as `claude-code`) and `CIVIC_FOR` (the person it acts
 * for), and every write it makes names that person. This is local attribution, not
 * authentication: real identities and permissions are roadmap step 5.
 */
export type Identity = { type: 'person'; handle: string } | { type: 'agent'; harness: string; for: string }

export const CIVIC_ACTOR_ID = 'actor:civic'

export function identityFromEnv(env: NodeJS.ProcessEnv, cwd: string): Identity {
  const person = env.CIVIC_PERSON ?? configured(cwd)
  if (env.CIVIC_AGENT) {
    const forWhom = env.CIVIC_FOR ?? person
    if (!forWhom) throw new Error('An agent acts for a named person. Set CIVIC_FOR to their handle.')
    return { type: 'agent', harness: env.CIVIC_AGENT, for: forWhom }
  }
  if (!person) throw new Error('Set your handle with `git config civic.handle <handle>` or CIVIC_PERSON.')
  return { type: 'person', handle: person }
}

function configured(cwd: string): string | undefined {
  for (const key of ['civic.handle', 'user.email', 'user.name']) {
    try {
      const value = git(cwd, 'config', '--get', key)
      if (value) return key === 'user.email' ? value.split('@')[0] : value
    } catch {}
  }
  return undefined
}

export function personId(handle: string): string {
  return `actor:person.${idPath(handle)}`
}

export function actorId(identity: Identity): string {
  return identity.type === 'person' ? personId(identity.handle) : `actor:agent.${idPath(identity.harness)}.${idPath(identity.for)}`
}

/** Adds the actor records an identity needs (the agent and the person it acts for), and returns its ID. */
export function ensureActor(document: GraphDocument, identity: Identity): string {
  const person = identity.type === 'person' ? identity.handle : identity.for
  upsert(document, { id: personId(person), kind: 'actor', title: person, type: 'person', handle: person })
  if (identity.type === 'agent') {
    upsert(document, { id: actorId(identity), kind: 'actor', title: `${identity.harness} for ${identity.for}`, type: 'agent', handle: identity.harness, delegatedBy: personId(identity.for) })
  }
  return actorId(identity)
}

export function ensureCivicActor(document: GraphDocument): string {
  upsert(document, { id: CIVIC_ACTOR_ID, kind: 'actor', title: 'CIVIC re-capture and Auto lane', type: 'civic', handle: 'civic' })
  return CIVIC_ACTOR_ID
}

function upsert(document: GraphDocument, actor: Actor) {
  if (!document.records.some((record) => record.id === actor.id)) document.records.push(actor)
}
