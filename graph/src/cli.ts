#!/usr/bin/env node
// civic: validate graph files, forecast overrides, and export contracts and gaps (D31).
// Every command is read-only and deterministic, and none makes a model call (D30).
//
//   civic validate <file>...
//   civic forecast <file> <override-id> [--platforms web,ios,android]
//   civic overrides <file> <instance-id> [--json]
//   civic context <file> <semantic-id> --platform <p> [--variant <key>] [--json]
//   civic gaps <file> [--scope <semantic-id>] [--platform <p>] [--json]
//   civic completeness <file> <journey-id> [--json]
//   civic check [<file>...] [--config civic.check.json] [--baseline <file>] [--update-baseline] [--today <date>] [--json] [--post]

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { baselineFrom, checkDocument, compareToBaseline, DEFAULT_BLOCKING, FINDING_KINDS, renderCheck, statusLine, type Baseline, type FindingKind } from './check.ts'
import { completenessOf, renderCompleteness } from './completeness.ts'
import { contextFor, renderWorkOrder } from './context.ts'
import { forecastOverride } from './forecast.ts'
import { gapsIn, renderGaps } from './gaps.ts'
import { renderInstanceReview, reviewInstance } from './overrides.ts'
import { loadGraph, readGraphFile } from './load.ts'
import { PLATFORMS, type Platform } from './schema.ts'
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
  return usage()
}

/** The project's gate settings: which graphs to check, the baseline, and optionally which kinds block. */
interface CheckConfig {
  graphs: string[]
  baseline?: string
  blocking?: FindingKind[]
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
      '  civic check [<file>...] [--config civic.check.json] [--baseline <file>] [--update-baseline] [--today <date>] [--json] [--post]',
    ].join('\n'),
  )
  return 2
}

process.exitCode = await main()
