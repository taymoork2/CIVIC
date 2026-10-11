import type { Actor, Anchor, AnchorOutcome, ElementLocator, Lane, WorkRequest } from './schema.ts'

/**
 * Which lane a work request closes through (D38). Computed from the request, so the lane
 * always reflects its current acceptance checks:
 *
 * - **owner-sign-off** for a change to intent or behavior (a Proposal) or a high-risk target;
 * - **auto** for a contract-restoring request whose annotations are all anchored and whose
 *   acceptance is executable: at least one check, and every check either written by a
 *   person or accepted by one (an agent never grades its own work);
 * - **batch-review** for everything else, including acceptance that is only a comment.
 *
 * A person can escalate a request to a stricter lane, never to a looser one.
 */
export function laneFor(request: WorkRequest, actors: (id: string) => Actor | undefined, anchored: (annotationId: string) => boolean): Lane {
  const computed = baseLane(request, actors, anchored)
  const order: Lane[] = ['auto', 'batch-review', 'owner-sign-off']
  const escalated = request.escalatedTo
  return escalated && order.indexOf(escalated) > order.indexOf(computed) ? escalated : computed
}

function baseLane(request: WorkRequest, actors: (id: string) => Actor | undefined, anchored: (annotationId: string) => boolean): Lane {
  if (request.intent === 'change' || request.risk === 'high') return 'owner-sign-off'
  const counted = request.acceptance.filter((check) => checkCounts(check, actors))
  const executable = counted.length > 0 && counted.length === request.acceptance.length
  if (executable && request.annotationIds.every(anchored)) return 'auto'
  return 'batch-review'
}

/** A check counts when a person wrote it, or a person accepted an agent's check. */
export function checkCounts(check: WorkRequest['acceptance'][number], actors: (id: string) => Actor | undefined): boolean {
  const isPerson = (id: string | undefined) => id !== undefined && actors(id)?.type === 'person'
  return isPerson(check.writtenBy) || isPerson(check.acceptedBy)
}

/** An anchor that can follow the product: it names a target, an edge, or an exact locator. */
export function isAnchored(anchor: Anchor | undefined): boolean {
  if (!anchor) return false
  return anchor.targetIds.length > 0 || (anchor.edges?.length ?? 0) > 0 || hasLocator(anchor.locator)
}

function hasLocator(locator: ElementLocator | undefined): locator is ElementLocator {
  return locator !== undefined && (locator.testId !== undefined || (locator.role !== undefined && locator.name !== undefined))
}

/**
 * What a page shows about one element, as read by a deterministic capture: the graph IDs it
 * carries (`data-civic-id`, comma separated), its test ID, and its role and accessible name.
 */
export interface ObservedElement {
  civicIds: string[]
  testId?: string
  role?: string
  name?: string
}

export interface AnchorResolution {
  outcome: AnchorOutcome
  /** Indexes into the observed elements, when found. */
  matches: number[]
}

/**
 * Finds an annotation again on another revision (D37). First by stable target ID, then by
 * exact locator: the test ID, or role and accessible name together. If neither matches,
 * the anchor is not found on this revision. Nothing is ever placed on the nearest element,
 * and the rectangle is never consulted.
 */
export function resolveAnchor(anchor: Anchor | undefined, elements: ObservedElement[]): AnchorResolution {
  if (!isAnchored(anchor)) return { outcome: 'unanchored', matches: [] }
  const byId = anchor!.targetIds.length === 0 ? [] : indexes(elements, (element) => anchor!.targetIds.some((id) => element.civicIds.includes(id)))
  if (byId.length > 0) return { outcome: 'found-by-id', matches: byId }
  const locator = anchor!.locator
  if (hasLocator(locator)) {
    const byLocator = indexes(elements, (element) =>
      locator.testId !== undefined ? element.testId === locator.testId : element.role === locator.role && element.name === locator.name,
    )
    // An exact locator that matches several elements is ambiguous, so it is not a match either.
    if (byLocator.length === 1) return { outcome: 'found-by-locator', matches: byLocator }
  }
  return { outcome: 'not-found', matches: [] }
}

function indexes<T>(items: T[], predicate: (item: T) => boolean): number[] {
  return items.flatMap((item, index) => (predicate(item) ? [index] : []))
}
