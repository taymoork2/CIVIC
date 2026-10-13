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
  /**
   * The line the revision was seen on (D36), as a `line:` ID. The same commit seen on two
   * lines is still one revision, so the line is recorded beside it, not folded into it.
   */
  line?: string
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
  /**
   * The `actor:` that wrote this record, when it matters who did (D35). An agent may write
   * annotations and comments for its person, but never evidence or a decision.
   */
  writtenBy?: string
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
  /** A journey only: the screens it starts on, as `target:` IDs. The completeness check (D32) walks from these. */
  entry?: string[]
  /** A journey only: screens where it may legitimately end, so they are not reported as dead ends. */
  exits?: string[]
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
  /**
   * States whose content depends on the product's data, such as `loading`, `empty` and
   * `error`. A product design that uses the component shows each one, or says the instance
   * inherits the component's default (D32). The other states come from the library.
   */
  productStates?: string[]
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
  /** The semantic variant this component renders when no variant is given, read from source. */
  defaultVariant?: string
  /**
   * Variants this platform offers that no semantic variant covers, such as iOS's floating
   * styles. Design decides whether the contract grows; until then they are listed, not hidden.
   */
  extraVariants?: { expression: string; note?: string }[]
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
  /** The contract state this instance shows, such as `rest` or `loading`, read from the design or code. */
  state?: string
  /** Product states this instance explicitly leaves to the component's default (D32). */
  inheritsStates?: string[]
  /**
   * Where a design instance's component comes from: the library file, as the product's
   * manifest names it, and the component set's published key (decision 0011). `name` means
   * the export had no key to match on, which is weaker evidence than `key`.
   */
  library?: { file: string; key: string; matchedBy: 'key' | 'name' }
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
 * a record, not automatically a bug. It is classified, given owners, and settled only by
 * a Decision record with evidence. The conflict keeps what the import raised; whether it
 * is decided, and how, is read from its Decision (see decisions.ts).
 */
export interface ContractConflict extends RecordBase {
  kind: 'contract-conflict'
  targetId: string
  variant?: string
  platform?: Platform
  summary: string
  sides: ConflictSide[]
  /** As raised, before anyone decides it. A Decision carries the classification a person gave. */
  classification: Classification
  owners: Owner[]
  /** As raised: `unreviewed-drift`, or `unknown-stale`. A Decision carries the decided state. */
  alignment: AlignmentState
}

export interface ConflictSide {
  claim: string
  recordId?: string
  evidenceIds: string[]
}

export const DECISION_OUTCOMES = ['update-design', 'change-implementation', 'update-contract', 'approve-exception'] as const
export type DecisionOutcome = (typeof DECISION_OUTCOMES)[number]

/**
 * A person's call on a contract conflict (roadmap step 3). It is its own owned record, so
 * the gate (step 8) can tell a decided conflict from an undecided one, and a later call
 * supersedes an earlier one instead of overwriting it. A conflict is decided when a
 * Decision on it is in force: one that no other Decision supersedes. Agents never write
 * one (D35).
 */
export interface Decision extends RecordBase {
  kind: 'decision'
  /** The `conflict:` this decides. */
  conflictId: string
  outcome: DecisionOutcome
  /** The person's classification of the conflict; never `unclassified`. */
  classification: Classification
  /** The alignment state the conflict's target takes on its platform once decided. */
  alignment: AlignmentState
  decidedBy: Owner
  at: string
  rationale: string
  /** Evidence for the decided outcome. A conflict is never settled without it. */
  evidenceIds: string[]
  /** Required for `approve-exception`: when the exception is reconsidered. */
  revisitTrigger?: string
  /** An approved exception's end date (ISO). The gate fails once it has passed. */
  expires?: string
  /** The earlier `decision:` on the same conflict that this one replaces. */
  supersedes?: string
  /**
   * The `proposal:` this decision approves: the exact candidate. Required for
   * `update-contract`, which changes intent; a fix that restores the contract needs none.
   */
  proposalId?: string
}

// ---------------------------------------------------------------------------
// The decision loop (roadmap step 3, spec: Proposal, decision, adoption, verification).
// Four separate records, never one "done" flag: a candidate change, a person's call on it,
// the revision that carries the call, and independent evidence that it behaves as decided.

/** What a revision is, wherever it lives: a commit, a Figma file version, a package release. */
export interface RevisionRef {
  /** The tool the revision lives in, such as `git`, `figma` or `npm`. */
  tool: string
  revision: string
  /** The `line:` it was made on, when the graph tracks lines (D36). */
  line?: string
  /** Where a candidate can be played or viewed: a PR preview, a Figma branch link. */
  preview?: string
}

/**
 * A candidate change (spec: Proposal). It names what it changes, the baseline it starts
 * from and the candidate revision, so it can be played and compared before anyone decides.
 * Testing a candidate is not adopting it. Agents may draft one for their person: CIVIC and
 * the agents working from it draft remediation, and the owner decides (D35).
 */
export interface Proposal extends RecordBase {
  kind: 'proposal'
  /** The `conflict:` this remediates, when it answers one. */
  conflictId?: string
  /** What the candidate changes: targets, components, tokens. */
  targetIds: string[]
  scope: 'journey' | 'screen' | 'component' | 'primitive' | 'token'
  /** The resolution path: which side changes, or an exception. A Decision approving it takes the same outcome. */
  outcome: DecisionOutcome
  baseline: RevisionRef
  candidate: RevisionRef
  rationale: string
  /** What a person should see once it is adopted, in words a check can be written from. */
  expected: string
  proposedBy: Owner
  at: string
}

/**
 * The link from a Decision to the implementation revision that carries it (spec: Adoption).
 * Recording one is a claim, so an agent may report it; it counts only once verified, by
 * CIVIC's own re-import or by a Verification record.
 */
export interface Adoption extends RecordBase {
  kind: 'adoption'
  /** The `decision:` this carries out. Never an approved exception: there is nothing to adopt. */
  decisionId: string
  /** The revision that carries the decision. */
  carriedBy: RevisionRef
  adoptedBy: Owner
  at: string
  note?: string
}

/**
 * Independent evidence that an adopted change behaves as decided (spec: Verification).
 * The evidence is read at the adopted revision, and the gate re-checks it on every run, so
 * a fix that later regresses fails again. Agents never write one (D35), as with evidence.
 */
export interface Verification extends RecordBase {
  kind: 'verification'
  /** The `adoption:` this verifies. */
  adoptionId: string
  /** Evidence read at the adopted revision. */
  evidenceIds: string[]
  /** The adopted revision the evidence was read at; it must be the adoption's. */
  revision: string
  outcome: 'pass' | 'fail'
  verifiedBy: Owner
  at: string
}

// ---------------------------------------------------------------------------
// Collaboration records (roadmap step 3, spec: Collaboration records). Typed, actionable
// records instead of passive comments, kept in the decision file next to the loop records.

export const COLLABORATION_TYPES = ['ambiguity', 'constraint', 'coverage-gap', 'divergence', 'risk', 'exception'] as const
export type CollaborationType = (typeof COLLABORATION_TYPES)[number]

/**
 * One typed concern about the contract or a scenario: expected behavior is unclear
 * (ambiguity), a technical, platform, business or policy limit (constraint), a state,
 * platform or condition without validation (coverage gap), artifacts or shipped behavior
 * that disagree (divergence), a possible harmful or costly outcome (risk), or a temporary,
 * owned, expiring departure from policy or contract (exception). An exception that accepts
 * a platform or library constraint is an Accepted limitation.
 *
 * Each names what it affects, the perspectives it needs, its owners, an optional deadline,
 * and once closed, its resolution and the artifact changes that resulted. Anyone may raise
 * one, an agent included, except an exception, which only a person records; only a person
 * closes one (D35).
 */
export interface CollaborationRecord extends RecordBase {
  kind: 'collaboration'
  type: CollaborationType
  /** What it affects: the contract or scenario, as graph IDs (targets, components, conflicts). */
  subjectIds: string[]
  platform?: Platform
  summary: string
  /** The perspectives that must weigh in before it closes. */
  perspectives: Role[]
  owners: Owner[]
  raisedBy: Owner
  at: string
  /** The deadline (ISO date). The gate reports an open record past it as overdue. */
  due?: string
  /** An exception's user impact, revisit trigger and end date (ISO). The gate fails once it has passed. */
  userImpact?: string
  revisitTrigger?: string
  expires?: string
  /** An exception that accepts a platform or library constraint: an Accepted limitation. */
  limitation?: boolean
  status: 'open' | 'resolved' | 'withdrawn'
  resolution?: CollaborationResolution
}

export interface CollaborationResolution {
  by: Owner
  at: string
  note: string
  /** Records the resolution produced or relied on, such as a Decision or a Proposal. */
  recordIds: string[]
  /** The artifact revisions that changed because of it. */
  changes: RevisionRef[]
}

// ---------------------------------------------------------------------------
// The review to agent loop (decision 0007, D35 to D39). These start roadmap step 3's
// collaboration records: who acts, which line of work they act on, what was annotated,
// and the work request an agent can claim.

/**
 * Who wrote something (D35). A person is accountable for their own writes and for every
 * write an agent makes on their behalf. `civic` is CIVIC's own deterministic process: it
 * re-captures reported fixes and resolves requests in the Auto lane, under a policy a
 * person set. It never makes a model call.
 */
export const ACTOR_TYPES = ['person', 'agent', 'civic'] as const
export type ActorType = (typeof ACTOR_TYPES)[number]

export interface Actor extends RecordBase {
  kind: 'actor'
  type: ActorType
  /** A person's handle as ownership files name it, an agent's harness and name, or `civic`. */
  handle: string
  /** An agent only: the `actor:` ID of the person it acts for. Required, and must be a person. */
  delegatedBy?: string
}

/**
 * A stream of work with revisions (D36): main, a branch, a worktree, a PR with its
 * preview, or a design draft. Records made on a line stay on it until it merges.
 */
export const LINE_TYPES = ['main', 'branch', 'worktree', 'pr', 'design-draft'] as const
export type LineType = (typeof LINE_TYPES)[number]

export interface Line extends RecordBase {
  kind: 'line'
  type: LineType
  /** The tool the line lives in, such as `git`, `github` or `figma`. */
  tool: string
  /** What the tool calls it: a branch name, a worktree's branch, a PR number, a Figma branch key. */
  ref: string
  /** The `line:` this one branched from. Only main has none. */
  base?: string
  /** The latest revision seen on this line. */
  head: string
  /** Where revisions of this line run: a local port, a PR preview, a Storybook deploy. */
  previews?: Preview[]
  status: 'open' | 'merged' | 'abandoned'
  /** A merged line names the revision it merged as, so its records can be adopted on the base. */
  mergedAs?: string
  /**
   * A design line only: its top-level frames at `head`, each with a fingerprint of the
   * frame's content, so the design lens can say what a draft changes from its base (D36).
   */
  frames?: DesignFrame[]
}

/** A top-level frame of a design file at one version, as a design line records it. */
export interface DesignFrame {
  /** The frame's ID in its design tool (a Figma node ID), which also anchors annotations on the frame. */
  node: string
  name: string
  page: string
  /** `sha256:<hex>` of the frame's content in the export, so an edit anywhere inside it shows. */
  hash: string
  /**
   * Graph targets this frame designs, when the design tool's export declares them. A Figma
   * frame names none: graphs anchor their targets to its node ID instead.
   */
  designs?: string[]
}

/** The tools whose lines are code, not design: only a design line records frames. */
export const CODE_LINE_TOOLS = ['git', 'github'] as const

/**
 * A design file from a tool with no Figma-style file export (`civic.design/0`): its frames,
 * already fingerprinted by an importer, and the targets each one designs. CIVIC reads it as
 * a design line or draft, as it reads a Figma export, so design tools stay pluggable.
 */
export interface DesignExport {
  schema: 'civic.design/0'
  /** The design tool, such as `open-design`. Free text, like a source's tool. */
  tool: string
  /** The file's key in that tool. With the tool it names the design line. */
  key: string
  name: string
  /** The file version this export carries. */
  version: string
  /** Where the file or its source can be opened. */
  link?: string
  frames: DesignFrame[]
}

export interface Preview {
  url: string
  revision: string
}

/**
 * Where an annotation points, strongest first (D37). Target IDs follow a change across
 * revisions and lines. The locator is used only when no target ID matches. The rectangle
 * is kept with the frozen capture and is never used to find anything again.
 */
export interface Anchor {
  /** Graph IDs the selection covers: a journey, screen, state, component instance and so on. */
  targetIds: string[]
  /** A selected path or branch: the `navigates` edge itself, by its ends and action or condition. */
  edges?: EdgeRef[]
  locator?: ElementLocator
  /** Normalized to the frozen capture (0 to 1). */
  rect?: { x: number; y: number; width: number; height: number; label?: string }
}

export interface EdgeRef {
  from: string
  to?: string
  action?: string
  condition?: string
}

/** The same facts a Playwright locator uses, read at capture time. Matched exactly or not at all. */
export interface ElementLocator {
  testId?: string
  role?: string
  name?: string
  /** DOM or accessibility path at capture time. Kept for people to read; never matched. */
  path?: string
  /** A design-draft frame or layer: its node ID in the Figma file, such as `12:34`. Matched exactly. */
  figmaNode?: string
}

/** A frozen capture: content-addressed, so it can never change after it is written. */
export interface CaptureRef {
  /** SHA-256 of the image bytes. */
  sha256: string
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp'
  viewport?: { width: number; height: number }
  /** The page or scenario the capture shows, as a URL path and query any preview can open. */
  reproduction?: string
}

/**
 * A comment on something in the journey (D37), from the canvas, the capture overlay, a
 * harness, or an imported screenshot. With no anchor it is unanchored: tracked, handed off
 * and resolved like any other, but it can't follow the product to another revision until a
 * person anchors it.
 */
export interface Annotation extends RecordBase {
  kind: 'annotation'
  comment: string
  anchor?: Anchor
  capture?: CaptureRef
  /** The line and revision the annotation was made on, and the URL when it was a preview. */
  seenOn: { line: string; revision: string; url?: string }
  at: string
  writtenBy: string
}

/** How a work request closes (D38). Computed by laneFor from the request, not chosen freely. */
export const LANES = ['auto', 'batch-review', 'owner-sign-off'] as const
export type Lane = (typeof LANES)[number]

export const REQUEST_STATUSES = ['open', 'claimed', 'fix-ready', 'resolved', 'reopened'] as const
export type RequestStatus = (typeof REQUEST_STATUSES)[number]

/**
 * A check that decides whether a fix is accepted. A check an agent wrote for its own fix
 * counts toward the Auto lane only once a person has accepted it (D38).
 */
export interface AcceptanceCheck {
  command: string
  writtenBy: string
  acceptedBy?: string
}

/** A lease, so a crashed agent doesn't hold a request forever. */
export interface Claim {
  by: string
  line: string
  at: string
  expires: string
}

/** Moving a request to Fix ready for review. Agents can report; only CIVIC re-captures. */
export interface FixReport {
  by: string
  line: string
  revision: string
  preview?: string
  at: string
  note?: string
  recapture?: Recapture
}

/** CIVIC's own deterministic re-capture of the request's scenario on the fix's preview. */
export interface Recapture {
  at: string
  revision: string
  anchors: { annotationId: string; outcome: AnchorOutcome; capture?: CaptureRef }[]
  checks: { command: string; outcome: 'pass' | 'fail' }[]
  /** The working-preview Evidence record the re-capture wrote. */
  evidenceId?: string
}

/** D37: by stable ID, else by exact locator, else not found. There is no nearest match. */
export const ANCHOR_OUTCOMES = ['found-by-id', 'found-by-locator', 'not-found', 'unanchored'] as const
export type AnchorOutcome = (typeof ANCHOR_OUTCOMES)[number]

export interface RequestEvent {
  status: RequestStatus
  by: string
  at: string
  note?: string
}

/**
 * Selected annotations handed to an agent (D38). The agent claims it on its own line and
 * reports a fix; CIVIC re-captures; a person, or CIVIC in the Auto lane under a person's
 * policy, resolves it. Owners (on the record) sign off in the owner lane.
 */
export interface WorkRequest extends RecordBase {
  kind: 'work-request'
  ask: string
  annotationIds: string[]
  /** `restore-contract` fixes drift from the approved contract; `change` alters intent or behavior and is a Proposal. */
  intent: 'restore-contract' | 'change'
  risk: 'normal' | 'high'
  /** A person may send a request to a stricter lane than laneFor gives, never a looser one. */
  escalatedTo?: 'batch-review' | 'owner-sign-off'
  base: { line: string; revision: string }
  platform?: Platform
  /** Semantic components whose `civic context` export the request carries. */
  contextIds?: string[]
  acceptance: AcceptanceCheck[]
  /** The command that opens the exact scenario on any preview. */
  repro: string
  requestedBy: string
  status: RequestStatus
  claim?: Claim
  fixes: FixReport[]
  comments: { by: string; at: string; text: string }[]
  /** Every status change, oldest first. The last entry's status is the current status. */
  history: RequestEvent[]
  /**
   * Counts the changes to this request, from 1 (roadmap step 5). A write that names the
   * version it was based on is refused once someone else has changed the request, so a
   * person never resolves a fix they didn't see. Absent on requests written before versions.
   */
  version?: number
  /** The latest change: who made it, when, and which operation it was. */
  changed?: { by: string; at: string; what: string }
}

/**
 * A person's choice between design drafts (D36): the Decision for drafts. It names the
 * chosen line and the revision that was chosen. The other drafts from the same base are
 * marked abandoned, not deleted, so "why didn't we do B" keeps its answer. `writtenBy` is
 * the person who chose; an agent never chooses (D35).
 */
export interface DraftChoice extends RecordBase {
  kind: 'draft-choice'
  /** The design line the drafts branched from. */
  base: string
  chosen: { line: string; revision: string }
  /** The other drafts from the same base that were open when the choice was made. */
  over: string[]
  rationale: string
  at: string
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
  | Decision
  | Proposal
  | Adoption
  | Verification
  | Actor
  | Line
  | Annotation
  | WorkRequest
  | DraftChoice
  | CollaborationRecord

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
