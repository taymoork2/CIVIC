#!/usr/bin/env node
// civic-graph: validate graph files and forecast overrides. Read-only and deterministic.
//
//   civic-graph validate <file>...
//   civic-graph forecast <file> <override-id> [--platforms web,ios,android]

import { forecastOverride } from './forecast.ts'
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
  return usage()
}

function usage(problem?: string): number {
  if (problem) console.error(problem)
  console.error('Usage:\n  civic-graph validate <file>...\n  civic-graph forecast <file> <override-id> [--platforms web,ios,android]')
  return 2
}

process.exitCode = await main()
