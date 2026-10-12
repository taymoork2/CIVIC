#!/usr/bin/env node
// Builds the discovery example's CIVIC graph from CIVIC's crawl of it (D34), plus a person's
// confirmations when there are any. Deterministic, and no model calls (D30).
//
//   node build.ts           write out/
//   node build.ts --check   fail if out/ is not what the inputs produce

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { assertValid, type Owner } from '../../graph/src/index.ts'
import { applyConfirmations, assemble, fragment, readCrawl, type ConfirmationFile } from '../../importers/src/index.ts'

const here = (path: string) => new URL(path, import.meta.url)
const text = (path: string) => readFileSync(here(path), 'utf8')

const PREFIX = 'notes'
const OWNERS: Owner[] = [{ role: 'engineering', who: 'taymoork2' }]

const crawl = JSON.parse(text('inputs/crawl.json')) as { states: { id: string; title: string; location: string }[]; transitions: { from: string; to: string; action: { name: string } }[]; blocked: { from: string; action: { name: string }; reason: string }[]; unreached: { from: string; action: { name: string }; reason: string }[]; revision: string; truncated: boolean }
let graph = assemble(readCrawl(crawl, { prefix: PREFIX, owners: OWNERS, path: 'projects/discovery-app/inputs/crawl.json' }))
// A person confirms what the crawl found in confirmations.json. Until then everything stays discovered or proposed.
const confirmed = existsSync(here('confirmations.json'))
if (confirmed) {
  const body = text('confirmations.json')
  const applied = applyConfirmations(graph, JSON.parse(body) as ConfirmationFile, 'projects/discovery-app/confirmations.json', body)
  graph = assemble(fragment(applied.records, applied.links))
}
assertValid(graph)

const targets = graph.records.filter((record) => record.kind === 'target' && record.scale === 'screen')
const presence = (id: string) => graph.records.find((record) => record.id === `target:${PREFIX}.${id}` && record.kind === 'target')
const status = (from: string, to: string, action: string) => graph.links.find((link) => link.from === `target:${PREFIX}.${from}` && link.to === `target:${PREFIX}.${to}` && link.action === action)?.status
const report = `# Notes example: what the crawl found

Built by \`node projects/discovery-app/build.ts\` from CIVIC's crawl of the journey engine's manifest-free discovery example at commit \`${crawl.revision.slice(0, 12)}\`. ${targets.length} screens and ${crawl.transitions.length} paths. ${confirmed ? 'A person confirmed some of them in `confirmations.json`.' : 'Nobody has confirmed them yet, so every screen is discovered and every path proposed; none counts for readiness.'}

## Screens

| Screen | Location | Presence |
|---|---|---|
${crawl.states.map((state) => `| ${state.title} (\`${state.id}\`) | \`${state.location}\` | ${(presence(state.id) as { presence?: string } | undefined)?.presence} |`).join('\n')}

## Paths

| From | Action | To | Status |
|---|---|---|---|
${crawl.transitions.map((edge) => `| \`${edge.from}\` | ${edge.action.name} | \`${edge.to}\` | ${status(edge.from, edge.to, edge.action.name)} |`).join('\n')}

## Not taken

${[...crawl.blocked.map((skip) => `- Blocked on \`${skip.from}\`: ${skip.action.name} (${skip.reason}).`), ...crawl.unreached.map((skip) => `- Not reached from \`${skip.from}\`: ${skip.action.name} (${skip.reason}).`)].join('\n') || 'Every action was taken.'}${crawl.truncated ? '\n\nA limit stopped the crawl before every action was tried.' : ''}
`

const outputs: Record<string, string> = { 'out/graph.json': `${JSON.stringify(graph, null, 2)}\n`, 'out/crawl.md': report }
const summary = `${graph.records.length} records, ${graph.links.length} links`
if (process.argv.includes('--check')) {
  const stale = Object.entries(outputs).filter(([path, body]) => !existsSync(here(path)) || text(path) !== body)
  if (stale.length > 0) {
    console.error(`Out of date: ${stale.map(([path]) => path).join(', ')}. Run node projects/discovery-app/build.ts and commit the result.`)
    process.exitCode = 1
  } else console.log(`projects/discovery-app/out is current: ${summary}.`)
} else {
  for (const [path, body] of Object.entries(outputs)) writeFileSync(here(path), body)
  console.log(`Wrote projects/discovery-app/out: ${summary}.`)
}
