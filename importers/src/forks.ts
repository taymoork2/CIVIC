import { FORK_PROPERTY, type ComponentInstance, type Owner, type Override, type SourceRef } from '../../graph/src/index.ts'
import type { Fragment } from './fragment.ts'

// A person's call on the forks CIVIC inferred (decision 0011, point 5). The design and code
// importers infer a fork by name and structure, or by import, and never count it as drift on
// their own. A confirmed fork gets a `detach` override, which the forecast, the conflict and
// the decision handle like any other override; a dismissed one wasn't a copy, and is dropped.

export interface ForkConfirmations {
  /** Inferred forks, by instance ID, that are real copies of the library component. */
  forks?: string[]
  /** Inferred forks, by instance ID, that aren't: a different component that only looks alike. */
  notForks?: string[]
}

/**
 * Applies a person's fork confirmations to imported records. Naming an instance that isn't an
 * inferred fork fails, so a confirmation that went stale when the file changed is never kept.
 */
export function applyForkConfirmations<T extends Fragment>(document: T, file: ForkConfirmations, by: Owner, source: SourceRef): T {
  const confirmed = new Set(file.forks ?? [])
  const dismissed = new Set(file.notForks ?? [])
  const both = [...confirmed].filter((id) => dismissed.has(id))
  if (both.length > 0) throw new Error(`Confirmed and dismissed as a fork at once: ${both.join(', ')}.`)
  const inferred = new Map(
    document.records.filter((record): record is ComponentInstance => record.kind === 'component-instance' && record.fork?.status === 'inferred').map((record) => [record.id, record]),
  )
  const stale = [...confirmed, ...dismissed].filter((id) => !inferred.has(id))
  if (stale.length > 0) throw new Error(`Fork confirmations for what no importer inferred as a fork: ${stale.join(', ')}.`)

  const overrides: Override[] = [...confirmed].sort().map((id) => {
    const instance = inferred.get(id)!
    const madeBy = instance.owners?.[0]
    return {
      id: `override:${id.slice('instance:'.length)}.detach`,
      kind: 'override',
      title: `${instance.title} is a copy of the library component`,
      instanceId: id,
      property: FORK_PROPERTY,
      change: 'detach',
      ...(madeBy ? { madeBy } : {}),
      source,
    }
  })
  const records = document.records
    .filter((record) => !dismissed.has(record.id))
    .map((record) => (confirmed.has(record.id) && record.kind === 'component-instance' ? { ...record, fork: { ...record.fork!, status: 'confirmed' as const, confirmedBy: by } } : record))
  const links = document.links.filter((link) => !dismissed.has(link.from) && !(link.to && dismissed.has(link.to)))
  return { ...document, records: [...records, ...overrides], links }
}
