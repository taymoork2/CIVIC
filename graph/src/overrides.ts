import { implementationsOf } from './context.ts'
import { forecastOverride, type Forecast } from './forecast.ts'
import { countsForReadiness, type Graph } from './graph.ts'
import { decisionFor } from './decisions.ts'
import type { ContractConflict, Decision, Override, Owner } from './schema.ts'

// The design-time review of a product's changes to one library component instance
// (component change flow, steps 1 and 2): each override's per-platform forecast, the
// record that tracks it, who is asked and who is told, and whether the design can be
// adopted yet. A read-only query; the same graph always gives the same review.

export interface OverrideReviewItem {
  override: Override
  forecasts: Forecast[]
  /** The conflict tracking this override, if the import raised one. */
  conflict?: ContractConflict
  /** The Decision in force on that conflict, once a person has decided it. */
  decision?: Decision
}

export interface OverrideReview {
  instanceId: string
  semanticId: string
  items: OverrideReviewItem[]
  /** Decide: who made the changes and who owns the component's contract. */
  asked: Owner[]
  /** Act or prepare: design engineering where a library change is forecast, and the product's engineers and QA. */
  told: Owner[]
  /** Every screen and journey the instance appears in, nearest first. */
  shownOn: string[]
  /** Adoptable only once every override has a decision. */
  readiness: 'no-overrides' | 'not-yet-adoptable' | 'decided'
}

export function reviewInstance(graph: Graph, instanceId: string): OverrideReview {
  const instance = graph.get(instanceId)
  if (instance?.kind !== 'component-instance') throw new Error(`${instanceId} is not a component instance in this graph.`)
  const semantic = graph.get(instance.semanticId)
  if (semantic?.kind !== 'semantic-component') throw new Error(`${instance.semanticId} is not a semantic component in this graph.`)

  const overrides = graph.ofKind('override').filter((override) => override.instanceId === instanceId).sort((a, b) => a.id.localeCompare(b.id))
  const conflicts = graph.ofKind('contract-conflict')
  const items = overrides.map((override): OverrideReviewItem => {
    const conflict = conflicts.find((candidate) => candidate.sides.some((side) => side.recordId === override.id))
    const decision = conflict ? decisionFor(graph, conflict.id) : undefined
    return { override, forecasts: forecastOverride(graph, override.id), ...(conflict ? { conflict } : {}), ...(decision ? { decision } : {}) }
  })

  const shownOn = containers(graph, instanceId)
  const needsLibrary = new Set(items.flatMap((item) => item.forecasts.filter((forecast) => forecast.outcome === 'needs-library-change').map((forecast) => forecast.platform)))
  const libraryOwners = implementationsOf(graph, semantic)
    .filter((component) => needsLibrary.has(component.platform))
    .flatMap((component) => (component.owners ?? []).filter((owner) => owner.role === 'design-engineering'))
  const productOwners = shownOn.flatMap((id) => graph.get(id)?.owners ?? []).filter((owner) => owner.role === 'engineering' || owner.role === 'qa')

  const decided = items.every((item) => item.decision !== undefined)
  return {
    instanceId,
    semanticId: semantic.id,
    items,
    asked: dedupe([...overrides.flatMap((override) => (override.madeBy ? [override.madeBy] : [])), ...(semantic.owners ?? []).filter((owner) => owner.role === 'design')]),
    told: items.length > 0 ? dedupe([...libraryOwners, ...productOwners]) : [],
    shownOn,
    readiness: items.length === 0 ? 'no-overrides' : decided ? 'decided' : 'not-yet-adoptable',
  }
}

/** Targets that contain `id`, transitively, through declared or observed links: screen, then journey. */
function containers(graph: Graph, id: string): string[] {
  const found: string[] = []
  const queue = [id]
  while (queue.length > 0) {
    for (const link of graph.linksTo(queue.shift()!)) {
      if (link.relation === 'contains' && countsForReadiness(link) && !found.includes(link.from)) {
        found.push(link.from)
        queue.push(link.from)
      }
    }
  }
  return found
}

function dedupe(owners: Owner[]): Owner[] {
  const seen = new Set<string>()
  return owners.filter((owner) => {
    const key = `${owner.role}|${owner.who}|${owner.platform ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const OUTCOME_LABEL: Record<Forecast['outcome'], string> = {
  supported: 'Supported',
  'needs-library-change': 'Needs a library change',
  forbidden: 'Forbidden by contract',
}

/** The review as Markdown: one table of forecasts per platform, then decisions, people and readiness. */
export function renderInstanceReview(graph: Graph, review: OverrideReview): string {
  const title = (id: string) => graph.get(id)?.title ?? id
  const who = (owners: Owner[]) => (owners.length > 0 ? owners.map((owner) => `${owner.role} ${owner.who}${owner.platform ? ` (${owner.platform})` : ''}`).join(', ') : 'nobody recorded')
  const lines = [`# Changes to ${title(review.instanceId)}`, '']
  if (review.items.length === 0) return [...lines, 'No overrides: the instance uses the library component as it is.'].join('\n')

  const platforms = [...new Set(review.items.flatMap((item) => item.forecasts.map((forecast) => forecast.platform)))]
  lines.push('Forecasts are computed from the libraries\' extension points and the contract\'s rules as they are in this graph. Each platform gets its own answer.', '')
  lines.push(`| Override | ${platforms.join(' | ')} | Record |`, `|---|${platforms.map(() => '---').join('|')}|---|`)
  for (const item of review.items) {
    const cells = platforms.map((platform) => {
      const forecast = item.forecasts.find((candidate) => candidate.platform === platform)
      return forecast ? OUTCOME_LABEL[forecast.outcome] : 'not shipped'
    })
    lines.push(`| ${item.override.title} (\`${item.override.property}\`) | ${cells.join(' | ')} | ${recordState(item)} |`)
  }
  lines.push('', '## Why', '')
  for (const item of review.items) {
    lines.push(`- **${item.override.title}** (\`${item.override.id}\`)`)
    for (const forecast of item.forecasts) lines.push(`  - ${forecast.platform}: ${forecast.reason}`)
    const decision = item.decision
    if (decision) {
      lines.push(`  - Decided by ${decision.decidedBy.role} ${decision.decidedBy.who}: ${decision.rationale}${decision.revisitTrigger ? ` Revisit when: ${decision.revisitTrigger}` : ''}${decision.expires ? ` Expires ${decision.expires}.` : ''}`)
    }
  }
  lines.push('', '## People', '')
  lines.push(`- Asked to decide: ${who(review.asked)}.`)
  lines.push(`- Told: ${who(review.told)}.`)
  lines.push(`- Shown on: ${review.shownOn.map((id) => `${title(id)} (\`${id}\`)`).join(', ') || 'no screen recorded'}.`)
  lines.push('', '## Readiness', '')
  const open = review.items.filter((item) => !item.decision).length
  lines.push(
    review.readiness === 'decided'
      ? `Every override has a decision. ${review.items.filter((item) => item.decision?.alignment === 'awaiting-adoption').length} of ${review.items.length} await adoption.`
      : `Design not yet adoptable: ${open} of ${review.items.length} override(s) have no decision.`,
  )
  return lines.join('\n')
}

function recordState({ conflict, decision }: OverrideReviewItem): string {
  if (!conflict) return 'not raised'
  if (!decision) return `Unreviewed drift, open (\`${conflict.id}\`)`
  const outcome = { 'update-design': 'rejected: update the design', 'change-implementation': 'change the implementation', 'update-contract': 'promoted into the system', 'approve-exception': 'exception approved' }[decision.outcome]
  return `Decided, ${outcome}; ${decision.alignment} (\`${conflict.id}\`)`
}
