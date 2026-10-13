#!/usr/bin/env node
// Builds Laundry's CIVIC graph (roadmap step 9) from its real inputs, captured by
// capture.ts: the journey engine's review index and coverage contract, and a Playwright report from the browser
// specs the index names as its scenarios' checks. It also reads Laundry's design reference
// from Open Design as a design file CIVIC registers as a design line. Deterministic: the same inputs always give
// byte-identical outputs, and nothing here makes a model call (D30).
//
//   node build.ts           write out/
//   node build.ts --check   fail if out/ is not what the inputs produce

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { assertValid, indexGraph, type CollaborationRecord, type DecisionFile, type Evidence, type Owner } from '../../graph/src/index.ts'
import { applyDecisions, assemble, compareCssTokens, contentHash, fragment, readCoverageContract, readCssTokens, readJourneyIndex, readPlaywrightReport, readRenderReceipt, readReplays, type CoverageContract, type JourneyIndex, type RenderReceipt, type ReplayRecord } from '../../importers/src/index.ts'

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
const SOURCE_ROOT = 'journey-engine/source'
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
const tests = readPlaywrightReport(report, 'web', { subjectsFor, pathFor: (file) => `${SOURCE_ROOT}/${TEST_DIR}/${file}` })
// Recorded runs a person replayed in the canvas at the captured commit (decision 0009).
const replays = existsSync(here('inputs/replays.json')) ? json<ReplayRecord[]>('inputs/replays.json') : []
const replayed = readReplays(replays, { prefix: PREFIX, platform: 'web', path: 'projects/laundry/inputs/replays.json', targetIds: new Set(journeys.fragment.records.map((record) => record.id)) })
const evidence = [...tests, ...replayed]

// The coverage contract (roadmap step 3): each expectation the app can't yet show and prove
// with a passing run is an open Coverage gap, owned like any other collaboration record.
const coverageText = text('inputs/coverage.json')
const coverage = readCoverageContract(JSON.parse(coverageText) as CoverageContract, coverageText, {
  prefix: PREFIX,
  platform: 'web',
  owners: OWNERS,
  raisedBy: { role: 'qa', who: 'taymoork2' },
  at: evidence.map((item) => item.capturedAt).sort().at(-1) ?? index.revision.head,
  path: `${SOURCE_ROOT}/docs/design/review-product/coverage.json`,
  revision: index.revision.head,
  targetIds: new Set(journeys.fragment.records.map((record) => record.id)),
  evidence,
})

// --- Tokens (roadmap order of work, item 2) --------------------------------------------------
// The design reference's custom properties against the ones Laundry's token build generates,
// by name. A name both set differently is an open conflict a person decides; the reference's
// roles the code has no token for are listed in out/tokens.md.
const DESIGN_TOKENS = ['journey-engine/design/laundry-reference/colors_and_type.css', 'journey-engine/design/laundry-reference/tokens.css']
const CODE_TOKENS = `${SOURCE_ROOT}/apps/web/src/generated/tokens.css`
const repoText = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
const at = evidence.map((item) => item.capturedAt).sort().at(-1) ?? index.revision.head
const tokenEvidence = (id: string, title: string, paths: string[], method: Evidence['method'], finding: string): Evidence => ({
  id, kind: 'evidence', title, subjectIds: [], tier: 'static-analysis', method, platform: 'web', outcome: 'finding', finding, capturedAt: at,
  source: { tool: method === 'design-export' ? 'open-design' : 'style-dictionary', importer: 'css-tokens', revision: index.revision.head, path: paths.join(' '), contentHash: contentHash(paths.map(repoText).join('')) },
})
// Each theme is compared on its own: the default, then the dark theme laid over it.
const THEMES = ['default', 'dark'] as const
const designTokens = Object.fromEntries(THEMES.map((theme) => [theme, readCssTokens(DESIGN_TOKENS.map(repoText), theme)])) as Record<(typeof THEMES)[number], Map<string, string>>
const codeTokens = Object.fromEntries(THEMES.map((theme) => [theme, readCssTokens(repoText(CODE_TOKENS), theme)])) as Record<(typeof THEMES)[number], Map<string, string>>
const designEvidence = tokenEvidence('evidence:design-export.laundry-tokens', 'Design reference tokens', DESIGN_TOKENS, 'design-export', `${designTokens.default.size} custom properties in the default theme, ${designTokens.dark.size} in the dark theme.`)
const codeEvidence = tokenEvidence('evidence:token-analysis.laundry-tokens', 'Generated web tokens', [CODE_TOKENS], 'token-analysis', `${codeTokens.default.size} custom properties in the default theme, ${codeTokens.dark.size} in the dark theme.`)
const darkOwn = new Set([designTokens, codeTokens].flatMap((side) => [...side.dark].filter(([name, value]) => side.default.get(name) !== value).map(([name]) => name)))
const tokenOwners: Owner[] = [{ role: 'design', who: 'taymoork2' }, ...OWNERS.filter((owner) => owner.role === 'engineering')]
const themes = THEMES.map((theme) => ({
  theme,
  ...compareCssTokens(
    { tokens: designTokens[theme], label: "Laundry's design reference", evidence: designEvidence },
    { tokens: codeTokens[theme], label: "Laundry's generated tokens.css", evidence: codeEvidence },
    // The dark theme is compared only where it sets something itself, on either side, so a
    // name it inherits isn't raised twice.
    { owners: tokenOwners, theme, ...(theme === 'dark' ? { names: darkOwn } : {}) },
  ),
}))
const tokenRecords = [...new Map(themes.flatMap((compared) => compared.tokens).map((token) => [token.id, token])).values()]
const tokenConflicts = themes.flatMap((compared) => compared.conflicts)
for (const side of [designEvidence, codeEvidence]) side.subjectIds = tokenRecords.map((token) => token.id)

// A person's calls on the conflicts (roadmap step 3), from decisions.json.
const decisions = json<DecisionFile>('decisions.json')
const graph = applyDecisions(assemble(journeys.fragment, fragment(evidence), coverage, fragment([...tokenRecords, designEvidence, codeEvidence, ...tokenConflicts])), decisions)
assertValid(graph)

// --- The design reference (roadmap order of work, item 2) ------------------------------------
// Laundry's design system lives in Open Design, not Figma. Its source-render receipt lists
// the screens designers review proposals beside, rendered from the app's own components by
// the design-preview route. The review frame renders scenario `legacy.<screen>` as that same
// design-preview screen (apps/web/src/review/laundry-frame.tsx), so each case designs that
// scenario's target, when the index has it.
const REFERENCE = 'journey-engine/design/laundry-reference/source-reference/receipt.json'
const targetIds = new Set(journeys.fragment.records.map((record) => record.id))
const design = readRenderReceipt(JSON.parse(readFileSync(new URL(`../../${REFERENCE}`, import.meta.url), 'utf8')) as RenderReceipt, {
  tool: 'open-design',
  // The Open Design source project the reference belongs to (its README's Source Context).
  key: '1dee16e6-3eaa-46ef-a677-6376e4cdc75f',
  name: 'Laundry design reference',
  link: REFERENCE,
  designs: (screen) => [`target:${PREFIX}.legacy.${screen}`].filter((id) => targetIds.has(id)),
})
const designed = new Set(design.frames.flatMap((frame) => frame.designs ?? []))
const undesigned = [...new Set(design.frames.filter((frame) => frame.designs?.length === 0).map((frame) => frame.page))]

// --- What a reader sees: run evidence per journey, then every failing test ---------------

const indexed = indexGraph(graph)
const runsOn = (id: string) => evidence.filter((item) => item.subjectIds.includes(id))
const expectation = (id: string) => id.startsWith(`target:${PREFIX}.expectation.`)
const groups = indexed.ofKind('target').filter((target) => (target.scale === 'journey' || target.scale === 'surface') && !expectation(target.id))
const rows = groups.map((group) => {
  const screens = indexed.linksFrom(group.id).filter((link) => link.relation === 'contains').map((link) => link.to!)
  const failing = screens.filter((id) => runsOn(id).some((item) => item.outcome === 'fail')).length
  const passing = screens.filter((id) => runsOn(id).length > 0 && runsOn(id).every((item) => item.outcome === 'pass')).length
  return `| ${group.title} | ${group.scale} | ${screens.length} | ${passing} | ${failing} | ${screens.length - passing - failing} |`
})
const failed = evidence.filter((item) => item.outcome === 'fail')
const line = (item: Evidence) => `- **${item.title}** (\`${item.source.path}\`, ${item.source.anchor}): ${item.finding} Covers ${item.subjectIds.length} screen(s): ${item.subjectIds.map((id) => `\`${scenarioOf(id)}\``).join(', ')}.`
const screens = indexed.ofKind('target').filter((target) => target.scale === 'screen' && !expectation(target.id)).length
const runs = `# Laundry: run evidence by journey

Built by \`node projects/laundry/build.ts\` from the journey engine's review index and a Playwright report of Laundry's own review specs, both captured at commit \`${index.revision.head.slice(0, 12)}\`. ${screens} screens, ${evidence.length} tests and replayed runs: ${evidence.length - failed.length} passed, ${failed.length} failed. ${replayed.length === 0 ? 'No recorded run has been replayed at this commit.' : `${replayed.length} of them are recorded runs replayed in the canvas.`}

A screen passes when every test that covers it passed, and fails when any did. The specs run against the review server's synthetic fixtures, not a household backend.

| Journey | Kind | Screens | Passing | Failing | No run evidence |
|---|---|---|---|---|---|
${rows.join('\n')}

## Failing tests

${failed.length > 0 ? failed.map(line).join('\n') : 'None.'}
`

const gaps = coverage.records.filter((record): record is CollaborationRecord => record.kind === 'collaboration')
const expectations = coverage.records.filter((record) => record.kind === 'target').length
const coverageReport = `# Laundry: coverage gaps

Built by \`node projects/laundry/build.ts\` from the journey engine's coverage contract and the same run evidence, at commit \`${index.revision.head.slice(0, 12)}\`. ${gaps.length} of ${expectations} declared expectations can't yet be shown and proven with a passing run. Each is an open Coverage gap record in [\`graph.json\`](graph.json), and the gate reports it as advisory.

| Expectation | Gap | Record |
|---|---|---|
${gaps.map((gap) => `| ${gap.title.replace(/^Coverage gap: /, '')} | ${gap.summary} | \`${gap.id}\` |`).join('\n')}
`

const designReport = `# Laundry: design reference

Built by \`node projects/laundry/build.ts\` from Open Design's source-render receipt, [\`${REFERENCE}\`](../../../${REFERENCE}), generated ${design.version}. [\`design.json\`](design.json) is that reference as a \`civic.design/0\` file: ${design.frames.length} frames on ${new Set(design.frames.map((frame) => frame.page)).size} screens, each one screen at one viewport, theme and text scale. They design ${designed.size} of Laundry's screens. ${undesigned.length === 0 ? 'Every screen in the reference is a screen in the graph.' : `${undesigned.length} reference screen(s) match no screen in the graph: ${undesigned.map((page) => `\`${page}\``).join(', ')}.`}

Register it as Laundry's design line with \`bin/civic design projects/laundry/out/design.json\`, and a designer's proposal as a draft with \`bin/civic draft <its design.json> --name "<draft>"\`. \`bin/civic lens <draft line>\` then says which frames the proposal changes and reads each one on this code line.
`

const decisionFor = (conflictId: string) => decisions.decisions.find((decision) => decision.conflictId === conflictId)
const themeSection = ({ theme, tokens: shared, conflicts, agreed, designOnly }: (typeof themes)[number]) => `## ${theme === 'default' ? 'Default theme' : 'Dark theme'}

${theme === 'default' ? `The design reference sets ${designTokens[theme].size} and the code ${codeTokens[theme].size}; ${shared.length} names are set by both.` : `Only the names the dark theme sets itself, on either side, are compared again: ${shared.length} of them are set by both.`} ${conflicts.length} ${conflicts.length === 1 ? 'is' : 'are'} set differently, ${agreed.length} the same, and ${designOnly.length} only in the reference.

${conflicts.length > 0 ? `| Token | Design reference | Code | Decision |\n|---|---|---|---|\n${conflicts.map((conflict) => { const name = conflict.targetId.slice('token:'.length); const call = decisionFor(conflict.id); return `| \`--${name}\` | ${designTokens[theme].get(name)} | ${codeTokens[theme].get(name)} | ${call ? `${call.outcome}: ${call.title}` : 'Undecided'} |` }).join('\n')}` : 'Nothing is set differently.'}

Set the same: ${agreed.map((name) => `\`--${name}\``).join(', ') || 'none'}.

Only in the design reference: ${designOnly.map((name) => `\`--${name}\``).join(', ') || 'none'}.
`
const tokenReport = `# Laundry: tokens

Built by \`node projects/laundry/build.ts\` from the design reference's stylesheets (${DESIGN_TOKENS.map((path) => `\`${path.split('/').pop()}\``).join(', ')}) and the web tokens Laundry's token build generates (\`${CODE_TOKENS}\`). It compares the custom properties each sets by name, with \`var()\` aliases resolved, for the default theme and for the dark theme laid over it. A name set differently is a Contract Conflict in [\`graph.json\`](graph.json), decided in [\`decisions.json\`](../decisions.json) once someone has said whether the design or the code changes. Names only the reference sets are its own short color names and the layout and motion roles the code writes as literals; they are listed, not raised.

${themes.map(themeSection).join('\n')}`

const outputs: Record<string, string> = {
  'out/graph.json': `${JSON.stringify(graph, null, 2)}\n`,
  'out/design.json': `${JSON.stringify(design, null, 2)}\n`,
  'out/design.md': designReport,
  'out/runs.md': runs,
  'out/coverage.md': coverageReport,
  'out/tokens.md': tokenReport,
}
const summary = `${graph.records.length} records, ${graph.links.length} links, ${tests.length} test(s) and ${replayed.length} replayed run(s), ${failed.length} failing, ${tokenConflicts.length} token conflict(s)`
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
