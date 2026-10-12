#!/usr/bin/env node
// Builds Laundry's CIVIC graph (roadmap step 9) from its real inputs, captured by
// capture.ts: the journey engine's review index, and a Playwright report from the browser
// specs the index names as its scenarios' checks. Deterministic: the same inputs always give
// byte-identical outputs, and nothing here makes a model call (D30).
//
//   node build.ts           write out/
//   node build.ts --check   fail if out/ is not what the inputs produce

import { readFileSync, writeFileSync } from 'node:fs'
import { assertValid, indexGraph, type Evidence, type Owner } from '../../graph/src/index.ts'
import { assemble, fragment, readJourneyIndex, readPlaywrightReport, type JourneyIndex } from '../../importers/src/index.ts'

const here = (path: string) => new URL(path, import.meta.url)
const text = (path: string) => readFileSync(here(path), 'utf8')
const json = <T>(path: string) => JSON.parse(text(path)) as T

const PREFIX = 'laundry'
// Laundry is one person's app today, so every role is the same person (D25).
const OWNERS: Owner[] = [
  { role: 'engineering', who: 'taymoork2' },
  { role: 'qa', who: 'taymoork2' },
]
// Spec paths in the index are relative to the journey engine's source root; test files in
// the report are relative to Laundry's Playwright test directory.
const SOURCE_ROOT = 'rehearsal/source'
const TEST_DIR = 'apps/web/e2e'

const index = json<JourneyIndex>('inputs/review-index.json')
const journeys = readJourneyIndex(index, {
  prefix: PREFIX,
  platform: 'web',
  owners: OWNERS,
  // Older design-preview specimens: a catalog, not a journey anyone walks.
  catalogs: ['Existing specimens'],
  path: `${SOURCE_ROOT}/apps/web/src/review/scenarios.json`,
})

// A test covers the scenarios its spec file is declared to check. When the test's own body
// opens some of those scenarios by name (`scenario=<id>` in a URL), it covers only those; a
// test that loops over scenarios in code opens none by name, so it keeps the whole set.
const report = json<{ suites: { file: string; specs?: { line: number }[] }[] }>('inputs/playwright-report.json')
const testLines = new Map(report.suites.map((suite) => [suite.file, (suite.specs ?? []).map((spec) => spec.line).sort((a, b) => a - b)]))
const scenarioOf = (targetId: string) => targetId.slice(`target:${PREFIX}.`.length)
function subjectsFor(spec: { file: string; line: number }): string[] {
  const declared = journeys.checks.get(`${TEST_DIR}/${spec.file}`) ?? []
  const lines = readFileSync(new URL(`../../${SOURCE_ROOT}/${TEST_DIR}/${spec.file}`, import.meta.url), 'utf8').split('\n')
  const next = (testLines.get(spec.file) ?? []).find((line) => line > spec.line) ?? lines.length + 1
  const body = lines.slice(spec.line - 1, next - 1).join('\n')
  const named = declared.filter((id) => new RegExp(`scenario=${scenarioOf(id).replaceAll('.', '\\.')}(?![\\w.-])`).test(body))
  return named.length > 0 ? named : declared
}
const evidence = readPlaywrightReport(report, 'web', { subjectsFor, pathFor: (file) => `${SOURCE_ROOT}/${TEST_DIR}/${file}` })

const graph = assemble(journeys.fragment, fragment(evidence))
assertValid(graph)

// --- What a reader sees: run evidence per journey, then every failing test ---------------

const indexed = indexGraph(graph)
const runsOn = (id: string) => evidence.filter((item) => item.subjectIds.includes(id))
const groups = indexed.ofKind('target').filter((target) => target.scale === 'journey' || target.scale === 'surface')
const rows = groups.map((group) => {
  const screens = indexed.linksFrom(group.id).filter((link) => link.relation === 'contains').map((link) => link.to!)
  const failing = screens.filter((id) => runsOn(id).some((item) => item.outcome === 'fail')).length
  const passing = screens.filter((id) => runsOn(id).length > 0 && runsOn(id).every((item) => item.outcome === 'pass')).length
  return `| ${group.title} | ${group.scale} | ${screens.length} | ${passing} | ${failing} | ${screens.length - passing - failing} |`
})
const failed = evidence.filter((item) => item.outcome === 'fail')
const line = (item: Evidence) => `- **${item.title}** (\`${item.source.path}\`, ${item.source.anchor}): ${item.finding} Covers ${item.subjectIds.length} screen(s): ${item.subjectIds.map((id) => `\`${scenarioOf(id)}\``).join(', ')}.`
const screens = indexed.ofKind('target').filter((target) => target.scale === 'screen').length
const runs = `# Laundry: run evidence by journey

Built by \`node projects/laundry/build.ts\` from the journey engine's review index and a Playwright report of Laundry's own review specs, both captured at commit \`${index.revision.head.slice(0, 12)}\`. ${screens} screens, ${evidence.length} tests: ${evidence.length - failed.length} passed, ${failed.length} failed.

A screen passes when every test that covers it passed, and fails when any did. The specs run against the review server's synthetic fixtures, not a household backend.

| Journey | Kind | Screens | Passing | Failing | No run evidence |
|---|---|---|---|---|---|
${rows.join('\n')}

## Failing tests

${failed.length > 0 ? failed.map(line).join('\n') : 'None.'}
`

const outputs: Record<string, string> = {
  'out/graph.json': `${JSON.stringify(graph, null, 2)}\n`,
  'out/runs.md': runs,
}
const summary = `${graph.records.length} records, ${graph.links.length} links, ${evidence.length} test(s) with ${failed.length} failing`
if (process.argv.includes('--check')) {
  const stale = Object.entries(outputs).filter(([path, body]) => {
    try {
      return text(path) !== body
    } catch {
      return true
    }
  })
  if (stale.length > 0) {
    console.error(`Out of date: ${stale.map(([path]) => path).join(', ')}. Run node projects/laundry/build.ts and commit the result.`)
    process.exitCode = 1
  } else {
    console.log(`projects/laundry/out is current: ${summary}.`)
  }
} else {
  for (const [path, body] of Object.entries(outputs)) writeFileSync(here(path), body)
  console.log(`Wrote projects/laundry/out: ${summary}.`)
}
