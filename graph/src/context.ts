import { countsForReadiness, type Graph } from './graph.ts'
import type {
  ContractConflict,
  ContractRule,
  Evidence,
  ExtensionPoint,
  Intent,
  Platform,
  PlatformComponent,
  SemanticComponent,
  Token,
  VariantMapping,
} from './schema.ts'

/**
 * One target's contract on one platform, as a single work order (D31). Everything here is
 * read from the graph; nothing is inferred, generated or ranked. Engineers starting a ticket
 * and any tool a team uses read the same export.
 */
export interface WorkOrder {
  target: { id: string; title: string; purpose: string }
  platform: Platform
  variant?: { key: string; title: string }
  /** The stable IDs to put in code, tests and design annotations so CIVIC links them without guessing. */
  ids: string[]
  intents: Pick<Intent, 'id' | 'title' | 'category' | 'statement'>[]
  states: string[]
  slots: string[]
  rules: ContractRule[]
  implementation?: {
    id: string
    title: string
    package: string
    symbol: string
    defaultVariant?: string
    /** The requested variant's mapping, or every mapping when no variant was asked for. */
    mappings: VariantMapping[]
  }
  /** How the other platforms express the same variant, for reference. */
  otherPlatforms: { platform: Platform; id: string; mapping: VariantMapping['mapping'] | 'unmapped'; expression?: string }[]
  tokens: { id: string; path: string; type: string; from: string }[]
  extensionPoints: Pick<ExtensionPoint, 'id' | 'mechanism' | 'name' | 'expresses'>[]
  /** Conflicts on this target and platform, open ones first. */
  records: Pick<ContractConflict, 'id' | 'title' | 'status' | 'classification' | 'alignment' | 'summary' | 'owners' | 'resolution'>[]
  evidence: Pick<Evidence, 'id' | 'title' | 'tier' | 'method' | 'outcome' | 'finding'>[]
  /** What done means: the intents and contract rules, plus the evidence still missing. */
  acceptance: string[]
}

export interface ContextOptions {
  platform: Platform
  variant?: string
}

export function contextFor(graph: Graph, targetId: string, options: ContextOptions): WorkOrder {
  const semantic = graph.get(targetId)
  if (semantic?.kind !== 'semantic-component') {
    throw new Error(`${targetId} is not a semantic component in this graph. Schema v0 exports component contracts; journeys and screens come with roadmap step 4.`)
  }
  const { platform } = options
  const variant = options.variant ? semantic.variants.find((candidate) => candidate.key === options.variant) : undefined
  if (options.variant && !variant) throw new Error(`${semantic.id} has no variant ${options.variant}; it defines ${semantic.variants.map((v) => v.key).join(', ')}.`)

  const implementations = implementationsOf(graph, semantic)
  const component = implementations.find((candidate) => candidate.platform === platform)
  const points = component ? graph.ofKind('extension-point').filter((point) => point.platformComponentId === component.id) : []
  const intents = graph
    .linksFrom(semantic.id)
    .filter((link) => link.relation === 'serves' && countsForReadiness(link) && link.to)
    .map((link) => graph.get(link.to!))
    .filter((record): record is Intent => record?.kind === 'intent')

  const tokenSources = [semantic.id, ...(component ? [component.id] : []), ...points.map((point) => point.id)]
  const tokens = tokenSources.flatMap((from) =>
    graph
      .linksFrom(from)
      .filter((link) => link.relation === 'uses-token' && countsForReadiness(link) && link.to)
      .map((link) => graph.get(link.to!))
      .filter((record): record is Token => record?.kind === 'token')
      .map((token) => ({ id: token.id, path: token.path, type: token.type, from })),
  )

  const records = graph
    .ofKind('contract-conflict')
    .filter((conflict) => conflict.targetId === semantic.id || (component !== undefined && conflict.sides.some((side) => side.recordId === component.id)))
    .filter((conflict) => !conflict.platform || conflict.platform === platform)
    .filter((conflict) => !variant || !conflict.variant || conflict.variant === variant.key)
    .sort((a, b) => (a.status === b.status ? a.id.localeCompare(b.id) : a.status === 'open' ? -1 : 1))

  const subjects = new Set([semantic.id, ...(component ? [component.id] : []), ...points.map((point) => point.id), ...intents.map((intent) => intent.id)])
  const evidence = graph
    .ofKind('evidence')
    .filter((item) => item.subjectIds.some((id) => subjects.has(id)))
    .filter((item) => !item.platform || item.platform === platform)
    .sort((a, b) => a.id.localeCompare(b.id))

  const mappings = component ? component.variants.filter((mapping) => !variant || mapping.semanticVariant === variant.key) : []
  const acceptance = [
    ...intents.map((intent) => `${intent.title}: ${intent.statement}`),
    ...(semantic.rules ?? []).map((rule) => rule.statement),
  ]
  if (!component) acceptance.push(`No ${platform} component implements ${semantic.title} yet.`)
  for (const mapping of mappings.filter((candidate) => candidate.mapping === 'none')) {
    acceptance.push(`${platform} has no equivalent for ${mapping.semanticVariant}${mapping.note ? ` (${mapping.note.replace(/\.$/, '')})` : ''}.`)
  }
  for (const record of records) {
    const owners = record.owners.map((owner) => `${owner.role} ${owner.who}`).join(', ')
    acceptance.push(
      record.resolution
        ? `Follow the decision on ${record.title}: ${record.resolution.rationale}`
        : `${record.title} is open and needs a decision from ${owners} before this is built.`,
    )
  }
  if (!evidence.some((item) => (item.tier === 'automated' || item.tier === 'physical-device') && item.outcome === 'pass')) {
    acceptance.push(`No automated or device evidence on ${platform} yet; static analysis shows what the source says, not how it behaves.`)
  }

  return {
    target: { id: semantic.id, title: semantic.title, purpose: semantic.purpose },
    platform,
    ...(variant ? { variant } : {}),
    ids: [semantic.id, ...(component ? [component.id] : []), ...points.map((point) => point.id)],
    intents: intents.map(({ id, title, category, statement }) => ({ id, title, category, statement })),
    states: semantic.states,
    slots: semantic.slots ?? [],
    rules: semantic.rules ?? [],
    ...(component
      ? {
          implementation: {
            id: component.id,
            title: component.title,
            package: component.library.package,
            symbol: component.symbol,
            ...(component.defaultVariant ? { defaultVariant: component.defaultVariant } : {}),
            mappings,
          },
        }
      : {}),
    otherPlatforms: implementations
      .filter((candidate) => candidate.platform !== platform)
      .flatMap((candidate) =>
        (variant ? candidate.variants.filter((mapping) => mapping.semanticVariant === variant.key) : []).map((mapping) => ({
          platform: candidate.platform,
          id: candidate.id,
          mapping: mapping.mapping,
          ...(mapping.expression ? { expression: mapping.expression } : {}),
        })),
      ),
    tokens,
    extensionPoints: points.map(({ id, mechanism, name, expresses }) => ({ id, mechanism, name, expresses })),
    records: records.map(({ id, title, status, classification, alignment, summary, owners, resolution }) => ({
      id,
      title,
      status,
      classification,
      alignment,
      summary,
      owners,
      ...(resolution ? { resolution } : {}),
    })),
    evidence: evidence.map(({ id, title, tier, method, outcome, finding }) => ({ id, title, tier, method, outcome, ...(finding ? { finding } : {}) })),
    acceptance,
  }
}

/** Platform components with a declared or observed `implements` link to the semantic component. */
export function implementationsOf(graph: Graph, semantic: SemanticComponent): PlatformComponent[] {
  return graph
    .linksTo(semantic.id)
    .filter((link) => link.relation === 'implements' && countsForReadiness(link))
    .map((link) => graph.get(link.from))
    .filter((record): record is PlatformComponent => record?.kind === 'platform-component')
    .sort((a, b) => a.id.localeCompare(b.id))
}

/** The work order as Markdown, for a ticket or a terminal. */
export function renderWorkOrder(order: WorkOrder): string {
  const lines: string[] = []
  const title = order.variant ? `${order.target.title}, ${order.variant.title}, on ${order.platform}` : `${order.target.title} on ${order.platform}`
  lines.push(`# Work order: ${title}`, '', order.target.purpose, '')
  lines.push('## IDs to put in code', '', ...order.ids.map((id) => `- \`${id}\``))
  if (order.variant) lines.push(`- Variant key \`${order.variant.key}\``)
  lines.push('')
  section('Intent', order.intents.map((intent) => `${intent.title} (${intent.category}): ${intent.statement} \`${intent.id}\``))
  section('States', [order.states.join(', ')])
  if (order.slots.length > 0) section('Slots', [order.slots.join(', ')])
  if (order.rules.length > 0) section('Contract rules', order.rules.map((rule) => `${rule.statement} (\`${rule.key}\`)`))
  const impl = order.implementation
  section(
    `Mapping on ${order.platform}`,
    impl
      ? [
          `${impl.title}: \`${impl.symbol}\` from \`${impl.package}\` (\`${impl.id}\`)`,
          ...(impl.defaultVariant ? [`Renders ${impl.defaultVariant} when no variant is given.`] : []),
          ...impl.mappings.map((mapping) => `${mapping.semanticVariant}: ${mapping.mapping}${mapping.expression ? ` as \`${mapping.expression}\`` : ''}${mapping.note ? `. ${mapping.note}` : ''}`),
        ]
      : [`No ${order.platform} implementation.`],
  )
  if (order.otherPlatforms.length > 0) {
    section('Other platforms', order.otherPlatforms.map((other) => `${other.platform}: ${other.mapping}${other.expression ? ` as \`${other.expression}\`` : ''}`))
  }
  section('Tokens', order.tokens.length > 0 ? order.tokens.map((token) => `\`${token.path}\` (${token.type})`) : [`No tokens linked on ${order.platform}.`])
  section(
    'Extension points',
    order.extensionPoints.length > 0
      ? order.extensionPoints.map((point) => `${point.mechanism} \`${point.name}\` expresses ${point.expresses.join(', ')} (\`${point.id}\`)`)
      : ['None recorded.'],
  )
  section(
    'Records',
    order.records.length > 0
      ? order.records.map((record) => {
          const owners = record.owners.map((owner) => `${owner.role} ${owner.who}`).join(', ')
          const decided = record.resolution
            ? ` Decided: ${record.resolution.outcome} by ${record.resolution.decidedBy.role} ${record.resolution.decidedBy.who}. ${record.resolution.rationale}${record.resolution.revisitTrigger ? ` Revisit when: ${record.resolution.revisitTrigger}` : ''}`
            : ''
          return `**${record.status}** ${record.title}: ${record.summary} Classification ${record.classification}, ${record.alignment}. Owners: ${owners}. (\`${record.id}\`)${decided}`
        })
      : ['None.'],
  )
  section(
    'Evidence',
    order.evidence.length > 0
      ? order.evidence.map((item) => `${item.tier} / ${item.method} / ${item.outcome}: ${item.finding ?? item.title} (\`${item.id}\`)`)
      : ['None.'],
  )
  section('Acceptance', order.acceptance)
  return lines.join('\n')

  function section(heading: string, items: string[]) {
    lines.push(`## ${heading}`, '', ...items.map((item) => `- ${item}`), '')
  }
}
