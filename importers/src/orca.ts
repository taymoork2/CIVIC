import type { DomainObject, Link, ObjectAction, ObjectAttribute, Owner, SourceRef, Target } from '../../graph/src/index.ts'
import { slug } from './fragment.ts'

// The OOUX object map (decision 0014, point 8). A designer keeps an ORCA grid of the
// product's objects (a spreadsheet, exported as CSV), and CIVIC reads it as Design's intent.
// Targets are then tied to the objects they show, by a person declaring it in an object
// ties file or by confirming a tie CIVIC suggested from names. No model calls (D30).

export interface OrcaGridOptions {
  /** The ID segment the product's other records use, such as `example`. */
  prefix: string
  /** Design owns the object map. */
  owners: Owner[]
  source: Omit<SourceRef, 'anchor'>
}

/** The grid's row labels, as designers write them, and the part of an object each fills. */
const SECTIONS: Record<string, 'description' | 'synonyms' | 'core' | 'metadata' | 'relationships' | 'actions'> = {
  description: 'description',
  'also called': 'synonyms',
  synonyms: 'synonyms',
  'core content': 'core',
  core: 'core',
  metadata: 'metadata',
  'nested objects': 'relationships',
  relationships: 'relationships',
  'calls to action': 'actions',
  ctas: 'actions',
  cta: 'actions',
}

export const objectId = (prefix: string, title: string) => `object:${prefix}.${slug(title)}`

/**
 * Reads an ORCA grid exported as CSV: one column per object, its name in the first row,
 * and one row per item, labelled in its first cell with the section it belongs to
 * (description, also called, core content, metadata, nested objects, calls to action).
 * A section may span as many rows as it needs, and a blank cell is no item. A nested
 * object names another column, with its cardinality in brackets: `Load (many)`. A call to
 * action may declare its kind, `Add project [add]`, which the inverse check reads. Several
 * other names go in one cell, separated by semicolons.
 */
export function readOrcaGrid(csv: string, options: OrcaGridOptions): DomainObject[] {
  const rows = parseCsv(csv).filter((row) => row.some((cell) => cell.trim() !== ''))
  const [header, ...body] = rows
  if (!header || header.length < 2) throw new Error('An ORCA grid has a header row naming one object per column after the first.')
  const titles = header.slice(1).map((cell) => cell.trim())
  if (titles.some((title) => title === '')) throw new Error('Every object column in the ORCA grid has a name in its header.')
  const ids = titles.map((title) => objectId(options.prefix, title))
  const byTitle = new Map(titles.map((title, index) => [title.toLowerCase(), ids[index]!]))
  const objects: DomainObject[] = titles.map((title, index) => ({
    id: ids[index]!,
    kind: 'object',
    title,
    owners: options.owners,
    attributes: [],
    actions: [],
    relationships: [],
    source: { ...options.source, anchor: title },
  }))
  for (const [line, row] of body.entries()) {
    const label = (row[0] ?? '').trim()
    const section = SECTIONS[label.toLowerCase()]
    if (!section) throw new Error(`ORCA grid row ${line + 2} is labelled "${label}"; expected one of ${Object.keys(SECTIONS).join(', ')}.`)
    row.slice(1, titles.length + 1).forEach((raw, index) => {
      const cell = raw.trim()
      if (cell === '') return
      const object = objects[index]!
      if (section === 'description') object.description = object.description ? `${object.description} ${cell}` : cell
      else if (section === 'synonyms') object.synonyms = [...(object.synonyms ?? []), ...cell.split(';').map((name) => name.trim()).filter(Boolean)]
      else if (section === 'core' || section === 'metadata') add(object.attributes, { key: slug(cell), title: cell, kind: section } satisfies ObjectAttribute, object)
      else if (section === 'actions') add(object.actions, readAction(cell, object), object)
      else {
        const match = /^(.*?)\s*(?:\(([^)]*)\))?$/.exec(cell)!
        const nested = byTitle.get(match[1]!.trim().toLowerCase())
        if (!nested) throw new Error(`${object.title} nests "${match[1]}", which is not a column of the ORCA grid.`)
        object.relationships.push({ objectId: nested, ...(match[2] ? { cardinality: match[2].trim() } : {}) })
      }
    })
  }
  return objects
}

/**
 * A call to action, with its kind in brackets when the team declares one: `Add project [add]`.
 * A decision that makes it one-way follows the kind: `Add project [add; one-way docs/decisions/0042.md: Projects are permanent]`.
 */
function readAction(cell: string, object: DomainObject): ObjectAction {
  const match = /^(.*?)\s*\[([^\];]*)(?:;\s*one-way\s+([^:\]]+):\s*([^\]]+))?\]$/.exec(cell)
  if (!match) {
    if (cell.includes('[')) throw new Error(`${object.title}'s call to action "${cell}" has a bracket CIVIC can't read; use [kind] or [kind; one-way <decision>: <reason>].`)
    return { key: slug(cell), title: cell }
  }
  const kind = match[2]!.trim()
  return { key: slug(match[1]!), title: match[1]!, ...(kind ? { kind } : {}), ...(match[3] ? { oneWay: { decision: match[3].trim(), reason: match[4]!.trim() } } : {}) }
}

function add<T extends { key: string; title: string }>(list: T[], item: T, object: DomainObject) {
  if (list.some((existing) => existing.key === item.key)) throw new Error(`${object.title} lists "${item.title}" twice in the ORCA grid.`)
  list.push(item)
}

/** RFC 4180 CSV: quoted cells may hold commas, newlines and doubled quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"'
        index += 1
      } else if (char === '"') quoted = false
      else cell += char
    } else if (char === '"') quoted = true
    else if (char === ',') {
      row.push(cell)
      cell = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += char
  }
  if (quoted) throw new Error('The CSV ends inside a quoted cell.')
  if (cell !== '' || row.length > 0) rows.push([...row, cell])
  return rows
}

export const OBJECT_TIES_SCHEMA = 'civic.object-ties/0'

/** One declared tie: these targets show this object, and optionally what they show of it. */
export interface ObjectTieDeclaration {
  /** `target:` IDs. A journey's tie says the journey needs the object. */
  targets: string[]
  object: string
  view?: string
  attributes?: string[]
  actions?: string[]
}

/**
 * Which targets show which objects, as people declared it (CIVIC's own file, tool-neutral).
 * `dismissed` holds suggestions a person said are wrong, so CIVIC stops making them.
 */
export interface ObjectTiesFile {
  schema: typeof OBJECT_TIES_SCHEMA
  /** Free text for whoever reads the file, such as where the ties came from. */
  note?: string
  ties: ObjectTieDeclaration[]
  dismissed?: { target: string; object: string }[]
}

export interface ObjectTieOptions {
  source: Omit<SourceRef, 'anchor'>
}

/**
 * The `shows` links for a product: each declared tie, and a suggestion (an inferred link)
 * wherever a screen's title or anchor names an object, or one of its other names, as a
 * whole word and no tie or dismissal already covers that pair. Journeys get no
 * suggestions: what a journey needs is the designer's call. A tie naming a target or
 * object that isn't there, or an attribute or action the object doesn't have, is an error.
 */
export function tieObjects(objects: readonly DomainObject[], targets: readonly Target[], file: ObjectTiesFile, options: ObjectTieOptions): Link[] {
  if (file?.schema !== OBJECT_TIES_SCHEMA) throw new Error(`Not an object ties file: expected schema "${OBJECT_TIES_SCHEMA}".`)
  const objectById = new Map(objects.map((object) => [object.id, object]))
  const targetById = new Map(targets.map((target) => [target.id, target]))
  const links: Link[] = []
  const covered = new Set<string>()
  const pair = (target: string, object: string) => `${target}\n${object}`
  for (const [index, tie] of file.ties.entries()) {
    const object = objectById.get(tie.object)
    if (!object) throw new Error(`Object tie ${index + 1} names ${tie.object}, which is not in the object map.`)
    for (const key of tie.attributes ?? []) if (!object.attributes.some((item) => item.key === key)) throw new Error(`Object tie ${index + 1}: ${object.title} has no attribute "${key}".`)
    for (const key of tie.actions ?? []) if (!object.actions.some((item) => item.key === key)) throw new Error(`Object tie ${index + 1}: ${object.title} has no call to action "${key}".`)
    for (const id of tie.targets) {
      if (!targetById.has(id)) throw new Error(`Object tie ${index + 1} names ${id}, which is not a target in the graph.`)
      if (covered.has(pair(id, object.id))) throw new Error(`${id} is tied to ${object.id} more than once.`)
      covered.add(pair(id, object.id))
      links.push({
        from: id,
        relation: 'shows',
        to: object.id,
        status: 'declared',
        ...(tie.view ? { view: tie.view } : {}),
        ...(tie.attributes ? { attributes: tie.attributes } : {}),
        ...(tie.actions ? { actions: tie.actions } : {}),
        source: { ...options.source, anchor: `ties[${index}]` },
      })
    }
  }
  for (const dismissal of file.dismissed ?? []) covered.add(pair(dismissal.target, dismissal.object))

  const words = (text: string) => ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `
  for (const target of targets) {
    if (target.scale === 'journey') continue
    const text = words(`${target.title} ${target.source?.anchor ?? ''}`)
    for (const object of objects) {
      if (covered.has(pair(target.id, object.id))) continue
      const name = [object.title, ...(object.synonyms ?? [])].map(words).find((name) => text.includes(name) || text.includes(`${name.trimEnd()}s `))
      if (!name) continue
      links.push({ from: target.id, relation: 'shows', to: object.id, status: 'inferred', source: { ...options.source, anchor: `suggested by the name "${name.trim()}"` } })
    }
  }
  return links
}
