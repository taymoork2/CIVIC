import type { GraphDocument, Link, ObservedControl, Owner, Platform, SourceRef, Target } from '../../graph/src/index.ts'
import { applyForkConfirmations, type ForkConfirmations } from './forks.ts'
import { contentHash, fragment, type Fragment } from './fragment.ts'

// The crawl's output (`civic.crawl/0`, written by crawl/), as far as this importer reads it.
interface CrawlFile {
  schema: string
  seed: string
  platform: string
  driver: string
  revision: string
  states: { id: string; location: string; title: string; hash: string }[]
  transitions: { from: string; to: string; action: { role: string; name: string } }[]
  blocked?: { from: string; action: { role: string; name: string } }[]
  unreached?: { from: string; action: { role: string; name: string } }[]
}

export interface CrawlImportOptions {
  /** The ID segment every target gets, such as `notes`: a state `draft` becomes `target:notes.draft`. */
  prefix: string
  owners: Owner[]
  /** Where the crawl file is, recorded on every source reference. */
  path: string
}

/**
 * Reads a crawl (D34) into the graph. Every state the crawl reached is a discovered screen,
 * and every transition is a proposed `navigates` link. Neither counts for readiness until a
 * person confirms it (`applyConfirmations`), because a crawl shows what the app does, not
 * what it should do.
 */
export function readCrawl(crawl: unknown, options: CrawlImportOptions): Fragment {
  const file = crawl as CrawlFile
  if (file?.schema !== 'civic.crawl/0' || !Array.isArray(file.states)) throw new Error('Not a CIVIC crawl file (civic.crawl/0).')
  const { prefix, owners } = options
  const source = (anchor: string): SourceRef => ({ tool: file.driver, importer: 'crawl', revision: file.revision, path: options.path, anchor })
  const id = (state: string) => `target:${prefix}.${state}`
  // The controls on each screen, including the ones the crawl never touched: a blocked "Remove
  // project" still proves the app offers a way to remove one (decision 0015).
  const controlsOn = (state: string): ObservedControl[] => {
    const seen = new Set<string>()
    const found: ObservedControl[] = []
    const add = (outcome: ObservedControl['outcome'], skips: { from: string; action: { role: string; name: string } }[]) => {
      for (const { from, action } of skips) {
        const key = `${action.role}\u0000${action.name}`
        if (from === state && !seen.has(key) && seen.add(key)) found.push({ role: action.role, name: action.name, outcome })
      }
    }
    add('taken', file.transitions)
    add('blocked', file.blocked ?? [])
    add('unreached', file.unreached ?? [])
    return found
  }
  const targets: Target[] = file.states.map((state) => {
    const controls = controlsOn(state.id)
    return {
      id: id(state.id),
      kind: 'target',
      title: state.title || state.location,
      scale: 'screen',
      presence: 'discovered',
      platforms: [file.platform as Platform],
      owners,
      ...(controls.length > 0 ? { controls } : {}),
      source: source(`${state.location} ${state.hash}`),
    }
  })
  const links: Link[] = file.transitions.map((edge) => ({
    from: id(edge.from),
    relation: 'navigates',
    to: id(edge.to),
    status: 'proposed',
    action: edge.action.name,
    source: source(`${edge.action.role} "${edge.action.name}"`),
  }))
  return fragment(targets, links)
}

/**
 * A person's confirmation of what CIVIC found but can't vouch for: a crawl's screens and paths,
 * and forks an importer inferred (decision 0011). Kept in a project file next to its inputs.
 */
export interface ConfirmationFile extends ForkConfirmations {
  schema: 'civic.confirmations/0'
  by: Owner
  at: string
  /** Discovered screens that are real, intended screens. */
  screens?: string[]
  /** Proposed paths that are intended, by their ends and action. */
  paths?: { from: string; to: string; action: string }[]
  /** Journeys the person declares over confirmed screens, so the journey shape checks run on them. */
  journeys?: { id: string; title: string; entry: string[]; exits?: string[]; screens: string[] }[]
}

/**
 * Applies a person's confirmations to an imported crawl. A confirmed screen becomes expected
 * and a confirmed path declared, with the confirmation file as their source. Declared journeys
 * contain confirmed screens only. Confirmed forks get their `detach` override and dismissed
 * ones are dropped (`applyForkConfirmations`). Confirming something the importers no longer
 * find fails, so a stale confirmation is never kept.
 */
export function applyConfirmations<T extends GraphDocument | Fragment>(document: T, file: ConfirmationFile, path: string, text: string): T {
  if (file?.schema !== 'civic.confirmations/0') throw new Error('Not a confirmation file (civic.confirmations/0).')
  const source: SourceRef = { tool: 'civic', importer: 'confirmations', revision: contentHash(text), path, anchor: `${file.by.role} ${file.by.who} ${file.at}` }
  const screens = new Set(file.screens ?? [])
  const found = new Set(document.records.filter((record) => record.kind === 'target').map((record) => record.id))
  const missing = [...screens].filter((id) => !found.has(id))
  const key = (from: string, to: string | undefined, action: string | undefined) => `${from}\u0000${to ?? ''}\u0000${action ?? ''}`
  const paths = new Set((file.paths ?? []).map((edge) => key(edge.from, edge.to, edge.action)))
  const known = new Set(document.links.map((link) => key(link.from, link.to, link.action)))
  missing.push(...(file.paths ?? []).filter((edge) => !known.has(key(edge.from, edge.to, edge.action))).map((edge) => `${edge.from} "${edge.action}" ${edge.to}`))
  for (const journey of file.journeys ?? []) missing.push(...[...journey.screens, ...journey.entry, ...(journey.exits ?? [])].filter((id) => !screens.has(id)).map((id) => `${id} (in ${journey.id}, not a confirmed screen)`))
  if (missing.length > 0) throw new Error(`Confirmations for what the crawl did not find: ${[...new Set(missing)].join(', ')}.`)

  const records = document.records.map((record) => (record.kind === 'target' && screens.has(record.id) ? { ...record, presence: 'expected' as const, source } : record))
  const links = document.links.map((link) => (paths.has(key(link.from, link.to, link.action)) ? { ...link, status: 'declared' as const, source } : link))
  for (const journey of file.journeys ?? []) {
    records.push({ id: journey.id, kind: 'target', title: journey.title, scale: 'journey', presence: 'expected', entry: journey.entry, ...(journey.exits ? { exits: journey.exits } : {}), owners: [file.by], source })
    for (const screen of journey.screens) links.push({ from: journey.id, relation: 'contains', to: screen, status: 'declared', source })
  }
  return applyForkConfirmations({ ...document, records, links }, file, file.by, source)
}
