#!/usr/bin/env node
// civic: validate graph files, forecast overrides, export contracts and gaps (D31), run the
// gate, and keep the decision loop: propose a fix, decide a conflict, record the revision that
// adopts it and the evidence that verifies it. Only `propose`, `decide`, `adopt` and `verify`
// write, and only to a decision file, with `raise` and `close` for collaboration records; all are deterministic, and none makes a model call (D30).
//
//   civic validate <file>...
//   civic forecast <file> <override-id> [--platforms web,ios,android]
//   civic overrides <file> <instance-id> [--json]
//   civic context <file> <semantic-id> --platform <p> [--variant <key>] [--json]
//   civic gaps <file> [--scope <semantic-id>] [--platform <p>] [--json]
//   civic completeness <file> <journey-id> [--json]
//   civic screen <target-id> [<file>...] [--config civic.check.json] [--today <date>] [--json]
//   civic check [<file>...] [--config civic.check.json] [--baseline <file>] [--update-baseline] [--today <date>] [--since <ref>] [--json] [--post] [--comment <pr>]
//   civic release [<file>...] --since <ref> [--config civic.check.json] [--json]
//   civic decide <decisions.json> <conflict-id> --graph <file> --outcome <o> --classification <c> --by <role>:<who>
//                --rationale <text> --evidence <id,...> [--proposal <id>] [--alignment <a>] [--title <t>] [--revisit <text>] [--expires <date>] [--at <time>]
//   civic propose <decisions.json> --graph <file> --targets <id,...> --scope <s> --outcome <o> --by <role>:<who> --rationale <text>
//                --expected <text> --baseline <tool>:<rev> --candidate <tool>:<rev> [--conflict <id>] [--preview <url>] [--title <t>] [--at <time>]
//   civic adopt <decisions.json> <decision-id> --graph <file> --revision <tool>:<rev> --by <role>:<who> [--preview <url>] [--note <text>] [--at <time>]
//   civic verify <decisions.json> <adoption-id> --graph <file> --evidence <id,...> --by <role>:<who> [--at <time>]
//   civic fixes <file> [--json]
//   civic raise <decisions.json> <type> --graph <file> --about <id,...> --summary <text> --by <role>:<who> --owners <role>:<who>,...
//                [--perspectives <role,...>] [--platform <p>] [--due <date>] [--impact <text> --revisit <text> --expires <date> [--limitation]] [--title <t>] [--at <time>]
//   civic close <decisions.json> <collab-id> --graph <file> --by <role>:<who> --note <text> [--withdraw] [--records <id,...>] [--changes <tool>:<rev>,...] [--at <time>]

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { baselineFrom, checkDocument, compareToBaseline, DEFAULT_BLOCKING, FINDING_KINDS, renderCheck, statusLine, type Baseline, type FindingKind } from './check.ts'
import { changeBetween, renderChange, type ChangeReport, type GraphAtRevisions } from './change.ts'
import { completenessOf, renderCompleteness } from './completeness.ts'
import { releaseBreaks, releasesBetween, renderReleases } from './release.ts'
import {
  ALIGNMENT_FOR,
  decisionFileRecords,
  DECISION_FILE_SCHEMA,
  fixesIn,
  openProposals,
  closeCollaboration,
  recordAdoption,
  recordCollaboration,
  recordDecision,
  recordProposal,
  recordVerification,
  renderFixes,
  type DecisionFile,
} from './decisions.ts'
import { contextFor, renderWorkOrder } from './context.ts'
import { forecastOverride } from './forecast.ts'
import { staleEvidence, type FreshnessRule } from './freshness.ts'
import { gapsIn, renderGaps } from './gaps.ts'
import { renderInstanceReview, reviewInstance } from './overrides.ts'
import { renderScreen, screenFacts } from './screen.ts'
import { indexGraph } from './graph.ts'
import { loadGraph, readGraphFile } from './load.ts'
import {
  CLASSIFICATIONS,
  COLLABORATION_TYPES,
  DECISION_OUTCOMES,
  PLATFORMS,
  ROLES,
  type AlignmentState,
  type Classification,
  type CollaborationType,
  type DecisionOutcome,
  type GraphDocument,
  type Owner,
  type Platform,
  type Proposal,
  type RevisionRef,
  type Role,
} from './schema.ts'
import { validateGraph } from './validate.ts'

const [command, ...args] = process.argv.slice(2)

async function main(): Promise<number> {
  if (command === 'validate' && args.length > 0) {
    let failed = false
    for (const file of args) {
      const issues = validateGraph(await readGraphFile(file))
      const errors = issues.filter((issue) => issue.severity === 'error').length
      console.log(`${file}: ${errors} error(s), ${issues.length - errors} warning(s)`)
      for (const issue of issues) console.log(`  ${issue.severity} ${issue.code} at ${issue.at}: ${issue.message}`)
      failed ||= errors > 0
    }
    return failed ? 1 : 0
  }
  if (command === 'forecast' && args.length >= 2) {
    const [file, overrideId] = args as [string, string]
    const flag = args.indexOf('--platforms')
    const platforms = flag >= 0 ? ((args[flag + 1] ?? '').split(',') as Platform[]) : undefined
    const unknown = (platforms ?? []).filter((platform) => !PLATFORMS.includes(platform))
    if (unknown.length > 0) return usage(`Unknown platform: ${unknown.join(', ')}`)
    for (const forecast of forecastOverride(await loadGraph(file), overrideId, platforms)) {
      console.log(`${forecast.platform.padEnd(8)} ${forecast.outcome.padEnd(21)} ${forecast.reason}`)
    }
    return 0
  }
  if (command === 'context' && args.length >= 2) {
    const [file, targetId] = args as [string, string]
    const platform = option('--platform')
    if (!platform) return usage('context needs --platform.')
    if (!isPlatform(platform)) return usage(`Unknown platform: ${platform}`)
    const variant = option('--variant')
    const order = contextFor(await loadGraph(file), targetId, { platform, ...(variant ? { variant } : {}) })
    console.log(args.includes('--json') ? JSON.stringify(order, null, 2) : renderWorkOrder(order))
    return 0
  }
  if (command === 'gaps' && args.length >= 1) {
    const platform = option('--platform')
    if (platform !== undefined && !isPlatform(platform)) return usage(`Unknown platform: ${platform}`)
    const scope = option('--scope')
    const gaps = gapsIn(await loadGraph(args[0]!), { ...(scope ? { scope } : {}), ...(platform !== undefined ? { platform } : {}) })
    console.log(args.includes('--json') ? JSON.stringify(gaps, null, 2) : renderGaps(gaps))
    return 0
  }
  if (command === 'overrides' && args.length >= 2) {
    const graph = await loadGraph(args[0]!)
    const review = reviewInstance(graph, args[1]!)
    console.log(args.includes('--json') ? JSON.stringify(review, null, 2) : renderInstanceReview(graph, review))
    return 0
  }
  if (command === 'completeness' && args.length >= 2) {
    const graph = await loadGraph(args[0]!)
    const result = completenessOf(graph, args[1]!)
    console.log(args.includes('--json') ? JSON.stringify(result, null, 2) : renderCompleteness(graph, result))
    return 0
  }
  if (command === 'check') return check()
  if (command === 'release') return release()
  if (command === 'screen') return screen()
  if (command === 'decide' && args.length >= 2) return decide(args[0]!, args[1]!)
  if (command === 'propose' && args.length >= 1) return propose(args[0]!)
  if (command === 'adopt' && args.length >= 2) return adopt(args[0]!, args[1]!)
  if (command === 'verify' && args.length >= 2) return verify(args[0]!, args[1]!)
  if (command === 'raise' && args.length >= 2) return raise(args[0]!, args[1]!)
  if (command === 'close' && args.length >= 2) return close(args[0]!, args[1]!)
  if (command === 'fixes' && args.length >= 1) {
    const graph = await loadGraph(args[0]!)
    console.log(args.includes('--json') ? JSON.stringify({ fixes: fixesIn(graph), proposals: openProposals(graph) }, null, 2) : renderFixes(graph))
    return 0
  }
  return usage()
}

/**
 * Records a person's decision on a conflict as a Decision record in the project's decision
 * file (roadmap step 3). The file is checked against the graph before it is written, so a
 * decision on a conflict the graph doesn't raise, or one without evidence, is never kept.
 * A later call on the same conflict supersedes the one in force. Rebuild the graph after.
 */
async function decide(file: string, conflictId: string): Promise<number> {
  const graphPath = option('--graph')
  if (!graphPath) return usage('decide needs --graph, the graph that raised the conflict, to check the decision against.')
  const outcome = option('--outcome')
  if (!outcome || !(DECISION_OUTCOMES as readonly string[]).includes(outcome)) return usage(`--outcome is one of ${DECISION_OUTCOMES.join(', ')}.`)
  const classification = option('--classification')
  if (!classification || classification === 'unclassified' || !(CLASSIFICATIONS as readonly string[]).includes(classification)) {
    return usage(`--classification is one of ${CLASSIFICATIONS.filter((item) => item !== 'unclassified').join(', ')}.`)
  }
  const allowed = ALIGNMENT_FOR[outcome as DecisionOutcome]
  const alignment = option('--alignment') ?? allowed[0]!
  if (!allowed.includes(alignment as AlignmentState)) return usage(`A ${outcome} decision leaves the conflict ${allowed.join(' or ')}.`)
  const decidedBy = owner()
  if (!decidedBy) return usage(BY_USAGE)
  const rationale = option('--rationale')
  if (!rationale) return usage('--rationale says why, in a sentence or two.')
  const evidenceIds = (option('--evidence') ?? '').split(',').filter(Boolean)
  const revisitTrigger = option('--revisit')
  const expires = option('--expires')
  const proposalId = option('--proposal')

  const document = (await readGraphFile(graphPath)) as GraphDocument
  const conflict = Array.isArray(document.records) ? document.records.find((record) => record.id === conflictId) : undefined
  const existing = readDecisionFile(file)
  if (!existing) return usage(`${file} is not a decision file (schema ${DECISION_FILE_SCHEMA}).`)
  const { file: next, decision } = recordDecision(existing, {
    title: option('--title') ?? `Decision on ${conflict?.title ?? conflictId}`,
    conflictId,
    outcome: outcome as DecisionOutcome,
    classification: classification as Classification,
    alignment: alignment as AlignmentState,
    decidedBy,
    at: option('--at') ?? new Date().toISOString(),
    rationale,
    evidenceIds,
    ...(revisitTrigger ? { revisitTrigger } : {}),
    ...(expires ? { expires } : {}),
    ...(proposalId ? { proposalId } : {}),
  })
  if (!writeChecked(file, next, document, graphPath, decision.id)) return 1
  console.log(`Recorded ${decision.id} in ${file}${decision.supersedes ? `, superseding ${decision.supersedes}` : ''}. Rebuild the graph, then run civic check.`)
  return 0
}

/**
 * Records a candidate fix as a Proposal: what it changes, the baseline and candidate
 * revisions, and what a person should see once it is adopted. Anyone may propose, an agent
 * included; a person decides by naming it in `civic decide --proposal`.
 */
async function propose(file: string): Promise<number> {
  const graphPath = option('--graph')
  if (!graphPath) return usage('propose needs --graph, to check the proposal against.')
  const targetIds = (option('--targets') ?? '').split(',').filter(Boolean)
  if (targetIds.length === 0) return usage('--targets lists what the candidate changes, as graph IDs.')
  const scope = option('--scope')
  const scopes: Proposal['scope'][] = ['journey', 'screen', 'component', 'primitive', 'token']
  if (!scope || !(scopes as string[]).includes(scope)) return usage(`--scope is one of ${scopes.join(', ')}.`)
  const outcome = option('--outcome')
  if (!outcome || !(DECISION_OUTCOMES as readonly string[]).includes(outcome)) return usage(`--outcome is one of ${DECISION_OUTCOMES.join(', ')}.`)
  const proposedBy = owner()
  if (!proposedBy) return usage(BY_USAGE)
  const rationale = option('--rationale')
  const expected = option('--expected')
  if (!rationale || !expected) return usage('--rationale says why, and --expected what a person should see once it is adopted.')
  const baseline = revisionRef(option('--baseline'))
  const preview = option('--preview')
  const candidate = revisionRef(option('--candidate'), preview)
  if (!baseline || !candidate) return usage('--baseline and --candidate are <tool>:<revision>, such as git:4f2a9c1 or figma:2215441.')
  const conflictId = option('--conflict')

  const document = (await readGraphFile(graphPath)) as GraphDocument
  const existing = readDecisionFile(file)
  if (!existing) return usage(`${file} is not a decision file (schema ${DECISION_FILE_SCHEMA}).`)
  const conflict = conflictId && Array.isArray(document.records) ? document.records.find((record) => record.id === conflictId) : undefined
  const { file: next, proposal } = recordProposal(existing, {
    title: option('--title') ?? `Proposal for ${conflict?.title ?? targetIds.join(', ')}`,
    ...(conflictId ? { conflictId } : {}),
    targetIds,
    scope: scope as Proposal['scope'],
    outcome: outcome as DecisionOutcome,
    baseline,
    candidate,
    rationale,
    expected,
    proposedBy,
    at: option('--at') ?? new Date().toISOString(),
  })
  if (!writeChecked(file, next, document, graphPath, proposal.id)) return 1
  console.log(`Recorded ${proposal.id} in ${file}. An owner approves it with civic decide --proposal ${proposal.id}.`)
  return 0
}

/**
 * Records the revision that carries a decision. It is a claim until verified: the gate
 * reads it as adopted, and fails it if an import that read that revision still raises the
 * conflict.
 */
async function adopt(file: string, decisionId: string): Promise<number> {
  const graphPath = option('--graph')
  if (!graphPath) return usage('adopt needs --graph, to check the adoption against.')
  const carriedBy = revisionRef(option('--revision'), option('--preview'))
  if (!carriedBy) return usage('--revision is <tool>:<revision>, the revision that carries the decision, such as git:4f2a9c1.')
  const adoptedBy = owner()
  if (!adoptedBy) return usage(BY_USAGE)
  const note = option('--note')
  const document = (await readGraphFile(graphPath)) as GraphDocument
  const existing = readDecisionFile(file)
  if (!existing) return usage(`${file} is not a decision file (schema ${DECISION_FILE_SCHEMA}).`)
  const decision = existing.decisions.find((candidate) => candidate.id === decisionId)
  const { file: next, adoption } = recordAdoption(existing, {
    title: option('--title') ?? `Adoption of ${decision?.title ?? decisionId}`,
    decisionId,
    carriedBy,
    adoptedBy,
    at: option('--at') ?? new Date().toISOString(),
    ...(note ? { note } : {}),
  })
  if (!writeChecked(file, next, document, graphPath, adoption.id)) return 1
  console.log(`Recorded ${adoption.id} in ${file}. Import ${carriedBy.revision} and rebuild: the conflict should no longer be raised. Then verify with civic verify.`)
  return 0
}

/**
 * Records a Verification from evidence the graph holds at the adopted revision. The outcome
 * is read from that evidence, never typed in: any failing evidence fails it. Evidence read
 * at any other revision is refused, so a verification always proves the adopted revision.
 */
async function verify(file: string, adoptionId: string): Promise<number> {
  const graphPath = option('--graph')
  if (!graphPath) return usage('verify needs --graph, the graph imported at the adopted revision.')
  const evidenceIds = (option('--evidence') ?? '').split(',').filter(Boolean)
  if (evidenceIds.length === 0) return usage('--evidence lists the evidence read at the adopted revision.')
  const verifiedBy = owner()
  if (!verifiedBy) return usage(BY_USAGE)
  const document = (await readGraphFile(graphPath)) as GraphDocument
  const existing = readDecisionFile(file)
  if (!existing) return usage(`${file} is not a decision file (schema ${DECISION_FILE_SCHEMA}).`)
  const adoption = (existing.adoptions ?? []).find((candidate) => candidate.id === adoptionId)
  if (!adoption) return usage(`${file} has no ${adoptionId}. Record it first with civic adopt.`)
  const revision = adoption.carriedBy.revision
  const evidence = evidenceIds.map((id) => (Array.isArray(document.records) ? document.records.find((record) => record.id === id) : undefined))
  const elsewhere = evidence.flatMap((item, index) => (item?.kind === 'evidence' && item.source.revision !== revision ? [`${evidenceIds[index]} (read at ${item.source.revision})`] : []))
  if (elsewhere.length > 0) {
    console.error(`Not recorded: ${elsewhere.join(', ')} not read at the adopted revision ${revision}. Import that revision and rebuild ${graphPath} first.`)
    return 1
  }
  const outcome = evidence.some((item) => item?.kind === 'evidence' && item.outcome === 'fail') ? 'fail' : 'pass'
  const { file: next, verification } = recordVerification(existing, {
    title: option('--title') ?? `Verification of ${adoption.title}`,
    adoptionId,
    evidenceIds,
    revision,
    outcome,
    verifiedBy,
    at: option('--at') ?? new Date().toISOString(),
  })
  if (!writeChecked(file, next, document, graphPath, verification.id)) return 1
  console.log(`Recorded ${verification.id} in ${file}: ${outcome} at ${revision}. Rebuild the graph, then run civic check.`)
  return outcome === 'pass' ? 0 : 1
}

/**
 * Raises a collaboration record (roadmap step 3): an ambiguity, constraint, coverage gap,
 * divergence or risk anyone may raise, or an exception a person records with its user
 * impact, revisit trigger and end date. It is checked against the graph before it is kept.
 */
async function raise(file: string, type: string): Promise<number> {
  if (!(COLLABORATION_TYPES as readonly string[]).includes(type)) return usage(`The type is one of ${COLLABORATION_TYPES.join(', ')}.`)
  const graphPath = option('--graph')
  if (!graphPath) return usage('raise needs --graph, to check what the record is about.')
  const subjectIds = list('--about')
  if (subjectIds.length === 0) return usage('--about lists what it affects, as graph IDs.')
  const summary = option('--summary')
  if (!summary) return usage('--summary says what is unclear, limited, missing, disagreeing, at risk or excepted.')
  const raisedBy = owner()
  if (!raisedBy) return usage(BY_USAGE)
  const owners = list('--owners').map(parseOwner)
  if (owners.length === 0 || owners.some((item) => !item)) return usage(`--owners is <role>:<who>,..., the people who see it through.`)
  const perspectives = list('--perspectives')
  if (perspectives.some((role) => !(ROLES as readonly string[]).includes(role))) return usage(`--perspectives are roles: ${ROLES.join(', ')}.`)
  const platform = option('--platform')
  if (platform !== undefined && !isPlatform(platform)) return usage(`Unknown platform: ${platform}`)
  const terms = { userImpact: option('--impact'), revisitTrigger: option('--revisit'), expires: option('--expires') }
  if (type === 'exception' && (!terms.userImpact || !terms.revisitTrigger || !terms.expires)) return usage('An exception needs --impact, --revisit and --expires: it is temporary and owned.')
  const due = option('--due')
  const document = (await readGraphFile(graphPath)) as GraphDocument
  const existing = readDecisionFile(file)
  if (!existing) return usage(`${file} is not a decision file (schema ${DECISION_FILE_SCHEMA}).`)
  const subject = Array.isArray(document.records) ? document.records.find((record) => record.id === subjectIds[0]) : undefined
  const { file: next, record } = recordCollaboration(existing, {
    title: option('--title') ?? `${type.charAt(0).toUpperCase()}${type.slice(1).replace('-', ' ')} on ${subject?.title ?? subjectIds[0]}`,
    type: type as CollaborationType,
    subjectIds,
    ...(platform ? { platform } : {}),
    summary,
    perspectives: perspectives as Role[],
    owners: owners as Owner[],
    raisedBy,
    at: option('--at') ?? new Date().toISOString(),
    ...(due ? { due } : {}),
    ...(terms.userImpact ? { userImpact: terms.userImpact } : {}),
    ...(terms.revisitTrigger ? { revisitTrigger: terms.revisitTrigger } : {}),
    ...(terms.expires ? { expires: terms.expires } : {}),
    ...(args.includes('--limitation') ? { limitation: true } : {}),
  })
  if (!writeChecked(file, next, document, graphPath, record.id)) return 1
  console.log(`Recorded ${record.id} in ${file}. Rebuild the graph; civic check and civic gaps list it until a person closes it with civic close.`)
  return 0
}

/** Closes a collaboration record as resolved (or withdrawn), with the records and revisions that resulted. */
async function close(file: string, id: string): Promise<number> {
  const graphPath = option('--graph')
  if (!graphPath) return usage('close needs --graph, to check the records the resolution names.')
  const by = owner()
  if (!by) return usage(BY_USAGE)
  const note = option('--note')
  if (!note) return usage('--note says how it was resolved, or why it was withdrawn.')
  const changes = list('--changes').map((value) => revisionRef(value))
  if (changes.some((change) => !change)) return usage('--changes are <tool>:<revision>, such as git:4f2a9c1 or figma:2215441.')
  const document = (await readGraphFile(graphPath)) as GraphDocument
  const existing = readDecisionFile(file)
  if (!existing) return usage(`${file} is not a decision file (schema ${DECISION_FILE_SCHEMA}).`)
  let closed
  try {
    closed = closeCollaboration(existing, id, args.includes('--withdraw') ? 'withdrawn' : 'resolved', { by, at: option('--at') ?? new Date().toISOString(), note, recordIds: list('--records'), changes: changes as RevisionRef[] })
  } catch (error) {
    return usage((error as Error).message)
  }
  if (!writeChecked(file, closed.file, document, graphPath, id)) return 1
  console.log(`${id} is ${closed.record.status} in ${file}. Rebuild the graph.`)
  return 0
}

function list(name: string): string[] {
  return (option(name) ?? '').split(',').map((item) => item.trim()).filter(Boolean)
}

function parseOwner(value: string): Owner | undefined {
  const split = value.indexOf(':')
  const role = value.slice(0, split)
  const who = value.slice(split + 1)
  return split > 0 && who && (ROLES as readonly string[]).includes(role) ? { role: role as Owner['role'], who } : undefined
}

const BY_USAGE = `--by is <role>:<who>, where role is one of ${ROLES.join(', ')}.`

function owner(): Owner | undefined {
  const value = option('--by') ?? ''
  const split = value.indexOf(':')
  const role = value.slice(0, split)
  const who = value.slice(split + 1)
  return split > 0 && who && (ROLES as readonly string[]).includes(role) ? { role: role as Owner['role'], who } : undefined
}

function revisionRef(value: string | undefined, preview?: string): RevisionRef | undefined {
  const split = value?.indexOf(':') ?? -1
  if (!value || split <= 0 || split === value.length - 1) return undefined
  return { tool: value.slice(0, split), revision: value.slice(split + 1), ...(preview ? { preview } : {}) }
}

function readDecisionFile(file: string): DecisionFile | undefined {
  const existing: DecisionFile = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as DecisionFile) : { schema: DECISION_FILE_SCHEMA, decisions: [] }
  return existing.schema === DECISION_FILE_SCHEMA ? existing : undefined
}

/**
 * Writes the decision file only if the graph, with this file's loop records in place of any
 * it already holds, stays valid. Prints the errors and the new record's warnings either way.
 */
function writeChecked(file: string, next: DecisionFile, document: GraphDocument, graphPath: string, recordId: string): boolean {
  const loop = new Set(['proposal', 'decision', 'adoption', 'verification', 'collaboration'])
  const candidate = { ...document, records: [...document.records.filter((record) => !loop.has(record.kind)), ...decisionFileRecords(next)] }
  const issues = validateGraph(candidate).filter((issue) => issue.severity === 'error' || issue.at === recordId)
  const errors = issues.filter((issue) => issue.severity === 'error')
  for (const issue of issues) console.error(`  ${issue.severity} ${issue.code} at ${issue.at}: ${issue.message}`)
  if (errors.length > 0) {
    console.error(`Not recorded: ${errors.length} error(s) with ${recordId} on ${graphPath}.`)
    return false
  }
  writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`)
  return true
}

/** The project's gate settings: which graphs to check, the baseline, and optionally which kinds block. */
interface CheckConfig {
  graphs: string[]
  baseline?: string
  blocking?: FindingKind[]
  /** Which graphs' evidence proves code in this repository, and where that code is (step 6). */
  freshness?: FreshnessRule[]
}

/** The stale evidence in one configured graph, or nothing when no freshness rule names it. */
function staleIn(config: CheckConfig, root: string, file: string, document: GraphDocument): ReadonlyMap<string, string> | undefined {
  const rule = config.freshness?.find((candidate) => candidate.graph === file)
  return rule ? staleEvidence(document, rule, root) : undefined
}

/** What the graphs know about one screen: the first graph, given or configured, that has it. */
async function screen(): Promise<number> {
  const valued = new Set(['--config', '--today'])
  const [targetId, ...files] = args.filter((arg, index) => !arg.startsWith('--') && !valued.has(args[index - 1] ?? ''))
  if (!targetId) return usage('screen needs a target ID.')
  const configPath = resolve(option('--config') ?? 'civic.check.json')
  let config: CheckConfig = { graphs: files }
  let root = process.cwd()
  if (files.length === 0) {
    if (!existsSync(configPath)) return usage(`No graphs given and no ${relative(process.cwd(), configPath) || configPath} to read them from.`)
    config = JSON.parse(readFileSync(configPath, 'utf8')) as CheckConfig
    root = dirname(configPath)
  }
  const today = option('--today') ?? new Date().toISOString().slice(0, 10)
  const baselinePath = files.length === 0 && config.baseline ? resolve(root, config.baseline) : undefined
  const baseline = baselinePath && existsSync(baselinePath) ? (JSON.parse(readFileSync(baselinePath, 'utf8')) as Baseline) : undefined
  for (const file of config.graphs) {
    const document = JSON.parse(readFileSync(resolve(root, file), 'utf8')) as GraphDocument
    if (!document.records.some((record) => record.id === targetId)) continue
    const errors = validateGraph(document).filter((issue) => issue.severity === 'error')
    if (errors.length > 0) {
      console.error(`${file} is invalid: ${errors.map((issue) => issue.code).join(', ')}.`)
      return 1
    }
    const stale = staleIn(config, root, file, document)
    const facts = screenFacts(indexGraph(document), file, targetId, { today, ...(baseline ? { baseline } : {}), ...(stale ? { stale } : {}), ...(config.blocking ? { blocking: config.blocking } : {}) })
    console.log(args.includes('--json') ? JSON.stringify(facts, null, 2) : renderScreen(facts))
    return 0
  }
  console.error(`No graph has ${targetId}.`)
  return 3
}

async function check(): Promise<number> {
  const valued = new Set(['--config', '--baseline', '--today', '--since', '--comment'])
  const files = args.filter((arg, index) => !arg.startsWith('--') && !valued.has(args[index - 1] ?? ''))
  const configPath = resolve(option('--config') ?? 'civic.check.json')
  let config: CheckConfig = { graphs: files }
  let root = process.cwd()
  if (files.length === 0) {
    if (!existsSync(configPath)) return usage(`No graphs given and no ${relative(process.cwd(), configPath) || configPath} to read them from.`)
    config = JSON.parse(readFileSync(configPath, 'utf8')) as CheckConfig
    root = dirname(configPath)
  }
  const unknown = (config.blocking ?? []).filter((kind) => !(FINDING_KINDS as readonly string[]).includes(kind))
  if (unknown.length > 0) return usage(`Unknown finding kind in blocking: ${unknown.join(', ')}`)
  const today = option('--today') ?? new Date().toISOString().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return usage('--today takes a date like 2026-10-11.')

  const unwatched = (config.freshness ?? []).filter((rule) => !config.graphs.includes(rule.graph))
  if (unwatched.length > 0) return usage(`A freshness rule names a graph the gate doesn't check: ${unwatched.map((rule) => rule.graph).join(', ')}`)
  const documents = config.graphs.map((file) => JSON.parse(readFileSync(resolve(root, file), 'utf8')) as GraphDocument)
  const checks = config.graphs.map((file, index) => {
    const stale = staleIn(config, root, file, documents[index]!)
    return checkDocument(file, documents[index], { today, ...(stale ? { stale } : {}) })
  })
  const since = option('--since')
  const comment = option('--comment')
  if (comment && !since) return usage('--comment needs --since, the base the pull request is compared with.')
  if (comment && !/^\d+$/.test(comment)) return usage('--comment takes a pull request number.')
  let change: ChangeReport | undefined
  if (since) {
    const base = baseDocuments(root, since, config.graphs)
    if (base instanceof Error) return usage(base.message)
    change = changeBetween(
      base.label,
      config.graphs.map((file, index): GraphAtRevisions => {
        const head = { document: documents[index]!, check: checks[index]! }
        const before = base.documents[index]
        return before ? { graph: file, base: { document: before, check: checkDocument(file, before, { today }) }, head } : { graph: file, head }
      }),
    )
  }
  const baselineFlag = option('--baseline')
  const baselinePath = baselineFlag ? resolve(baselineFlag) : config.baseline ? resolve(root, config.baseline) : undefined
  const baseline = baselinePath && existsSync(baselinePath) ? (JSON.parse(readFileSync(baselinePath, 'utf8')) as Baseline) : undefined
  const report = compareToBaseline(checks, baseline, config.blocking ?? DEFAULT_BLOCKING)

  if (args.includes('--update-baseline')) {
    if (!baselinePath) return usage('--update-baseline needs --baseline or a baseline in the config.')
    const next = baselineFrom(report)
    writeFileSync(baselinePath, `${JSON.stringify(next, null, 2)}\n`)
    console.log(`Wrote ${next.findings.length} finding(s) to ${relative(process.cwd(), baselinePath)}.`)
    return report.fresh.some((item) => item.kind === 'invalid-graph') ? 1 : 0
  }
  const changeText = change ? renderChange(change, { ...report, graphs: checks.length }) : undefined
  if (args.includes('--json')) console.log(JSON.stringify(change ? { ...report, change } : report, null, 2))
  else console.log(changeText ? `${renderCheck(report)}\n\n${changeText}` : renderCheck(report))
  if (args.includes('--post')) postStatus(root, report.passed ? 'success' : 'failure', statusLine(report, change))
  if (comment && changeText) postComment(root, comment, changeText)
  return report.passed ? 0 : 1
}

/**
 * A check on a library release (roadmap step 10): every platform component that changed
 * since `--since`, the variants it leaves without a mapping and the product overrides it
 * breaks. Exits 1 when a release breaks an override or unmaps a variant that had a mapping,
 * and 3 when a graph is invalid.
 */
async function release(): Promise<number> {
  const valued = new Set(['--config', '--since'])
  const files = args.filter((arg, index) => !arg.startsWith('--') && !valued.has(args[index - 1] ?? ''))
  const since = option('--since')
  if (!since) return usage('release needs --since, the revision the release is compared with.')
  const configPath = resolve(option('--config') ?? 'civic.check.json')
  let graphs = files
  let root = process.cwd()
  if (files.length === 0) {
    if (!existsSync(configPath)) return usage(`No graphs given and no ${relative(process.cwd(), configPath) || configPath} to read them from.`)
    graphs = (JSON.parse(readFileSync(configPath, 'utf8')) as CheckConfig).graphs
    root = dirname(configPath)
  }
  const base = baseDocuments(root, since, graphs)
  if (base instanceof Error) return usage(base.message)
  const heads = graphs.map((file) => JSON.parse(readFileSync(resolve(root, file), 'utf8')) as GraphDocument)
  const invalid = graphs.filter((_, index) => validateGraph(heads[index]).some((issue) => issue.severity === 'error'))
  if (invalid.length > 0) {
    console.error(`Invalid, so no release is read from it: ${invalid.join(', ')}. Run civic validate.`)
    return 3
  }
  const results = graphs.map((file, index) => ({ graph: file, releases: releasesBetween(base.documents[index], heads[index]!) }))
  if (args.includes('--json')) console.log(JSON.stringify({ since: base.label, graphs: results }, null, 2))
  else {
    const sections = results.filter((result) => result.releases.length > 0).map((result) => `${result.graph}\n\n${renderReleases(result.releases, base.label)}`)
    console.log(sections.length > 0 ? sections.join('\n\n') : `# civic release: no library release since ${base.label}`)
  }
  return results.some((result) => releaseBreaks(result.releases)) ? 1 : 0
}

/**
 * Records the result as a `civic` commit status, the way bin/signoff records `signoff`. A
 * status vouches for one commit, so it is posted only from a clean working tree.
 */
function postStatus(root: string, state: 'success' | 'failure', description: string): void {
  const git = (...rest: string[]) => execFileSync('git', ['-C', root, ...rest], { encoding: 'utf8' }).trim()
  if (git('status', '--porcelain') !== '') throw new Error('Commit or stash your changes first: a civic status covers exactly the committed HEAD.')
  const sha = git('rev-parse', 'HEAD')
  execFileSync('gh', ['api', '--silent', `repos/{owner}/{repo}/statuses/${sha}`, '-f', `state=${state}`, '-f', 'context=civic', '-f', `description=${description}`], { cwd: root, stdio: 'inherit' })
  console.log(`\nPosted civic: ${state} on ${sha}.`)
}

/**
 * Each configured graph as it was where the change started: the merge base of `since` and
 * HEAD, the last revision both sides shared, so work that landed on the base branch since
 * isn't counted as this change's. Undefined where the file didn't exist yet. Paths are
 * relative to the config's directory, as in civic.check.json.
 */
function baseDocuments(root: string, since: string, files: string[]): { label: string; documents: (GraphDocument | undefined)[] } | Error {
  const git = (...rest: string[]) => execFileSync('git', ['-C', root, ...rest], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 256 * 1024 * 1024 }).trim()
  let revision: string
  try {
    revision = git('rev-parse', '--verify', '--quiet', `${since}^{commit}`)
  } catch {
    return new Error(`--since ${since} isn't a revision in this repository. Fetch it first, for example git fetch origin main.`)
  }
  try {
    revision = git('merge-base', revision, 'HEAD')
  } catch {
    // No shared history: compare with the revision itself.
  }
  const documents = files.map((file) => {
    try {
      return JSON.parse(git('show', `${revision}:./${file}`)) as GraphDocument
    } catch {
      return undefined
    }
  })
  return { label: `${since} (${revision.slice(0, 12)})`, documents }
}

const COMMENT_MARKER = '<!-- civic-check -->'

/**
 * Puts the change summary on the pull request as one comment, edited in place on each
 * signoff so the thread holds the latest result, not one per run. Like the status, it is
 * posted only from a clean working tree, and says which commit it describes.
 */
function postComment(root: string, pr: string, text: string): void {
  const git = (...rest: string[]) => execFileSync('git', ['-C', root, ...rest], { encoding: 'utf8' }).trim()
  if (git('status', '--porcelain') !== '') throw new Error('Commit or stash your changes first: a civic comment covers exactly the committed HEAD.')
  const sha = git('rev-parse', 'HEAD')
  const body = `${COMMENT_MARKER}\n${text}\n\n<sub>At ${sha}.</sub>`
  const gh = (...rest: string[]) => execFileSync('gh', rest, { cwd: root, encoding: 'utf8' }).trim()
  const existing = gh('api', '--paginate', `repos/{owner}/{repo}/issues/${pr}/comments`, '--jq', `.[] | select(.body | startswith("${COMMENT_MARKER}")) | .id`).split('\n').filter(Boolean)[0]
  if (existing) gh('api', '--silent', '-X', 'PATCH', `repos/{owner}/{repo}/issues/comments/${existing}`, '-f', `body=${body}`)
  else gh('api', '--silent', `repos/{owner}/{repo}/issues/${pr}/comments`, '-f', `body=${body}`)
  console.log(`\n${existing ? 'Updated' : 'Posted'} the civic comment on pull request #${pr} for ${sha}.`)
}

function option(name: string): string | undefined {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

function isPlatform(value: string): value is Platform {
  return (PLATFORMS as readonly string[]).includes(value)
}

function usage(problem?: string): number {
  if (problem) console.error(problem)
  console.error(
    [
      'Usage:',
      '  civic validate <file>...',
      '  civic forecast <file> <override-id> [--platforms web,ios,android]',
      '  civic overrides <file> <instance-id> [--json]',
      '  civic context <file> <semantic-id> --platform <p> [--variant <key>] [--json]',
      '  civic gaps <file> [--scope <semantic-id>] [--platform <p>] [--json]',
      '  civic completeness <file> <journey-id> [--json]',
      '  civic screen <target-id> [<file>...] [--config civic.check.json] [--today <date>] [--json]',
      '  civic check [<file>...] [--config civic.check.json] [--baseline <file>] [--update-baseline] [--today <date>] [--since <ref>] [--json] [--post] [--comment <pr>]',
      '  civic release [<file>...] --since <ref> [--config civic.check.json] [--json]',
      '  civic decide <decisions.json> <conflict-id> --graph <file> --outcome <o> --classification <c> --by <role>:<who>',
      '               --rationale <text> --evidence <id,...> [--proposal <id>] [--alignment <a>] [--title <t>] [--revisit <text>] [--expires <date>] [--at <time>]',
      '  civic propose <decisions.json> --graph <file> --targets <id,...> --scope <s> --outcome <o> --by <role>:<who> --rationale <text>',
      '               --expected <text> --baseline <tool>:<rev> --candidate <tool>:<rev> [--conflict <id>] [--preview <url>] [--title <t>] [--at <time>]',
      '  civic adopt <decisions.json> <decision-id> --graph <file> --revision <tool>:<rev> --by <role>:<who> [--preview <url>] [--note <text>] [--at <time>]',
      '  civic verify <decisions.json> <adoption-id> --graph <file> --evidence <id,...> --by <role>:<who> [--at <time>]',
      '  civic fixes <file> [--json]',
      '  civic raise <decisions.json> <type> --graph <file> --about <id,...> --summary <text> --by <role>:<who> --owners <role>:<who>,...',
      '               [--perspectives <role,...>] [--platform <p>] [--due <date>] [--impact <text> --revisit <text> --expires <date> [--limitation]] [--title <t>] [--at <time>]',
      '  civic close <decisions.json> <collab-id> --graph <file> --by <role>:<who> --note <text> [--withdraw] [--records <id,...>] [--changes <tool>:<rev>,...] [--at <time>]',
    ].join('\n'),
  )
  return 2
}

process.exitCode = await main()
