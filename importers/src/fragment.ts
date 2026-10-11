import { createHash } from 'node:crypto'
import { ID_PREFIX, SCHEMA_VERSION, type GraphDocument, type GraphRecord, type Link, type RecordKind } from '../../graph/src/index.ts'

/**
 * What one importer returns: the records and links it read. Importers never see each
 * other's output; `assemble` joins fragments into one graph document. A new tool is
 * supported by adding an importer, never by changing the schema.
 */
export interface Fragment {
  records: GraphRecord[]
  links: Link[]
}

export const fragment = (records: GraphRecord[] = [], links: Link[] = []): Fragment => ({ records, links })

const KIND_ORDER = Object.keys(ID_PREFIX) as RecordKind[]

/**
 * Joins fragments into a graph document in a stable order (records by kind, then ID; links
 * by from, relation, to), so the same inputs always give byte-identical output. Two
 * fragments claiming the same record ID is an error, never a silent merge.
 */
export function assemble(...fragments: Fragment[]): GraphDocument {
  const records = new Map<string, GraphRecord>()
  for (const record of fragments.flatMap((part) => part.records)) {
    if (records.has(record.id)) throw new Error(`Two importers produced ${record.id}.`)
    records.set(record.id, record)
  }
  const links = fragments.flatMap((part) => part.links)
  const linkKey = (link: Link) => `${link.from}\u0000${link.relation}\u0000${link.to ?? link.unmapped ?? ''}`
  return {
    schema: SCHEMA_VERSION,
    records: [...records.values()].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.id.localeCompare(b.id)),
    links: links.sort((a, b) => linkKey(a).localeCompare(linkKey(b))),
  }
}

/** `sha256:<hex>` of a file's text, recorded on every source reference. */
export function contentHash(text: string): string {
  return `sha256:${createHash('sha256').update(text).digest('hex')}`
}

/** An ID path segment from free text: `Primary filled` gives `primary-filled`. */
export function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}
