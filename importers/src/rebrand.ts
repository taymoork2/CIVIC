import type { CollaborationRecord, ComponentInstance, ContractConflict, Decision, Graph, Override, Owner, Platform, PlatformComponent, Role } from '../../graph/src/index.ts'
import type { TokenChange } from './dtcg.ts'

// A rebrand is a token release (decision 0012). Its blast radius follows links already in the
// graph: a changed token, the platform components that use it, the semantic component they
// implement, every product instance of it and the screen it's on. What doesn't follow is
// listed as a hidden override: a literal on a property a changed token sets, and a fork,
// whose styles aren't the library's. Deterministic, read-only, and no model calls (D30).

export interface RebrandOptions {
  /**
   * Which token sets which property of a semantic component, read from the component's style
   * source, such as `{ 'semantic:card': { 'corner-radius': 'borderRadiusMedium' } }`.
   */
  propertyTokens?: Record<string, Record<string, string>>
  /** The platform whose tokens each design library file's variables follow, by file. */
  designLibraries?: Record<string, Platform>
}

/** One changed token and how far it reaches. */
export interface TokenReach {
  change: TokenChange
  /** Platform components whose styles read the token (`uses-token`). */
  components: string[]
  /** The semantic components they implement. */
  semantics: string[]
  /** Product instances that follow the token on their own. */
  instances: string[]
  /** The screens those instances are on. */
  screens: string[]
}

export type HiddenAction = 'replace-literal' | 'keep-with-exception' | 'reattach' | 'confirm-fork'

/** A product instance the rebrand doesn't reach. */
export interface HiddenOverride {
  instance: ComponentInstance
  /** A literal on a property a changed token sets, or a fork of the component. */
  reason: 'literal' | 'fork'
  /** The local-style override holding the literal, or the fork's detach override when there is one. */
  override?: Override
  /** The changed tokens this instance misses. */
  tokens: TokenChange[]
  /** The platform whose tokens the instance would follow. */
  platform: Platform
  action: HiddenAction
  /** A decision already made on the override, if any. */
  decision?: Decision
}

/** A platform component that implements a reached semantic component but whose styles weren't read. */
export interface UnreadComponent {
  id: string
  title: string
  platform: Platform
  semanticId: string
}

export interface Rebrand {
  changes: TokenChange[]
  reach: TokenReach[]
  /** Changed tokens no component in the graph reads. */
  unread: TokenChange[]
  notRead: UnreadComponent[]
  /** Literals and confirmed forks: each becomes an open divergence. */
  hidden: HiddenOverride[]
  /** Inferred forks: a person confirms each before it counts (decision 0011). */
  unconfirmed: HiddenOverride[]
}

const px = (value: unknown): number | undefined => {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && /^-?\d+(\.\d+)?px$/.test(value)) return Number.parseFloat(value)
  return undefined
}

/** Whether a literal override holds the same value as a token value, such as `8` and `8px`. */
function sameValue(literal: unknown, token: unknown): boolean {
  const a = px(literal)
  const b = px(token)
  if (a !== undefined && b !== undefined) return a === b
  return JSON.stringify(literal) === JSON.stringify(token)
}

const sorted = (values: Iterable<string>) => [...new Set(values)].sort()

/** Reads a token release's blast radius and hidden overrides from the graph. */
export function rebrandImpact(graph: Graph, changes: TokenChange[], options: RebrandOptions = {}): Rebrand {
  const components = graph.ofKind('platform-component')
  const instances = graph.ofKind('component-instance')
  const overrides = graph.ofKind('override')
  const conflicts = graph.ofKind('contract-conflict')
  const decisions = graph.ofKind('decision')
  const implemented = (component: PlatformComponent) => graph.linksFrom(component.id).flatMap((link) => (link.relation === 'implements' && link.to ? [link.to] : []))
  const readsTokens = (component: PlatformComponent) => graph.linksFrom(component.id).some((link) => link.relation === 'uses-token')

  /** The platform component an instance's styles come from, when it is one whose styles were read. */
  const follows = (instance: ComponentInstance, component: PlatformComponent) => {
    if (!instance.library || !implemented(component).includes(instance.semanticId)) return false
    if (instance.origin === 'code') return instance.library.file === component.library.package
    return options.designLibraries?.[instance.library.file] === component.platform
  }
  const decisionOn = (override: Override | undefined): Decision | undefined => {
    if (!override) return undefined
    const conflict = conflicts.find((candidate: ContractConflict) => candidate.sides.some((side) => side.recordId === override.id))
    return conflict && decisions.find((decision) => decision.conflictId === conflict.id)
  }

  const reach: TokenReach[] = []
  const unread: TokenChange[] = []
  const reached = new Set<string>()
  for (const change of changes) {
    const readers = components.filter((component) => graph.linksFrom(component.id).some((link) => link.relation === 'uses-token' && link.to === `token:${change.path}`))
    if (readers.length === 0) {
      unread.push(change)
      continue
    }
    const pinned = (instance: ComponentInstance) =>
      overrides.some((override) => override.instanceId === instance.id && override.change === 'local-style' && options.propertyTokens?.[instance.semanticId]?.[override.property] === change.path)
    const following = instances.filter((instance) => !instance.fork && !pinned(instance) && readers.some((component) => follows(instance, component)))
    for (const component of readers) for (const semantic of implemented(component)) reached.add(semantic)
    reach.push({
      change,
      components: sorted(readers.map((component) => component.id)),
      semantics: sorted(readers.flatMap(implemented)),
      instances: sorted(following.map((instance) => instance.id)),
      screens: sorted(following.map((instance) => instance.placedOn)),
    })
  }

  const notRead: UnreadComponent[] = components
    .filter((component) => !readsTokens(component))
    .flatMap((component) => implemented(component).filter((semantic) => reached.has(semantic)).map((semanticId) => ({ id: component.id, title: component.title, platform: component.platform, semanticId })))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  const hidden: HiddenOverride[] = []
  const unconfirmed: HiddenOverride[] = []
  for (const instance of instances) {
    const readers = components.filter((component) => readsTokens(component) && follows(instance, component))
    if (readers.length === 0) continue
    const platform = readers[0]!.platform
    const missed = reach.filter((token) => token.components.some((id) => readers.some((component) => component.id === id))).map((token) => token.change)
    if (instance.fork) {
      if (missed.length === 0) continue
      const override = overrides.find((candidate) => candidate.instanceId === instance.id && candidate.change === 'detach')
      const entry: HiddenOverride = { instance, reason: 'fork', override, tokens: missed, platform, action: instance.fork.status === 'confirmed' ? 'reattach' : 'confirm-fork', decision: decisionOn(override) }
      ;(instance.fork.status === 'confirmed' ? hidden : unconfirmed).push(entry)
      continue
    }
    const properties = options.propertyTokens?.[instance.semanticId] ?? {}
    for (const override of overrides.filter((candidate) => candidate.instanceId === instance.id && candidate.change === 'local-style')) {
      const path = properties[override.property]
      const change = path ? missed.find((token) => token.path === path) : undefined
      if (!change) continue
      const decision = decisionOn(override)
      const replace = decision?.outcome === 'update-design' || sameValue(override.value, change.before) || sameValue(override.value, change.after)
      hidden.push({ instance, reason: 'literal', override, tokens: [change], platform, action: replace ? 'replace-literal' : 'keep-with-exception', decision })
    }
  }
  return { changes, reach, unread, notRead, hidden, unconfirmed }
}

const ACTIONS: Record<HiddenAction, string> = {
  'replace-literal': 'Replace the literal with the token',
  'keep-with-exception': 'Keep it with a recorded exception',
  reattach: 'Re-attach the fork to the library component',
  'confirm-fork': 'Confirm whether this is a fork, then re-attach it',
}

export const rebrandAction = (action: HiddenAction) => ACTIONS[action]

const show = (value: unknown) => (value === undefined ? 'none' : typeof value === 'string' ? value : JSON.stringify(value))

function hiddenSummary(entry: HiddenOverride, brand: string): string {
  const decided = entry.decision ? ` Already decided: ${entry.decision.title} (${entry.decision.alignment}); until that lands, the rebrand doesn't reach it.` : ''
  if (entry.reason === 'fork') {
    const names = entry.tokens.map((token) => token.path)
    return `${entry.instance.title} is a copy of the library component, so CIVIC can't tell whether it follows ${brand}. It misses ${names.length} changed token${names.length === 1 ? '' : 's'} the library's styles read (${names.slice(0, 3).join(', ')}${names.length > 3 ? ', …' : ''}). Suggested: ${rebrandAction(entry.action).toLowerCase()}.${decided}`
  }
  const token = entry.tokens[0]!
  return `${entry.instance.title} sets ${entry.override!.property} to ${show(entry.override!.value)}, which ${token.path} sets. ${brand} moves ${token.path} from ${show(token.before)} to ${show(token.after)}, and the literal stays. Suggested: ${rebrandAction(entry.action).toLowerCase()}.${decided}`
}

/**
 * Each hidden override as an open divergence (decision 0012, point 3): owned by the product
 * team that owns the instance, raised by the design system's maintainers.
 */
export function rebrandDivergences(rebrand: Rebrand, options: { brand: string; slug: string; raisedBy: Owner; at: string }): CollaborationRecord[] {
  return rebrand.hidden.map((entry) => {
    const perspectives: Role[] = entry.instance.origin === 'code' ? ['design', 'engineering'] : ['design', 'design-engineering']
    return {
      id: `collab:divergence.${options.slug}.${entry.instance.id.slice('instance:'.length)}${entry.reason === 'literal' ? `.${entry.override!.property}` : ''}`,
      kind: 'collaboration',
      title: entry.reason === 'fork' ? `${options.brand} doesn't reach the forked ${entry.instance.title}` : `${options.brand} doesn't reach ${entry.instance.title}'s ${entry.override!.property}`,
      type: 'divergence',
      subjectIds: [entry.instance.id, ...(entry.override ? [entry.override.id] : []), ...entry.tokens.map((token) => `token:${token.path}`)],
      platform: entry.platform,
      summary: hiddenSummary(entry, options.brand),
      perspectives,
      owners: entry.instance.owners ?? [],
      raisedBy: options.raisedBy,
      at: options.at,
      status: 'open',
    }
  })
}

/** The migration table (decision 0012, point 4), as Markdown. */
export function renderRebrand(graph: Graph, rebrand: Rebrand, options: { title: string; brand: string; from: string; to: string }): string {
  const title = (id: string) => graph.get(id)?.title ?? id
  const lines: string[] = [`# ${options.title}`, '']
  const followers = new Set(rebrand.reach.flatMap((token) => token.instances))
  const screens = new Set(rebrand.reach.flatMap((token) => token.screens))
  lines.push(
    `${options.brand} is a token release: ${options.from} to ${options.to}. ${rebrand.changes.length} tokens change, and the components in this graph read ${rebrand.reach.length} of them.`,
    '',
    '## Blast radius',
    '',
    '| Level | Count |',
    '|---|---|',
    `| Changed tokens | ${rebrand.changes.length} |`,
    `| Read by a component here | ${rebrand.reach.length} |`,
    `| Platform components that read them | ${new Set(rebrand.reach.flatMap((token) => token.components)).size} |`,
    `| Semantic components | ${new Set(rebrand.reach.flatMap((token) => token.semantics)).size} |`,
    `| Product instances that follow on their own | ${followers.size} |`,
    `| Screens they're on | ${screens.size} |`,
    `| Hidden overrides (open divergences) | ${rebrand.hidden.length} |`,
    `| Forks awaiting confirmation | ${rebrand.unconfirmed.length} |`,
    `| Platform components not read | ${rebrand.notRead.length} |`,
    '',
    '## Migration table',
    '',
    'A component\'s instances are reached by every token its styles read, whatever size or variant they use: the graph doesn\'t record an instance\'s size.',
    '',
    '| Token | Before | After | Components | Instances reached | Hidden overrides |',
    '|---|---|---|---|---|---|',
  )
  for (const token of rebrand.reach) {
    const hidden = [...rebrand.hidden, ...rebrand.unconfirmed].filter((entry) => entry.tokens.some((change) => change.path === token.change.path))
    lines.push(
      `| \`${token.change.path}\` | ${show(token.change.before)} | ${show(token.change.after)} | ${token.components.map(title).join('; ')} | ${token.instances.length === 0 ? 'none' : token.instances.map(title).join('; ')} | ${hidden.length === 0 ? 'none' : hidden.map((entry) => entry.instance.title).join('; ')} |`,
    )
  }
  lines.push('', '## Hidden overrides', '')
  if (rebrand.hidden.length + rebrand.unconfirmed.length === 0) lines.push('None: every instance follows the rebrand.')
  else {
    lines.push('| Instance | Screen | Why it doesn\'t follow | Suggested action | Already decided |', '|---|---|---|---|---|')
    for (const entry of [...rebrand.hidden, ...rebrand.unconfirmed]) {
      const why = entry.reason === 'fork' ? `${entry.instance.fork!.status === 'confirmed' ? 'Confirmed' : 'Inferred'} fork; misses ${entry.tokens.length} changed tokens` : `Literal ${entry.override!.property} ${show(entry.override!.value)} over \`${entry.tokens[0]!.path}\` (${show(entry.tokens[0]!.before)} to ${show(entry.tokens[0]!.after)})`
      lines.push(`| ${entry.instance.title} | ${title(entry.instance.placedOn)} | ${why} | ${rebrandAction(entry.action)} | ${entry.decision ? `${entry.decision.title} (${entry.decision.alignment})` : 'No'} |`)
    }
    lines.push('', 'Each confirmed hidden override is an open divergence in `graph.json`, owned by the product team and raised by the design system\'s maintainers. The product owner decides; CIVIC never edits a design or code file. An inferred fork counts once a person confirms it (decision 0011).')
  }
  lines.push('', '## Not read', '')
  if (rebrand.notRead.length === 0) lines.push('Every platform component of a reached semantic component was read.')
  else {
    lines.push('These implement a component the rebrand reaches, but their styles weren\'t read here, so their blast radius is unknown. They are never counted as unaffected.', '')
    for (const component of rebrand.notRead) lines.push(`- ${component.title} (${component.platform}), implementing ${title(component.semanticId)}`)
  }
  if (rebrand.unread.length > 0) lines.push('', `${rebrand.unread.length} changed tokens are read by no component in this graph.`)
  return `${lines.join('\n')}\n`
}
