import { contextFor, renderWorkOrder, type Annotation, type GraphDocument, type Graph, type Platform, type WorkRequest } from '../../graph/src/index.ts'
import { find, type RequestSummary } from './loop.ts'
import type { Store } from './store.ts'

const STATUS: Record<WorkRequest['status'], string> = {
  open: 'Open',
  claimed: 'Claimed',
  'fix-ready': 'Fix ready for review',
  resolved: 'Resolved',
  reopened: 'Reopened',
}
const LANE = { auto: 'Auto', 'batch-review': 'Batch review', 'owner-sign-off': 'Owner sign-off' } as const

/** One line per request, for `civic requests` and `civic queue`. */
export function renderList(summaries: RequestSummary[]): string {
  if (summaries.length === 0) return 'No work requests.'
  return summaries
    .map(({ request, lane, claimedBy }) => {
      const short = request.id.slice('request:'.length, 'request:'.length + 8)
      const holder = claimedBy ? ` · claimed by ${claimedBy} on ${request.claim!.line}` : ''
      return `${short}  ${STATUS[request.status].padEnd(20)} ${LANE[lane].padEnd(14)} ${request.title}${holder}`
    })
    .join('\n')
}

export interface RenderOptions {
  store: Store
  /** A product graph to export `civic context` from, for each of the request's context IDs. */
  graph?: Graph
}

/**
 * A work request as one Markdown work order: what to do, the annotations with their frozen
 * captures and anchors, where the problem was seen, how to reproduce it, how it is accepted,
 * and the contract export when a product graph is given. It can be pasted into any agent
 * or filed in a tracker.
 */
export function renderRequest(document: GraphDocument, summary: RequestSummary, options: RenderOptions): string {
  const { request, lane, claimedBy } = summary
  const out: string[] = [
    `# ${request.title}`,
    '',
    request.ask,
    '',
    `- ID: \`${request.id}\``,
    `- Status: ${STATUS[request.status]}${claimedBy ? `, claimed by ${claimedBy} on ${request.claim!.line} until ${request.claim!.expires}` : ''}`,
    `- Lane: ${LANE[lane]}${request.intent === 'change' ? ' (a change to intent or behavior, so a Proposal)' : ''}${request.risk === 'high' ? ', high risk' : ''}`,
    `- Asked by ${request.requestedBy}${request.owners?.length ? `; owners ${request.owners.map((owner) => `${owner.who} (${owner.role})`).join(', ')}` : ''}`,
    `- Seen on ${request.base.line} at ${request.base.revision}`,
    `- Reproduce: \`${request.repro}\``,
    '',
    '## Annotations',
  ]
  for (const id of request.annotationIds) {
    const annotation = find<Annotation>(document, id, 'annotation')
    out.push('', `### ${annotation.title}`, '', annotation.comment, '', `- ID: \`${annotation.id}\`, by ${annotation.writtenBy}`)
    const anchor = annotation.anchor
    if (anchor?.targetIds.length) out.push(`- Targets: ${anchor.targetIds.map((target) => `\`${target}\``).join(', ')}`)
    for (const edge of anchor?.edges ?? []) out.push(`- Path: \`${edge.from}\` to ${edge.to ? `\`${edge.to}\`` : 'an unmapped destination'}${edge.action ? ` by "${edge.action}"` : ''}${edge.condition ? ` when ${edge.condition}` : ''}`)
    if (anchor?.locator) out.push(`- Locator: ${Object.entries(anchor.locator).map(([key, value]) => `${key} "${value}"`).join(', ')}`)
    if (!anchor || (anchor.targetIds.length === 0 && !anchor.locator)) out.push('- Unanchored: it can\'t be found again on another revision until someone anchors it.')
    if (annotation.capture) out.push(`- Capture: ${options.store.capturePath(annotation.capture)}${annotation.capture.reproduction ? ` (scenario \`${annotation.capture.reproduction}\`)` : ''}`)
    out.push(`- Made on ${annotation.seenOn.line} at ${annotation.seenOn.revision}${annotation.seenOn.url ? `, ${annotation.seenOn.url}` : ''}`)
  }
  out.push('', '## Acceptance', '')
  if (request.acceptance.length === 0) out.push('Only the comments above: a person reviews the before and after.')
  request.acceptance.forEach((check, index) => out.push(`${index + 1}. \`${check.command}\`, by ${check.writtenBy}${check.acceptedBy ? `, accepted by ${check.acceptedBy}` : ''}`))
  if (request.fixes.length > 0) {
    out.push('', '## Fixes')
    for (const fix of request.fixes) {
      out.push('', `- ${fix.at}: ${fix.by} on ${fix.line} at ${fix.revision}${fix.preview ? `, preview ${fix.preview}` : ''}${fix.note ? `. ${fix.note}` : ''}`)
      const recapture = fix.recapture
      if (!recapture) continue
      for (const anchor of recapture.anchors) out.push(`  - ${anchor.annotationId}: ${anchor.outcome}${anchor.capture ? `, after ${options.store.capturePath(anchor.capture)}` : ''}`)
      for (const check of recapture.checks) out.push(`  - \`${check.command}\`: ${check.outcome}`)
    }
  }
  if (request.comments.length > 0) {
    out.push('', '## Comments', '')
    for (const comment of request.comments) out.push(`- ${comment.at}, ${comment.by}: ${comment.text}`)
  }
  out.push('', '## History', '')
  for (const event of request.history) out.push(`- ${event.at}: ${STATUS[event.status]} by ${event.by}${event.note ? `. ${event.note}` : ''}`)
  if (request.contextIds?.length) {
    out.push('', '## Contract')
    for (const id of request.contextIds) {
      if (!options.graph || !request.platform) {
        out.push('', `Run \`civic context <graph> ${id} --platform ${request.platform ?? '<platform>'}\` for the contract.`)
        continue
      }
      out.push('', renderWorkOrder(contextFor(options.graph, id, { platform: request.platform as Platform })))
    }
  }
  return `${out.join('\n')}\n`
}
