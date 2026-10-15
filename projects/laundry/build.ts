#!/usr/bin/env node
// Builds Laundry's CIVIC graph (roadmap step 9) from its real inputs, captured by
// capture.ts: the journey engine's review index and coverage contract, and a Playwright report from the browser
// specs the index names as its scenarios' checks. It also reads Laundry's design reference
// from Open Design as a design file CIVIC registers as a design line. Deterministic: the same inputs always give
// byte-identical outputs, and nothing here makes a model call (D30).
//
//   node build.ts           write out/
//   node build.ts --check   fail if out/ is not what the inputs produce

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { assertValid, indexGraph, objectMapOf, renderObjectMap, renderPortal, storiesIn, type CollaborationRecord, type DecisionFile, type Evidence, type Owner } from '../../graph/src/index.ts'
import { applyDecisions, assemble, compareCssTokens, contentHash, findWebComponents, fragment, readComponentFamilies, readCoverageContract, readCssTokens, readJourneyIndex, readOrcaGrid, readPlaywrightReport, readRenderReceipt, readReplays, tieObjects, type CoverageContract, type JourneyIndex, type ObjectTiesFile, type RenderReceipt, type ReplayRecord } from '../../importers/src/index.ts'

const here = (path: string) => new URL(path, import.meta.url)
const text = (path: string) => readFileSync(here(path), 'utf8')
const json = <T>(path: string) => JSON.parse(text(path)) as T

const PREFIX = 'laundry'
// Laundry is one person's app today, so every role is the same person (D25).
const OWNERS: Owner[] = [
  { role: 'engineering', who: 'taymoork2' },
  { role: 'qa', who: 'taymoork2' },
]
// Paths are relative to Laundry's own repository (decision 0010): spec paths in the index from its root, test
// files in the report from its Playwright test directory. What the graph reads from Laundry's source was captured
// with the rest, at the same commit, into inputs/source.json, so the graph builds without a Laundry checkout.
const TEST_DIR = 'apps/web/e2e'
const source = json<{ repository: string; revision: string; specs: Record<string, string>; tokens: { path: string; text: string }; exports: { path: string; line: number; text: string }[] }>('inputs/source.json')

const index = json<JourneyIndex>('inputs/review-index.json')
if (source.revision !== index.revision.head) throw new Error(`inputs/source.json is from ${source.revision}, the review index from ${index.revision.head}. Capture them together.`)
const journeys = readJourneyIndex(index, {
  prefix: PREFIX,
  platform: 'web',
  owners: OWNERS,
  // Older design-preview specimens: a catalog, not a journey anyone walks.
  catalogs: ['Existing specimens'],
  path: 'apps/web/src/review/scenarios.json',
})

// A test covers the scenarios its spec file is declared to check. When the test's own body
// opens some of those scenarios by name (`scenario=<id>` in a URL), it covers only those; a
// test that loops over scenarios in code opens none by name, so it keeps the whole set.
const report = json<{ suites: { file: string; specs?: { line: number }[] }[] }>('inputs/playwright-report.json')
const testLines = new Map(report.suites.map((suite) => [suite.file, (suite.specs ?? []).map((spec) => spec.line).sort((a, b) => a - b)]))
const scenarioOf = (targetId: string) => targetId.slice(`target:${PREFIX}.`.length)
function subjectsFor(spec: { file: string; line: number }): string[] {
  const declared = journeys.checks.get(`${TEST_DIR}/${spec.file}`) ?? []
  const lines = (source.specs[spec.file] ?? '').split('\n')
  const next = (testLines.get(spec.file) ?? []).find((line) => line > spec.line) ?? lines.length + 1
  const body = lines.slice(spec.line - 1, next - 1).join('\n')
  const named = declared.filter((id) => new RegExp(`scenario=${scenarioOf(id).replaceAll('.', '\\.')}(?![\\w.-])`).test(body))
  return named.length > 0 ? named : declared
}
const tests = readPlaywrightReport(report, 'web', { subjectsFor, pathFor: (file) => `${TEST_DIR}/${file}` })
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
  path: 'docs/design/review-product/coverage.json',
  revision: index.revision.head,
  targetIds: new Set(journeys.fragment.records.map((record) => record.id)),
  evidence,
})

// --- Tokens (roadmap order of work, item 2) --------------------------------------------------
// The design reference's custom properties against the ones Laundry's token build generates,
// by name. A name both set differently is an open conflict a person decides; the reference's
// roles the code has no token for are listed in out/tokens.md.
const DESIGN_TOKENS = ['journey-engine/design/laundry-reference/colors_and_type.css', 'journey-engine/design/laundry-reference/tokens.css']
const CODE_TOKENS = source.tokens.path
// CIVIC's own files, and the one Laundry file captured whole.
const repoText = (path: string) => (path === CODE_TOKENS ? source.tokens.text : readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'))
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
// Names the reference and the app use for different things, compared under the app's own name
// for the reference's role (token-map.json, decided by the owner).
const tokenMap = new Map(json<{ map: { reference: string; app: string }[] }>('token-map.json').map.map((entry) => [entry.reference, entry.app]))
const darkOwn = new Set([designTokens, codeTokens].flatMap((side) => [...side.dark].filter(([name, value]) => side.default.get(name) !== value).map(([name]) => name)))
const tokenOwners: Owner[] = [{ role: 'design', who: 'taymoork2' }, ...OWNERS.filter((owner) => owner.role === 'engineering')]
const themes = THEMES.map((theme) => ({
  theme,
  ...compareCssTokens(
    { tokens: designTokens[theme], label: "Laundry's design reference", evidence: designEvidence },
    { tokens: codeTokens[theme], label: "Laundry's generated tokens.css", evidence: codeEvidence },
    // The dark theme is compared only where it sets something itself, on either side, so a
    // name it inherits isn't raised twice.
    { owners: tokenOwners, theme, map: tokenMap, ...(theme === 'dark' ? { names: darkOwn } : {}) },
  ),
}))
const tokenRecords = [...new Map(themes.flatMap((compared) => compared.tokens).map((token) => [token.id, token])).values()]
const tokenConflicts = themes.flatMap((compared) => compared.conflicts)
for (const side of [designEvidence, codeEvidence]) side.subjectIds = tokenRecords.map((token) => token.id)

// --- Components (roadmap order of work, item 2) ----------------------------------------------
// The reference's component contract names Laundry's component families. Each is a Semantic
// component, and a web component exported under the same name implements it, inferred until
// someone confirms it. Families with no such export are listed in out/components.md.
const CONTRACT = 'journey-engine/design/laundry-reference/COMPONENTS.md'
const WEB_SOURCE = 'apps/web/src'
const componentOwners: Owner[] = [{ role: 'design-engineering', who: 'taymoork2' }]
const families = readComponentFamilies(repoText(CONTRACT), {
  prefix: PREFIX,
  owners: componentOwners,
  source: { tool: 'open-design', importer: 'component-contract', revision: index.revision.head, path: CONTRACT, contentHash: contentHash(repoText(CONTRACT)) },
})
// Each source file as its exported declarations, each on its own line, which is all the match reads.
const exportsIn = new Map<string, string[]>()
for (const declaration of source.exports) {
  const lines = exportsIn.get(declaration.path) ?? []
  lines[declaration.line - 1] = declaration.text
  exportsIn.set(declaration.path, lines)
}
const webSources = [...exportsIn].map(([path, lines]) => ({ path, text: Array.from(lines, (text) => text ?? '').join('\n') }))
const web = findWebComponents(families, webSources, { prefix: PREFIX, package: '@washcloset/web', owners: componentOwners, revision: index.revision.head, evidenceId: 'evidence:source-analysis.laundry-components', capturedAt: at })

// --- The object map (roadmap order of work, item 2; decision 0014, point 8) --------------
// Laundry's objects from an ORCA grid, owned by Design, and the targets tied to them. No
// grid exists for Laundry yet, so inputs/orca-grid.csv and objects.json are a stand-in
// written from the review index's scenario names, components and path actions; a
// designer's own grid and ties replace them. CIVIC suggests ties where a screen's name
// names an object, and they count once a person confirms them in objects.json.
const ORCA_GRID = 'projects/laundry/inputs/orca-grid.csv'
const OBJECT_TIES = 'projects/laundry/objects.json'
const gridText = text('inputs/orca-grid.csv')
const tiesText = text('objects.json')
const objects = readOrcaGrid(gridText, {
  prefix: PREFIX,
  owners: [{ role: 'design', who: 'taymoork2' }],
  source: { tool: 'stand-in', importer: 'orca-grid', revision: contentHash(gridText), path: ORCA_GRID, contentHash: contentHash(gridText) },
})
const targetRecords = journeys.fragment.records.filter((record) => record.kind === 'target')
const ties = tieObjects(objects, targetRecords, JSON.parse(tiesText) as ObjectTiesFile, { source: { tool: 'civic', importer: 'object-ties', revision: contentHash(tiesText), path: OBJECT_TIES, contentHash: contentHash(tiesText) } })

// A person's calls on the conflicts (roadmap step 3), from decisions.json.
const decisions = json<DecisionFile>('decisions.json')
const graph = applyDecisions(assemble(journeys.fragment, fragment(evidence), coverage, fragment([...tokenRecords, designEvidence, codeEvidence, ...tokenConflicts]), fragment([...families, ...web.components, web.evidence], web.links), fragment(objects, ties)), decisions)
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

Built by \`node projects/laundry/build.ts\` from Laundry's review index and a Playwright report of its own review specs, both captured from a Laundry checkout at ${source.repository} commit \`${index.revision.head.slice(0, 12)}\`. ${screens} screens, ${evidence.length} tests and replayed runs: ${evidence.length - failed.length} passed, ${failed.length} failed. ${replayed.length === 0 ? 'No recorded run has been replayed at this commit.' : `${replayed.length} of them are recorded runs replayed in the canvas.`}

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

Built by \`node projects/laundry/build.ts\` from Laundry's coverage contract and the same run evidence, at ${source.repository} commit \`${index.revision.head.slice(0, 12)}\`. ${gaps.length} of ${expectations} declared expectations can't yet be shown and proven with a passing run. Each is an open Coverage gap record in [\`graph.json\`](graph.json), and the gate reports it as advisory.

| Expectation | Gap | Record |
|---|---|---|
${gaps.map((gap) => `| ${gap.title.replace(/^Coverage gap: /, '')} | ${gap.summary} | \`${gap.id}\` |`).join('\n')}
`

const designReport = `# Laundry: design reference

Built by \`node projects/laundry/build.ts\` from Open Design's source-render receipt, [\`${REFERENCE}\`](../../../${REFERENCE}), generated ${design.version}. [\`design.json\`](design.json) is that reference as a \`civic.design/0\` file: ${design.frames.length} frames on ${new Set(design.frames.map((frame) => frame.page)).size} screens, each one screen at one viewport, theme and text scale. They design ${designed.size} of Laundry's screens. ${undesigned.length === 0 ? 'Every screen in the reference is a screen in the graph.' : `${undesigned.length} reference screen(s) match no screen in the graph: ${undesigned.map((page) => `\`${page}\``).join(', ')}.`}

Register it as Laundry's design line with \`bin/civic design projects/laundry/out/design.json\`, and a designer's proposal as a draft with \`bin/civic draft <its design.json> --name "<draft>"\`. \`bin/civic lens <draft line>\` then says which frames the proposal changes and reads each one on this code line.
`

// The decision in force: the one no later decision on the same conflict supersedes.
const decisionFor = (conflictId: string) => {
  const on = decisions.decisions.filter((decision) => decision.conflictId === conflictId)
  return on.filter((decision) => !on.some((other) => other.supersedes === decision.id)).at(-1)
}
const themeSection = ({ theme, tokens: shared, conflicts, agreed, designOnly, mapped }: (typeof themes)[number]) => `## ${theme === 'default' ? 'Default theme' : 'Dark theme'}

${theme === 'default' ? `The design reference sets ${designTokens[theme].size} and the code ${codeTokens[theme].size}; ${shared.length} names are compared.` : `Only the names the dark theme sets itself, on either side, are compared again: ${shared.length} of them.`} ${conflicts.length} ${conflicts.length === 1 ? 'is' : 'are'} set differently, ${agreed.length} the same, and ${designOnly.length} only in the reference.

${conflicts.length > 0 ? `| Token | Design reference | Code | Decision |\n|---|---|---|---|\n${conflicts.map((conflict) => { const name = conflict.targetId.slice('token:'.length); const as = tokenMap.get(name) ?? name; const call = decisionFor(conflict.id); return `| \`--${name}\`${as === name ? '' : ` as \`--${as}\``} | ${designTokens[theme].get(name)} | ${codeTokens[theme].get(as) ?? 'not set yet'} | ${call ? `${call.outcome}: ${call.title}` : 'Undecided'} |` }).join('\n')}` : 'Nothing is set differently.'}

${mapped.length > 0 ? `Compared under the app's own name, because the two use the same name for different things ([\`token-map.json\`](../token-map.json)): ${mapped.map(([name, as]) => `\`--${name}\` as \`--${as}\``).join(', ')}. The app's own ${mapped.map(([name]) => `\`--${name}\``).join(', ')} ${mapped.length === 1 ? 'keeps its' : 'keep their'} meaning and ${mapped.length === 1 ? "isn't" : "aren't"} compared with the reference.` : ''}

Set the same: ${agreed.map((name) => `\`--${name}\``).join(', ') || 'none'}.

Only in the design reference: ${designOnly.map((name) => `\`--${name}\``).join(', ') || 'none'}.
`
const tokenReport = `# Laundry: tokens

Built by \`node projects/laundry/build.ts\` from the design reference's stylesheets (${DESIGN_TOKENS.map((path) => `\`${path.split('/').pop()}\``).join(', ')}) and the web tokens Laundry's token build generates (\`${CODE_TOKENS}\` in ${source.repository}, captured at \`${source.revision.slice(0, 12)}\`). It compares the custom properties each sets by name, with \`var()\` aliases resolved, for the default theme and for the dark theme laid over it. A name set differently is a Contract Conflict in [\`graph.json\`](graph.json), decided in [\`decisions.json\`](../decisions.json) once someone has said whether the design or the code changes. Names only the reference sets are its own short color names and the layout and motion roles the code writes as literals; they are listed, not raised.

${themes.map(themeSection).join('\n')}`

const componentReport = `# Laundry: components

Built by \`node projects/laundry/build.ts\` from the design reference's component contract, [\`${CONTRACT}\`](../../../${CONTRACT}), and the exported declarations in Laundry's web source (\`${WEB_SOURCE}\` in ${source.repository}, captured at \`${source.revision.slice(0, 12)}\`). Each of the contract's ${families.length} component families is a Semantic component in [\`graph.json\`](graph.json). A web component exported under the family's name in PascalCase implements it. That link is inferred until someone confirms it, because a shared name is a guess.

## Found on web: ${web.components.length} of ${families.length}

| Family | Web component | Where |
|---|---|---|
${web.components.map((component) => `| \`${component.id.split('.').pop()}\` | \`${component.symbol}\` | \`${component.source!.path!.slice(WEB_SOURCE.length + 1)}\` ${component.source!.anchor} |`).join('\n')}

## No web component by that name: ${web.missing.length}

${web.missing.map((family) => `\`${family}\``).join(', ') || 'None.'}

These may be built under another name or as plain markup, such as a CSS class. They are listed, not raised. Naming a component after its family, or recording which component builds it, lets CIVIC follow it.
`

const objectMap = objectMapOf(indexGraph(graph))
const objectReport = `# Laundry: objects

**Stand-in.** No ORCA grid exists for Laundry yet. [\`${ORCA_GRID.split('/').slice(2).join('/')}\`](../inputs/orca-grid.csv) and [\`objects.json\`](../objects.json) were written from the review index's scenario names, components and path actions to exercise the object map, and a designer's own grid and ties replace them.

Built by \`node projects/laundry/build.ts\`. The ORCA grid's ${objectMap.objects.length} objects are object records in [\`graph.json\`](graph.json), owned by Design, and \`objects.json\` ties journeys and screens to them. A journey's tie says it needs the object; a screen's tie says what it shows of it: its view (detail unless named), and, where declared, its attributes and calls to action. CIVIC suggests a tie wherever a screen's name names an object or one of its other names; a suggestion counts once a person moves it into \`objects.json\`, and a wrong one goes under \`dismissed\`. Every finding is advisory and goes to Design. Laundry is built for web only, so no call to action is compared across platforms yet.

${renderObjectMap(objectMap)}
`

// Journey stories (decision 0013): one per journey, pointing at this graph's records, and a
// read-only portal of them whose steps play live in Laundry's review server when it runs.
const stories = storiesIn(indexGraph(graph), 'projects/laundry/out/graph.json', { designs: [{ file: 'projects/laundry/out/design.json', design }] })
const portal = renderPortal(indexGraph(graph), stories, { title: 'Laundry: journey stories', canvas: 'http://127.0.0.1:3010' })

const outputs: Record<string, string> = {
  'out/graph.json': `${JSON.stringify(graph, null, 2)}\n`,
  'out/design.json': `${JSON.stringify(design, null, 2)}\n`,
  'out/design.md': designReport,
  'out/runs.md': runs,
  'out/coverage.md': coverageReport,
  'out/tokens.md': tokenReport,
  'out/components.md': componentReport,
  'out/objects.md': objectReport,
  'out/stories.json': `${JSON.stringify(stories, null, 2)}\n`,
  ...Object.fromEntries([...portal].map(([path, body]) => [`out/portal/${path}`, body])),
}
const summary = `${graph.records.length} records, ${graph.links.length} links, ${tests.length} test(s) and ${replayed.length} replayed run(s), ${failed.length} failing, ${tokenConflicts.length} token conflict(s), ${web.components.length} of ${families.length} component families found on web, ${objects.length} objects with ${ties.filter((tie) => tie.status === 'declared').length} declared and ${ties.filter((tie) => tie.status === 'inferred').length} suggested ties`
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
  rmSync(here('out/portal'), { recursive: true, force: true })
  for (const [path, body] of Object.entries(outputs)) {
    mkdirSync(new URL('.', here(path)), { recursive: true })
    writeFileSync(here(path), body)
  }
  console.log(`Wrote projects/laundry/out: ${summary}.`)
}
