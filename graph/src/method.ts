import type { Graph } from './graph.ts'
import { ROLES, type GraphRecord, type Owner } from './schema.ts'

// Design methodologies as profiles over a neutral graph (decision 0014). A team declares the
// methodology it follows in a `civic.method/0` file: its tiers in order, which tier may contain
// which, which token tier each kind of target may read, and where each of its targets sits. The
// graph gains no tier names: tiers are a reading of what it already records (what contains what,
// which tokens a component reads). Owners place targets; CIVIC may suggest a tier from
// composition, and a suggestion counts only once an owner declares it. Every finding is
// advisory unless a team makes it blocking in civic.check.json. With no profile declared,
// nothing here runs. Deterministic, read-only, no model calls (D30).

export const METHOD_SCHEMA = 'civic.method/0'

/**
 * What a tier can hold, in the graph's own terms. `components` are semantic components (a
 * library's) and product `component` targets (decision 0011); `screens` are screen targets;
 * `tokens` are tokens. States and surfaces sit inside screens, so composition looks through them.
 */
export const TIER_HOLDS = ['components', 'screens', 'tokens'] as const
export type TierHolds = (typeof TIER_HOLDS)[number]

/** The kinds of target a token rule may start from when it doesn't name a tier: a component, or one platform's implementation of it. */
export const REFERENCE_SOURCES = ['components', 'implementations'] as const

export interface MethodTier {
  /** Stable within the profile, such as `molecule`. Placements and rules name tiers by key. */
  key: string
  /** The word the team uses in its own vocabulary, shown in findings. */
  title: string
  holds: TierHolds
  description?: string
}

/** Which token tiers a kind of target, or a tier, may read. */
export interface TokenRule {
  /** A tier key, or `components` or `implementations` for every target of that kind. A tier's own rule wins. */
  from: string
  may: string[]
}

/** Where the owners put targets: by ID, or for tokens by path prefix. A person declares it, never CIVIC. */
export interface TierPlacement {
  tier: string
  ids?: string[]
  /** Tokens only: every token whose DTCG path starts with one of these, such as `colorPalette`. */
  tokenPrefixes?: string[]
  declaredBy: Owner
  note?: string
}

export interface MethodProfile {
  schema: typeof METHOD_SCHEMA
  /** The profile's own name, such as `shop.atomic`. Findings keep two profiles apart by it. */
  id: string
  title: string
  /** A bundled profile this one follows: its tiers and rules apply unless this file gives its own. */
  extends?: string
  about?: string
  link?: string
  /** Smallest first. */
  tiers?: MethodTier[]
  /** For each tier key, the tiers it may contain. A tier left out may contain anything. */
  contains?: Record<string, string[]>
  references?: TokenRule[]
  placements?: TierPlacement[]
  /** Who declared the profile; told of every finding with the target's own owners. */
  owners?: Owner[]
  note?: string
}

/** A profile with its bundled base applied: tiers are always present. */
export interface ResolvedProfile extends MethodProfile {
  tiers: MethodTier[]
}

/** Applies the bundled profile a team's file extends. `bundled` looks a bundled profile up by its ID. */
export function resolveProfile(profile: MethodProfile, bundled: (id: string) => MethodProfile | undefined): ResolvedProfile {
  const base = profile.extends ? bundled(profile.extends) : undefined
  if (profile.extends && !base) throw new Error(`${profile.id} extends ${profile.extends}, which is not a bundled profile.`)
  if (base?.extends) throw new Error(`${profile.extends} extends another profile; a bundled profile stands alone.`)
  const merged = {
    ...profile,
    tiers: profile.tiers ?? base?.tiers ?? [],
    ...(profile.contains ?? base?.contains ? { contains: profile.contains ?? base!.contains! } : {}),
    ...(profile.references ?? base?.references ? { references: profile.references ?? base!.references! } : {}),
    ...(!profile.link && base?.link ? { link: base.link } : {}),
  }
  const errors = profileErrors(merged)
  if (errors.length > 0) throw new Error(`${profile.id} is not a valid ${METHOD_SCHEMA} profile:\n- ${errors.join('\n- ')}`)
  return merged
}

/** What is wrong with a resolved profile on its own, before any graph is read. */
export function profileErrors(profile: ResolvedProfile): string[] {
  const errors: string[] = []
  if (profile.schema !== METHOD_SCHEMA) errors.push(`schema must be ${METHOD_SCHEMA}`)
  if (!profile.id || !profile.title) errors.push('a profile needs an id and a title')
  if (profile.tiers.length === 0) errors.push('a profile needs at least one tier')
  const tiers = new Map(profile.tiers.map((tier) => [tier.key, tier]))
  if (tiers.size !== profile.tiers.length) errors.push('tier keys must be unique')
  for (const tier of profile.tiers) if (!(TIER_HOLDS as readonly string[]).includes(tier.holds)) errors.push(`tier ${tier.key} holds ${tier.holds}; use one of ${TIER_HOLDS.join(', ')}`)
  for (const [key, allowed] of Object.entries(profile.contains ?? {})) {
    if (!tiers.has(key)) errors.push(`contains names an unknown tier: ${key}`)
    else if (tiers.get(key)!.holds === 'tokens') errors.push(`contains: ${key} holds tokens, which contain nothing`)
    for (const inner of allowed) if (!tiers.has(inner) || tiers.get(inner)!.holds === 'tokens') errors.push(`contains: ${key} may contain ${inner}, which is not a component or screen tier`)
  }
  for (const rule of profile.references ?? []) {
    if (!(REFERENCE_SOURCES as readonly string[]).includes(rule.from) && (!tiers.has(rule.from) || tiers.get(rule.from)!.holds !== 'components')) errors.push(`references: ${rule.from} is neither ${REFERENCE_SOURCES.join(' nor ')} nor a component tier`)
    for (const tier of rule.may) if (tiers.get(tier)?.holds !== 'tokens') errors.push(`references: ${rule.from} may read ${tier}, which is not a token tier`)
  }
  for (const placement of profile.placements ?? []) {
    const tier = tiers.get(placement.tier)
    if (!tier) errors.push(`a placement names an unknown tier: ${placement.tier}`)
    if (!placement.declaredBy || !(ROLES as readonly string[]).includes(placement.declaredBy.role) || !placement.declaredBy.who) errors.push(`the ${placement.tier} placement needs declaredBy, the owner who placed it`)
    if ((placement.ids ?? []).length + (placement.tokenPrefixes ?? []).length === 0) errors.push(`the ${placement.tier} placement names no IDs or token prefixes`)
    if (placement.tokenPrefixes && tier && tier.holds !== 'tokens') errors.push(`the ${placement.tier} placement uses token prefixes, but ${placement.tier} holds ${tier.holds}`)
  }
  return errors
}

/** What a record could be placed as, or nothing when no tier can hold it. */
export function holdsOf(record: GraphRecord | undefined): TierHolds | undefined {
  if (!record) return undefined
  if (record.kind === 'semantic-component') return 'components'
  if (record.kind === 'token') return 'tokens'
  if (record.kind === 'target' && record.scale === 'component') return 'components'
  if (record.kind === 'target' && record.scale === 'screen') return 'screens'
  return undefined
}

export interface TierOf {
  tier: string
  /** `declared` by an owner's placement, or by the `profile`'s rule when only one tier holds that kind. */
  by: 'declared' | 'profile'
  declaredBy?: Owner
}

export const METHOD_GAP_KINDS = ['no-tier', 'tier-composition', 'token-tier'] as const
export type MethodGapKind = (typeof METHOD_GAP_KINDS)[number]

export interface MethodGap {
  kind: MethodGapKind
  subjectId: string
  /** The profile, and what keeps two gaps on one subject apart. */
  detail: string
  summary: string
  owners: Owner[]
  /** `no-tier` only: the tier CIVIC suggests from composition, which counts once an owner declares it. */
  suggested?: string
}

export interface MethodCheck {
  profile: ResolvedProfile
  /** Every record the profile's tiers can hold, with its tier when it has one. */
  placed: { id: string; holds: TierHolds; tier?: TierOf }[]
  gaps: MethodGap[]
  /** Placements that don't fit this graph: an unknown ID, a record no tier of that kind can hold, or one record in two tiers. */
  errors: string[]
  /** Denominators for the gate's measures. */
  counts: { held: number; containments: number; references: number; pastTier: number }
}

/** Checks one graph against one resolved profile: placement, composition and token tiers. */
export function methodCheck(graph: Graph, profile: ResolvedProfile): MethodCheck {
  const tierByKey = new Map(profile.tiers.map((tier) => [tier.key, tier]))
  const heldKinds = new Set(profile.tiers.map((tier) => tier.holds))
  const errors: string[] = []
  const tiers = new Map<string, TierOf>()
  const place = (id: string, tier: string, declaredBy: Owner) => {
    const before = tiers.get(id)
    if (before && before.tier !== tier) errors.push(`${id} is placed in both ${before.tier} and ${tier}`)
    else tiers.set(id, { tier, by: 'declared', declaredBy })
  }
  for (const placement of profile.placements ?? []) {
    const tier = tierByKey.get(placement.tier)!
    for (const id of placement.ids ?? []) {
      const holds = holdsOf(graph.get(id))
      if (!graph.get(id)) errors.push(`${placement.tier} names ${id}, which is not in the graph`)
      else if (holds !== tier.holds) errors.push(`${placement.tier} holds ${tier.holds}, but ${id} is ${holds ?? 'not something a tier holds'}`)
      else place(id, tier.key, placement.declaredBy)
    }
    for (const prefix of placement.tokenPrefixes ?? []) {
      const matched = graph.ofKind('token').filter((token) => token.path.startsWith(prefix))
      if (matched.length === 0) errors.push(`${placement.tier}'s token prefix ${prefix} matches no token in the graph`)
      for (const token of matched) place(token.id, tier.key, placement.declaredBy)
    }
  }
  // A kind only one tier holds needs no placement: the profile's rule says where it goes.
  for (const holds of heldKinds) {
    const only = profile.tiers.filter((tier) => tier.holds === holds)
    if (only.length !== 1) continue
    for (const record of graph.document.records) if (holdsOf(record) === holds && !tiers.has(record.id)) tiers.set(record.id, { tier: only[0]!.key, by: 'profile' })
  }

  const placed = graph.document.records.flatMap((record) => {
    const holds = holdsOf(record)
    return holds && heldKinds.has(holds) ? [{ id: record.id, holds, ...(tiers.has(record.id) ? { tier: tiers.get(record.id)! } : {}) }] : []
  })
  const gaps: MethodGap[] = []
  const counts = { held: placed.length, containments: 0, references: 0, pastTier: 0 }
  const titleOf = (id: string) => graph.get(id)?.title ?? id
  const ownersOf = (id: string) => [...(graph.get(id)?.owners ?? []), ...(profile.owners ?? [])]
  const tierTitle = (key: string) => tierByKey.get(key)?.title ?? key
  const article = (word: string) => (/^[aeiou]/i.test(word) ? `an ${word}` : `a ${word}`)
  const plural = (word: string) => (word.endsWith('y') ? `${word.slice(0, -1)}ies` : `${word}s`)
  const list = (words: string[]) => (words.length <= 1 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`)

  // 1. Composition: each tiered component or screen against the tiers its rule lets it contain.
  const contents = new Map<string, string[]>()
  for (const { id, tier } of placed) {
    if (!tier || tierByKey.get(tier.tier)!.holds === 'tokens') continue
    const inner = containedBy(graph, id, heldKinds)
    contents.set(id, inner)
    const allowed = profile.contains?.[tier.tier]
    if (!allowed) continue
    for (const child of inner) {
      const childTier = tiers.get(child)
      if (!childTier) continue
      counts.containments += 1
      if (allowed.includes(childTier.tier)) continue
      const may = allowed.length === 0 ? 'no other component' : `only ${list(allowed.map((key) => plural(tierTitle(key))))}`
      gaps.push({
        kind: 'tier-composition',
        subjectId: id,
        detail: `${profile.id} ${child}`,
        summary: `${titleOf(id)} is ${article(tierTitle(tier.tier))} and contains ${titleOf(child)}, ${article(tierTitle(childTier.tier))}; ${profile.title} lets ${article(tierTitle(tier.tier))} contain ${may}. Its owners re-tier one of them or change the profile's rule.`,
        owners: [...ownersOf(id), ...(graph.get(child)?.owners ?? [])],
      })
    }
  }

  // 2. Targets the profile's tiers hold that nobody has placed. CIVIC suggests a tier only where
  // the graph records what the target contains: the lowest one whose rule allows all of it.
  for (const { id, holds, tier } of placed) {
    if (tier) continue
    const record = graph.get(id)!
    const options = profile.tiers.filter((candidate) => candidate.holds === holds)
    let suggested: string | undefined
    let why: string
    if (record.kind === 'target') {
      const inner = contents.get(id) ?? containedBy(graph, id, heldKinds)
      const untiered = inner.filter((child) => !tiers.has(child))
      const innerTiers = [...new Set(inner.flatMap((child) => (tiers.has(child) ? [tiers.get(child)!.tier] : [])))]
      suggested = untiered.length > 0 ? undefined : options.find((candidate) => innerTiers.every((key) => !profile.contains?.[candidate.key] || profile.contains[candidate.key]!.includes(key)))?.key
      why = untiered.length > 0
        ? `CIVIC can't suggest one until ${list(untiered.map(titleOf))}, which it contains, ${untiered.length === 1 ? 'has a tier' : 'have tiers'}.`
        : suggested
          ? `CIVIC suggests ${tierTitle(suggested)}, the lowest tier that may contain ${innerTiers.length === 0 ? 'it, since it contains no other component' : `the ${list(innerTiers.map(tierTitle))} it contains`}; it counts once an owner declares it.`
          : `No tier may contain the ${list(innerTiers.map(tierTitle))} it contains, so CIVIC suggests none.`
    } else {
      why = record.kind === 'token' ? 'Its owners place it by ID or by a path prefix.' : "CIVIC can't suggest one: the graph doesn't record what a library component contains."
    }
    gaps.push({
      kind: 'no-tier',
      subjectId: id,
      detail: profile.id,
      summary: `${titleOf(id)} has no ${profile.title} tier (${list(options.map((option) => option.title))}). ${why}`,
      owners: ownersOf(id),
      ...(suggested ? { suggested } : {}),
    })
  }

  // 3. Token tiers: what each component or implementation reads, against the tiers its rule allows.
  if (profile.references && profile.references.length > 0) {
    const reads = new Map<string, { source: string; tokens: string[] }>()
    for (const link of graph.document.links) {
      if (link.relation !== 'uses-token' || !link.to) continue
      const from = graph.get(link.from)
      const source = from?.kind === 'extension-point' ? from.platformComponentId : link.from
      const entry = reads.get(source) ?? { source, tokens: [] }
      if (!entry.tokens.includes(link.to)) entry.tokens.push(link.to)
      reads.set(source, entry)
    }
    for (const { source, tokens } of [...reads.values()].sort((a, b) => a.source.localeCompare(b.source))) {
      const record = graph.get(source)
      const kind = record?.kind === 'platform-component' ? 'implementations' : 'components'
      const rule = profile.references.find((candidate) => candidate.from === tiers.get(source)?.tier) ?? profile.references.find((candidate) => candidate.from === kind)
      if (!rule) continue
      const past = new Map<string, string[]>()
      for (const token of tokens) {
        const tier = tiers.get(token)
        if (!tier) continue
        counts.references += 1
        if (rule.may.includes(tier.tier)) continue
        counts.pastTier += 1
        past.set(tier.tier, [...(past.get(tier.tier) ?? []), token])
      }
      for (const [tier, ids] of past) {
        const names = ids.map((id) => (graph.get(id)?.kind === 'token' ? (graph.get(id) as { path: string }).path : id)).sort()
        gaps.push({
          kind: 'token-tier',
          subjectId: source,
          detail: `${profile.id} ${tier}`,
          summary: `${titleOf(source)} reads ${ids.length} ${plural(tierTitle(tier))} (${names.slice(0, 6).join(', ')}${names.length > 6 ? `, and ${names.length - 6} more` : ''}); ${profile.title} lets ${rule.from === kind ? (kind === 'implementations' ? 'a component implementation' : 'a component') : article(tierTitle(rule.from))} read only ${list(rule.may.map((key) => plural(tierTitle(key))))}. Its owners point it at ${article(tierTitle(rule.may[0]!))}, add one, or change the profile's rule.`,
          owners: ownersOf(source),
        })
      }
    }
  }

  return { profile, placed, gaps: gaps.map((gap) => ({ ...gap, owners: dedupe(gap.owners) })), errors, counts }
}

/**
 * The components and screens a target contains that a tier can hold, looking through states,
 * surfaces and anything else no tier holds. A component instance counts as its semantic component.
 */
function containedBy(graph: Graph, id: string, heldKinds: Set<TierHolds>): string[] {
  const found = new Set<string>()
  const seen = new Set([id])
  const queue = [id]
  while (queue.length > 0) {
    for (const link of graph.linksFrom(queue.shift()!)) {
      if (link.relation !== 'contains' || !link.to || seen.has(link.to)) continue
      seen.add(link.to)
      const record = graph.get(link.to)
      const inner = record?.kind === 'component-instance' ? record.semanticId : link.to
      const holds = holdsOf(graph.get(inner))
      if (holds && heldKinds.has(holds)) found.add(inner)
      else if (record?.kind === 'target') queue.push(link.to)
    }
  }
  return [...found].sort()
}

/** The tier view and the findings as Markdown, in the profile's own vocabulary. */
export function renderMethod(graph: Graph, check: MethodCheck): string {
  const { profile } = check
  const titleOf = (id: string) => graph.get(id)?.title ?? id
  const lines = [`## ${profile.title}${profile.extends ? ` (follows the bundled ${profile.extends} profile)` : ''}`, '']
  if (profile.note) lines.push(profile.note, '')
  lines.push('| Tier | Holds | Placed by owners | By the profile\'s rule | Members |', '|---|---|---|---|---|')
  for (const tier of profile.tiers) {
    const members = check.placed.filter((item) => item.tier?.tier === tier.key)
    const names = members.map((item) => titleOf(item.id)).sort()
    lines.push(`| ${tier.title} | ${tier.holds} | ${members.filter((item) => item.tier!.by === 'declared').length} | ${members.filter((item) => item.tier!.by === 'profile').length} | ${names.slice(0, 8).join(', ')}${names.length > 8 ? `, and ${names.length - 8} more` : ''} |`)
  }
  const sections: [MethodGapKind, string, string][] = [
    ...(profile.contains ? [['tier-composition', 'Composition the tiers don\'t allow', check.counts.containments > 0 ? 'Every tiered target contains only tiers its rule allows.' : 'Nothing to check: no tiered target contains another tiered target in this graph.'] as [MethodGapKind, string, string]] : []),
    ...(profile.references ? [['token-tier', 'Tokens read past their tier', check.counts.references > 0 ? 'Every token a component reads is at a tier its rule allows.' : 'Nothing to check: no component in this graph reads a tiered token.'] as [MethodGapKind, string, string]] : []),
    ['no-tier', 'No tier yet', 'Every target the tiers hold has one.'],
  ]
  for (const [kind, heading, none] of sections) {
    const gaps = check.gaps.filter((gap) => gap.kind === kind)
    lines.push('', `### ${heading}: ${gaps.length}`, '')
    if (gaps.length === 0) lines.push(none)
    for (const gap of gaps) lines.push(`- ${gap.summary} (\`${gap.subjectId}\`)`)
  }
  if (check.errors.length > 0) lines.push('', '### Placements that don\'t fit this graph', '', ...check.errors.map((error) => `- ${error}`))
  return lines.join('\n')
}

function dedupe(owners: Owner[]): Owner[] {
  const seen = new Set<string>()
  return owners.filter((owner) => {
    const key = `${owner.role}|${owner.who}|${owner.platform ?? ''}`
    return !seen.has(key) && Boolean(seen.add(key))
  })
}
