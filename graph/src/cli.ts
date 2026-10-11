#!/usr/bin/env node
// civic: validate graph files, forecast overrides, and export contracts and gaps (D31).
// Every command is read-only and deterministic, and none makes a model call (D30).
//
//   civic validate <file>...
//   civic forecast <file> <override-id> [--platforms web,ios,android]
//   civic context <file> <semantic-id> --platform <p> [--variant <key>] [--json]
//   civic gaps <file> [--scope <semantic-id>] [--platform <p>] [--json]

import { contextFor, renderWorkOrder } from './context.ts'
import { forecastOverride } from './forecast.ts'
import { gapsIn, renderGaps } from './gaps.ts'
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
  return usage()
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
      '  civic context <file> <semantic-id> --platform <p> [--variant <key>] [--json]',
      '  civic gaps <file> [--scope <semantic-id>] [--platform <p>] [--json]',
    ].join('\n'),
  )
  return 2
}

process.exitCode = await main()
