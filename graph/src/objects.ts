import { countsForReadiness, type Graph } from './graph.ts'
import type { DomainObject, Link, Owner, Platform, Target } from './schema.ts'

// The object map's comparisons (decision 0014, point 8). A designer's ORCA grid says which
// objects the product has, what each one holds and what can be done to it; `shows` links
// say which targets show which objects. These are the designer's own questions asked of
// what was built. Only declared and observed ties count: a tie CIVIC suggested waits for a
// person. Every finding is advisory, goes to Design and tells the platform's owners.
// Deterministic, read-only, no model calls (D30).

export const OBJECT_GAP_KINDS = ['object-not-shown', 'object-attribute-missing', 'object-action-platform', 'unconfirmed-object-tie'] as const
export type ObjectGapKind = (typeof OBJECT_GAP_KINDS)[number]

export interface ObjectGap {
  kind: ObjectGapKind
  subjectId: string
  platform?: Platform
  /** Keeps two gaps on one subject apart, such as the object or the attribute. */
  detail: string
  summary: string
  owners: Owner[]
}

/** A target tied to an object, with what it shows of it. */
export interface ObjectTie {
  targetId: string
  objectId: string
  status: Link['status']
  view: string
  attributes?: string[]
  actions?: string[]
  /** For a tie that doesn't count yet: why it was suggested, from its source. */
  basis?: string
}

export interface ObjectMap {
  objects: DomainObject[]
  /** Ties on screens and other non-journey targets, counted or not. */
  ties: ObjectTie[]
  /** Journeys and the objects each one needs. */
  needs: { journeyId: string; objectId: string }[]
  gaps: ObjectGap[]
  /** Denominators for the gate's measures. */
  counts: { needs: number; attributeChecks: number; actionChecks: number; ties: number }
}

export function objectMapOf(graph: Graph): ObjectMap {
  const objects = graph.ofKind('object')
  const shows = graph.document.links.filter((link) => link.relation === 'shows' && link.to)
  const target = (id: string) => {
    const record = graph.get(id)
    return record?.kind === 'target' ? record : undefined
  }
  const isJourney = (id: string) => target(id)?.scale === 'journey'
  const ties: ObjectTie[] = shows
    .filter((link) => !isJourney(link.from))
    .map((link) => ({ targetId: link.from, objectId: link.to!, status: link.status, view: link.view ?? 'detail', ...(link.attributes ? { attributes: link.attributes } : {}), ...(link.actions ? { actions: link.actions } : {}), ...(!countsForReadiness(link) && link.source?.anchor ? { basis: link.source.anchor } : {}) }))
  const counted = ties.filter(counts)
  const needs = shows.filter((link) => isJourney(link.from) && countsForReadiness(link)).map((link) => ({ journeyId: link.from, objectId: link.to! }))
  const gaps: ObjectGap[] = []
  const totals = { needs: needs.length, attributeChecks: 0, actionChecks: 0, ties: ties.length }
  const designOwners = (object: DomainObject) => {
    const design = (object.owners ?? []).filter((owner) => owner.role === 'design')
    return design.length > 0 ? design : (object.owners ?? [])
  }
  const titleOf = (id: string) => graph.get(id)?.title ?? id
  const list = (ids: string[]) => ids.map(titleOf).join(', ')

  // 1. An object a journey needs but none of its screens shows.
  for (const { journeyId, objectId } of needs) {
    const object = graph.get(objectId) as DomainObject
    const screens = screensIn(graph, journeyId)
    if (counted.some((tie) => tie.objectId === objectId && screens.has(tie.targetId))) continue
    const suggested = ties.filter((tie) => tie.objectId === objectId && screens.has(tie.targetId) && !counts(tie)).map((tie) => tie.targetId)
    gaps.push({
      kind: 'object-not-shown',
      subjectId: journeyId,
      detail: objectId,
      summary: `${titleOf(journeyId)} needs ${object.title}, but none of its ${screens.size} screen(s) shows it.${suggested.length > 0 ? ` CIVIC suggests ${list(suggested)}; a person confirms or dismisses each.` : ''}`,
      owners: [...designOwners(object), ...(target(journeyId)?.owners ?? [])],
    })
  }

  for (const object of objects) {
    const mine = counted.filter((tie) => tie.objectId === object.id)

    // 2. An attribute shown on one screen of the object and missing on another, within one view.
    const views = [...new Set(mine.filter((tie) => tie.attributes).map((tie) => tie.view))].sort()
    for (const view of views) {
      const group = mine.filter((tie) => tie.view === view && tie.attributes)
      if (group.length < 2) continue
      for (const attribute of object.attributes) {
        const showing = group.filter((tie) => tie.attributes!.includes(attribute.key))
        if (showing.length === 0) continue
        totals.attributeChecks += 1
        const missing = group.filter((tie) => !showing.includes(tie))
        if (missing.length === 0) continue
        gaps.push({
          kind: 'object-attribute-missing',
          subjectId: object.id,
          detail: `${view} ${attribute.key}`,
          summary: `${object.title}'s ${attribute.title} (${attribute.kind}) is shown on ${list(showing.map((tie) => tie.targetId))} but not on ${list(missing.map((tie) => tie.targetId))}, in its ${view} view.`,
          owners: [...designOwners(object), ...missing.flatMap((tie) => target(tie.targetId)?.owners ?? [])],
        })
      }
    }

    // 3. A call to action one platform offers on the object and another doesn't.
    const offered = new Map<Platform, { actions: Set<string>; targets: Target[] }>()
    for (const tie of mine.filter((item) => item.actions)) {
      const screen = target(tie.targetId)
      for (const platform of screen?.platforms ?? []) {
        const entry = offered.get(platform) ?? { actions: new Set<string>(), targets: [] }
        for (const action of tie.actions!) entry.actions.add(action)
        entry.targets.push(screen!)
        offered.set(platform, entry)
      }
    }
    if (offered.size < 2) continue
    for (const action of object.actions) {
      const offering = [...offered].filter(([, entry]) => entry.actions.has(action.key)).map(([platform]) => platform)
      if (offering.length === 0) continue
      totals.actionChecks += 1
      for (const [platform, entry] of [...offered].filter(([, entry]) => !entry.actions.has(action.key)).sort(([a], [b]) => a.localeCompare(b))) {
        gaps.push({
          kind: 'object-action-platform',
          subjectId: object.id,
          platform,
          detail: action.key,
          summary: `${action.title} on ${object.title} is offered on ${offering.sort().join(', ')} but not on ${platform}, where ${list(entry.targets.map((item) => item.id))} show it.`,
          owners: [...designOwners(object), ...entry.targets.flatMap((item) => (item.owners ?? []).filter((owner) => !owner.platform || owner.platform === platform))],
        })
      }
    }
  }

  // 4. Ties CIVIC suggested from names, waiting for a person to confirm or dismiss them.
  for (const tie of ties.filter((item) => !counts(item))) {
    const object = graph.get(tie.objectId) as DomainObject
    gaps.push({
      kind: 'unconfirmed-object-tie',
      subjectId: tie.targetId,
      detail: tie.objectId,
      summary: `${titleOf(tie.targetId)} may show ${object.title} (${tie.status}${tie.basis ? `, ${tie.basis}` : ''}); a person confirms or dismisses it before it counts.`,
      owners: designOwners(object),
    })
  }

  return { objects, ties, needs, gaps: gaps.map((gap) => ({ ...gap, owners: dedupe(gap.owners) })), counts: totals }
}

/** A tie counts once a person declared it or a run observed it, like any link. */
const counts = (tie: ObjectTie) => countsForReadiness({ status: tie.status } as Link)

/** Every non-journey target a journey contains, directly or through another target. */
function screensIn(graph: Graph, journeyId: string): Set<string> {
  const found = new Set<string>()
  const queue = [journeyId]
  while (queue.length > 0) {
    for (const link of graph.linksFrom(queue.shift()!)) {
      if (link.relation !== 'contains' || !link.to || found.has(link.to) || graph.get(link.to)?.kind !== 'target') continue
      found.add(link.to)
      queue.push(link.to)
    }
  }
  return found
}

/** The object map as Markdown: each object with what ties it, then the comparisons' findings. */
export function renderObjectMap(map: ObjectMap): string {
  const lines = ['| Object | Attributes | Calls to action | Screens that show it | Suggested | Journeys that need it |', '|---|---|---|---|---|---|']
  for (const object of map.objects) {
    const mine = map.ties.filter((tie) => tie.objectId === object.id)
    lines.push(`| ${object.title} | ${object.attributes.length} | ${object.actions.length} | ${mine.filter(counts).length} | ${mine.filter((tie) => !counts(tie)).length} | ${map.needs.filter((need) => need.objectId === object.id).length} |`)
  }
  const sections: [ObjectGapKind, string, string][] = [
    ['object-not-shown', 'Needed by a journey, shown on none of its screens', 'Every object a journey needs is shown on one of its screens.'],
    ['object-attribute-missing', 'Attributes shown on one screen and missing on another', 'Screens with the same view of an object show the same attributes, where they say which they show.'],
    ['object-action-platform', 'Calls to action one platform offers and another does not', map.objects.length > 0 ? 'No object is shown with its calls to action on more than one platform, or every platform offers the same ones.' : 'No objects.'],
    ['unconfirmed-object-tie', 'Ties CIVIC suggested, waiting for a person', 'None.'],
  ]
  for (const [kind, heading, none] of sections) {
    const gaps = map.gaps.filter((gap) => gap.kind === kind)
    lines.push('', `## ${heading}: ${gaps.length}`, '')
    if (gaps.length === 0) lines.push(none)
    for (const gap of gaps) lines.push(`- ${gap.platform ? `[${gap.platform}] ` : ''}${gap.summary} (\`${gap.subjectId}\`)`)
  }
  return lines.join('\n')
}

function dedupe(owners: Owner[]): Owner[] {
  const seen = new Set<string>()
  return owners.filter((owner) => {
    const key = `${owner.role}|${owner.who}|${owner.platform ?? ''}`
    return !seen.has(key) && Boolean(seen.add(key))
  })
}
