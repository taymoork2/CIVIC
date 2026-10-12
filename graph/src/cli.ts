#!/usr/bin/env node
// civic: validate graph files, forecast overrides, export contracts and gaps (D31), run the
// gate, and record a person's decision on a conflict. Every command but `decide` is read-only;
// all are deterministic, and none makes a model call (D30).
//
//   civic validate <file>...
//   civic forecast <file> <override-id> [--platforms web,ios,android]
//   civic overrides <file> <instance-id> [--json]
//   civic context <file> <semantic-id> --platform <p> [--variant <key>] [--json]
//   civic gaps <file> [--scope <semantic-id>] [--platform <p>] [--json]
//   civic completeness <file> <journey-id> [--json]
//   civic screen <target-id> [<file>...] [--config civic.check.json] [--today <date>] [--json]
//   civic check [<file>...] [--config civic.check.json] [--baseline <file>] [--update-baseline] [--today <date>] [--json] [--post]
//   civic decide <decisions.json> <conflict-id> --graph <file> --outcome <o> --classification <c> --by <role>:<who>
//                --rationale <text> --evidence <id,...> [--alignment <a>] [--title <t>] [--revisit <text>] [--expires <date>] [--at <time>]

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { baselineFrom, checkDocument, compareToBaseline, DEFAULT_BLOCKING, FINDING_KINDS, renderCheck, statusLine, type Baseline, type FindingKind } from './check.ts'
import { completenessOf, renderCompleteness } from './completeness.ts'
import { ALIGNMENT_FOR, DECISION_FILE_SCHEMA, recordDecision, type DecisionFile } from './decisions.ts'
import { contextFor, renderWorkOrder } from './context.ts'
import { forecastOverride } from './forecast.ts'
import { gapsIn, renderGaps } from './gaps.ts'
import { renderInstanceReview, reviewInstance } from './overrides.ts'
import { renderScreen, screenFacts } from './screen.ts'
import { indexGraph } from './graph.ts'
import { loadGraph, readGraphFile } from './load.ts'
import { CLASSIFICATIONS, DECISION_OUTCOMES, PLATFORMS, ROLES, type AlignmentState, type Classification, type DecisionOutcome, type GraphDocument, type Platform, type Role } from './schema.ts'
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
  if (command === 'screen') return screen()
  if (command === 'decide' && args.length >= 2) return decide(args[0]!, args[1]!)
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
  const [role, who] = (option('--by') ?? '').split(':') as [string, string | undefined]
  if (!(ROLES as readonly string[]).includes(role) || !who) return usage(`--by is <role>:<who>, where role is one of ${ROLES.join(', ')}.`)
  const rationale = option('--rationale')
  if (!rationale) return usage('--rationale says why, in a sentence or two.')
  const evidenceIds = (option('--evidence') ?? '').split(',').filter(Boolean)
  const revisitTrigger = option('--revisit')
  const expires = option('--expires')

  const document = (await readGraphFile(graphPath)) as GraphDocument
  const conflict = Array.isArray(document.records) ? document.records.find((record) => record.id === conflictId) : undefined
  const existing: DecisionFile = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as DecisionFile) : { schema: DECISION_FILE_SCHEMA, decisions: [] }
  if (existing.schema !== DECISION_FILE_SCHEMA) return usage(`${file} is not a decision file (schema ${DECISION_FILE_SCHEMA}).`)
  const { file: next, decision } = recordDecision(existing, {
    title: option('--title') ?? `Decision on ${conflict?.title ?? conflictId}`,
    conflictId,
    outcome: outcome as DecisionOutcome,
    classification: classification as Classification,
    alignment: alignment as AlignmentState,
    decidedBy: { role: role as Role, who },
    at: option('--at') ?? new Date().toISOString(),
    rationale,
    evidenceIds,
    ...(revisitTrigger ? { revisitTrigger } : {}),
    ...(expires ? { expires } : {}),
  })

  // The graph with this file's decisions in place of any it already holds.
  const candidate = { ...document, records: [...document.records.filter((record) => record.kind !== 'decision'), ...next.decisions] }
  const issues = validateGraph(candidate).filter((issue) => issue.severity === 'error' || issue.at === decision.id)
  const errors = issues.filter((issue) => issue.severity === 'error')
  for (const issue of issues) console.error(`  ${issue.severity} ${issue.code} at ${issue.at}: ${issue.message}`)
  if (errors.length > 0) {
    console.error(`Not recorded: ${errors.length} error(s) with this decision on ${graphPath}.`)
    return 1
  }
  writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`)
  console.log(`Recorded ${decision.id} in ${file}${decision.supersedes ? `, superseding ${decision.supersedes}` : ''}. Rebuild the graph, then run civic check.`)
  return 0
}

/** The project's gate settings: which graphs to check, the baseline, and optionally which kinds block. */
interface CheckConfig {
  graphs: string[]
  baseline?: string
  blocking?: FindingKind[]
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
    const facts = screenFacts(indexGraph(document), file, targetId, { today, ...(baseline ? { baseline } : {}) })
    console.log(args.includes('--json') ? JSON.stringify(facts, null, 2) : renderScreen(facts))
    return 0
  }
  console.error(`No graph has ${targetId}.`)
  return 3
}

async function check(): Promise<number> {
  const valued = new Set(['--config', '--baseline', '--today'])
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

  const checks = config.graphs.map((file) => checkDocument(file, JSON.parse(readFileSync(resolve(root, file), 'utf8')), { today }))
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
  console.log(args.includes('--json') ? JSON.stringify(report, null, 2) : renderCheck(report))
  if (args.includes('--post')) postStatus(root, report.passed ? 'success' : 'failure', statusLine(report))
  return report.passed ? 0 : 1
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
      '  civic check [<file>...] [--config civic.check.json] [--baseline <file>] [--update-baseline] [--today <date>] [--json] [--post]',
      '  civic decide <decisions.json> <conflict-id> --graph <file> --outcome <o> --classification <c> --by <role>:<who>',
      '               --rationale <text> --evidence <id,...> [--alignment <a>] [--title <t>] [--revisit <text>] [--expires <date>] [--at <time>]',
    ].join('\n'),
  )
  return 2
}

process.exitCode = await main()
