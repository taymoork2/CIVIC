// The CIVIC graph schema, version 0.
//
// A graph document is a plain JSON file: records (the things CIVIC tracks) and links
// (traceable claims between them, each with a status). Importers for any tool write
// these shapes; nothing here knows about Figma, Playwright, Fluent, Laundry or the
// journey engine. The spec sections each type comes from are named in its comment.

export const SCHEMA_VERSION = 'civic.graph/0'

export interface GraphDocument {
  schema: typeof SCHEMA_VERSION
  records: GraphRecord[]
  links: Link[]
}

// ---------------------------------------------------------------------------
// Shared vocabulary

/** Platforms CIVIC models today. Device classes such as TV are not modelled (decision 0006). */
export const PLATFORMS = ['web', 'ios', 'android', 'desktop'] as const
export type Platform = (typeof PLATFORMS)[number]

/** Ownership is stored per role, so one person can hold several roles (D25). */
export const ROLES = ['design', 'design-engineering', 'engineering', 'qa', 'product-management'] as const
export type Role = (typeof ROLES)[number]

export interface Owner {
  role: Role
  /** A team or person handle, as the team's own ownership files name it. */
  who: string
  platform?: Platform
}

/**
 * Where a record or link came from. Every importer fills this in, so a record can always
 * be traced back to the tool, revision and place it was read from.
 */
export interface SourceRef {
  /** The tool the artifact lives in, such as "figma", "github" or "playwright". Free text: importers are pluggable. */
  tool: string
  /** The importer that read it. Free text, so supporting a new tool never changes the schema. */
  importer: string
  /** The exact revision read: a commit, file version, package version or run ID. */
  revision: string
  path?: string
  anchor?: string
  contentHash?: string
}

/**
 * Stable identity (spec: Stable identity and path honesty). A record's ID never changes
 * silently. When a target moves or is renamed, someone re-anchors it explicitly and the
 * old ID is kept here. Nothing is matched automatically to the nearest node.
 */
export interface FormerId {
  id: string
  reason: string
  by: Owner
  at: string
}

/** Spec: Alignment states. Every contract target per platform has exactly one. */
export const ALIGNMENT_STATES = [
  'aligned',
  'approved-adaptation',
  'accepted-limitation',
  'unreviewed-drift',
  'awaiting-adoption',
  'unknown-stale',
] as const
export type AlignmentState = (typeof ALIGNMENT_STATES)[number]

// ---------------------------------------------------------------------------
// Records

interface RecordBase {
  /** Stable ID, `<kind prefix>:<path>`, for example `semantic:button`. See ids.ts. */
  id: string
  title: string
  owners?: Owner[]
  source?: SourceRef
  formerIds?: FormerId[]
}

/** Spec: Artifact graph, Intent group. What must stay true, whatever the platform. */
export interface Intent extends RecordBase {
  kind: 'intent'
  category: 'requirement' | 'business-rule' | 'accessibility-rule'
  statement: string
}

/**
 * A journey, screen, state or surface. Like the journey engine, a target is either
 * expected (declared by a person or manifest) or only discovered in source or by a
 * crawl. Discovered targets need a person to confirm them before they count (D34).
 */
export interface Target extends RecordBase {
  kind: 'target'
  scale: 'journey' | 'screen' | 'state' | 'surface'
  presence: 'expected' | 'discovered'
  platforms?: Platform[]
}

/** A design token, identified by its DTCG path so design and code link on the same string. */
export interface Token extends RecordBase {
  kind: 'token'
  /** DTCG path, for example `colorBrandBackground` or `color.brand.background`. The ID is `token:<path>`. */
  path: string
  /** DTCG `$type`, such as `color` or `dimension`. */
  type: string
}

/** A rule in a component contract. `forbids` makes matching overrides Forbidden by contract. */
export interface ContractRule {
  key: string
  statement: string
  forbids?: OverrideMatch
}

/** Matches an override by property path prefix: `header` matches `header.badge`. */
export interface OverrideMatch {
  property: string
  change?: OverrideChange
}

/** Spec: Component system. The platform-independent purpose and contract. */
export interface SemanticComponent extends RecordBase {
  kind: 'semantic-component'
  purpose: string
  variants: { key: string; title: string }[]
  /** Behavioral states the contract defines, such as `default`, `disabled`, `loading`. */
  states: string[]
  slots?: string[]
  rules?: ContractRule[]
}

/**
 * One platform's implementation of a semantic component (React, SwiftUI, Compose...).
 * Which semantic component it implements is an `implements` link, because that mapping is
 * itself a claim that can be declared, inferred or proposed.
 */
export interface PlatformComponent extends RecordBase {
  kind: 'platform-component'
  platform: Platform
  library: { package: string; version?: string }
  symbol: string
  /** How each semantic variant is expressed here. `none` is a gap CIVIC must show, not hide. */
  variants: VariantMapping[]
}

export interface VariantMapping {
  semanticVariant: string
  mapping: 'exact' | 'closest' | 'none'
  expression?: string
  note?: string
}

/**
 * A supported way to customize a platform component, read from code by an importer:
 * a slot, prop, token, style API or documented theming hook (D29).
 */
export interface ExtensionPoint extends RecordBase {
  kind: 'extension-point'
  platformComponentId: string
  mechanism: 'slot' | 'prop' | 'token' | 'style-api' | 'theme-hook'
  name: string
  /** Semantic property paths this point can express, matched by prefix like OverrideMatch. */
  expresses: string[]
}

/** A use of a library component on a product's screen, in design or in code (D29). */
export interface ComponentInstance extends RecordBase {
  kind: 'component-instance'
  semanticId: string
  variant?: string
  placedOn: string
  product: string
  origin: 'design' | 'code'
  platform?: Platform
}

export const OVERRIDE_CHANGES = ['add-content', 'set-property', 'local-style', 'detach'] as const
export type OverrideChange = (typeof OVERRIDE_CHANGES)[number]

/**
 * A local change to an instance: a detached instance, a changed property or a local style
 * (D29). Whether each platform can express it is a forecast computed by forecast.ts, not
 * stored, so it always reflects the library's current extension points.
 */
export interface Override extends RecordBase {
  kind: 'override'
  instanceId: string
  property: string
  change: OverrideChange
  value?: string | number | boolean
  madeBy?: Owner
}

/**
 * Spec: Evidence integrity. Tiers stay separate and never collapse into one badge.
 * `static-analysis` covers source, token and design-file reading: it proves what an
 * artifact says, never how it behaves.
 */
export const EVIDENCE_TIERS = [
  'static-analysis',
  'working-preview',
  'design-reconciliation',
  'automated',
  'physical-device',
] as const
export type EvidenceTier = (typeof EVIDENCE_TIERS)[number]

export const STATIC_METHODS = ['source-analysis', 'token-analysis', 'design-export'] as const
export const RUN_METHODS = ['storybook', 'playwright', 'appium', 'screenshot', 'accessibility', 'runtime'] as const
export type EvidenceMethod = (typeof STATIC_METHODS)[number] | (typeof RUN_METHODS)[number]

export interface Evidence extends RecordBase {
  kind: 'evidence'
  subjectIds: string[]
  tier: EvidenceTier
  method: EvidenceMethod
  platform?: Platform
  /** `finding` records what an artifact says without a pass or fail verdict. */
  outcome: 'pass' | 'fail' | 'finding'
  finding?: string
  capturedAt: string
  /** Required: evidence is tied to the exact revision it proves. */
  source: SourceRef
}

/** Spec: Platform restrictions and quirks, plus decision 0001's conflict causes. */
export const CLASSIFICATIONS = [
  'unclassified',
  'platform-convention',
  'technical-limitation',
  'form-factor',
  'temporary-gap',
  'intentional-differentiation',
  'outdated-design-source',
  'unapproved-divergence',
] as const
export type Classification = (typeof CLASSIFICATIONS)[number]

/**
 * Two sources disagree on the same target (spec: Collaboration cycle). A disagreement is
 * a record, not automatically a bug. It is classified, given owners, and resolved only
 * with evidence.
 */
export interface ContractConflict extends RecordBase {
  kind: 'contract-conflict'
  targetId: string
  variant?: string
  platform?: Platform
  summary: string
  sides: ConflictSide[]
  classification: Classification
  owners: Owner[]
  alignment: AlignmentState
  status: 'open' | 'resolved'
  resolution?: Resolution
}

export interface ConflictSide {
  claim: string
  recordId?: string
  evidenceIds: string[]
}

/**
 * How a conflict was settled. Decision becomes its own record in roadmap step 3; until
 * then the decision is kept inline here.
 */
export interface Resolution {
  outcome: 'update-design' | 'change-implementation' | 'update-contract' | 'approve-exception'
  decidedBy: Owner
  at: string
  rationale: string
  evidenceIds: string[]
  /** Required for `approve-exception`: when the exception is reconsidered. */
  revisitTrigger?: string
  expires?: string
}

export type GraphRecord =
  | Intent
  | Target
  | Token
  | SemanticComponent
  | PlatformComponent
  | ExtensionPoint
  | ComponentInstance
  | Override
  | Evidence
  | ContractConflict

export type RecordKind = GraphRecord['kind']

// ---------------------------------------------------------------------------
// Links

/**
 * Spec and onboarding plan: every link carries a status. Readiness counts only declared
 * and observed links. An observed link needs run evidence, and a failed operation never
 * becomes an observed edge.
 */
export const LINK_STATUSES = ['declared', 'observed', 'inferred', 'proposed'] as const
export type LinkStatus = (typeof LINK_STATUSES)[number]

export const RELATIONS = ['implements', 'serves', 'uses-token', 'navigates', 'contains'] as const
export type Relation = (typeof RELATIONS)[number]

export interface Link {
  from: string
  relation: Relation
  /** Absent only for a `navigates` edge whose destination is not mapped yet. */
  to?: string
  /** For an unmapped destination: what is known about it, such as a route. Shown, never guessed. */
  unmapped?: string
  status: LinkStatus
  evidenceIds?: string[]
  source?: SourceRef
  /** `navigates` only, after the journey engine's cross-route actions. */
  action?: string
  route?: string
  condition?: string
  returnTo?: string
}
