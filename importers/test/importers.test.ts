import assert from 'node:assert/strict'
import { test } from 'node:test'
import { conflictState, indexGraph, validateGraph, type Adoption, type ContractConflict, type Decision, type DecisionFile, type PlatformComponent, type SemanticComponent } from '../../graph/src/index.ts'
import {
  applyDecisions,
  settledConflicts,
  assemble,
  compareDesignKit,
  fragment,
  readDtcgTokens,
  readFigmaComponentSet,
  readPlatformComponent,
  applyConfirmations,
  readCrawl,
  readJourneyIndex,
  readPlaywrightReport,
  type DesignKitMapping,
  type PlatformMapping,
  type SourceFacts,
} from '../src/index.ts'

const semantic: SemanticComponent = {
  id: 'semantic:button',
  kind: 'semantic-component',
  title: 'Button',
  purpose: 'Trigger an action.',
  owners: [{ role: 'design', who: 'ds' }],
  variants: [
    { key: 'primary', title: 'Primary' },
    { key: 'neutral', title: 'Neutral' },
  ],
  states: ['rest'],
}

const mapping: PlatformMapping = {
  id: 'platform:lib.button',
  title: 'Lib Button',
  platform: 'android',
  symbol: 'Button',
  owners: [{ role: 'design-engineering', who: 'lib' }],
  variantProperty: 'ButtonStyle',
  variants: { primary: { mapping: 'exact', expression: 'Filled' }, neutral: { mapping: 'none', note: 'No stock style.' } },
  extensionPoints: [{ name: 'tokens', mechanism: 'token', expresses: ['appearance'] }],
}

const facts: SourceFacts = {
  variants: [
    { name: 'Filled', deprecated: false },
    { name: 'Old', deprecated: true },
    { name: 'Floating', deprecated: false },
  ],
  defaultVariant: 'Filled',
  members: ['style', 'tokens'],
  source: { tool: 'github', importer: 'kotlin-source', revision: 'abc123', path: 'lib/Button.kt' },
  capturedAt: '2026-10-11T00:00:00Z',
}

const component = () => readPlatformComponent('semantic:button', mapping, facts, { package: 'lib' })

test('a platform component keeps its declared mapping and lists what the mapping leaves out', () => {
  const part = component()
  const record = part.records.find((candidate) => candidate.kind === 'platform-component') as PlatformComponent
  assert.equal(record.defaultVariant, 'primary')
  assert.deepEqual(record.extraVariants, [{ expression: 'Floating' }])
  assert.ok(part.records.some((candidate) => candidate.id === 'extension:lib.button.tokens'))
  const evidence = part.records.find((candidate) => candidate.kind === 'evidence')
  assert.equal(evidence?.kind === 'evidence' && evidence.tier, 'static-analysis')
  assert.deepEqual(validateGraph(assemble(fragment([semantic]), part)), [])
})

test('a mapping that drifts from the source fails the import', () => {
  assert.throws(() => readPlatformComponent('semantic:button', { ...mapping, variants: { primary: { mapping: 'exact', expression: 'Primary' } } }, facts, { package: 'lib' }), /has no Primary/)
  assert.throws(() => readPlatformComponent('semantic:button', { ...mapping, variants: { primary: { mapping: 'exact', expression: 'Old' } } }, facts, { package: 'lib' }), /Old is deprecated/)
  assert.throws(() => readPlatformComponent('semantic:button', { ...mapping, extensionPoints: [{ name: 'theme', mechanism: 'theme-hook', expresses: ['x'] }] }, facts, { package: 'lib' }), /no public theme/)
})

const kit: DesignKitMapping = { id: 'kit', title: 'Lib kit', platform: 'android', componentSet: 'Button', variantProperty: 'Style', owners: [{ role: 'design', who: 'ds' }], variants: { Primary: 'primary', Neutral: 'neutral' } }
const figma = (options: string[], drawn = options) => ({
  name: 'Lib kit',
  version: '42',
  document: {
    id: '0:0',
    name: 'Document',
    type: 'DOCUMENT',
    children: [
      {
        id: '1:0',
        name: 'Controls',
        type: 'CANVAS',
        children: [
          {
            id: '1:1',
            name: 'Button',
            type: 'COMPONENT_SET',
            componentPropertyDefinitions: { Style: { type: 'VARIANT', variantOptions: options } },
            children: drawn.map((option, index) => ({ id: `1:${index + 2}`, name: `Style=${option}`, type: 'COMPONENT' })),
          },
        ],
      },
    ],
  },
})

test('reads a Figma component set and raises a conflict for a variant the code cannot express', () => {
  const design = readFigmaComponentSet(figma(['Primary', 'Neutral', 'Ghost']), kit, 'semantic:button', '2026-10-11T00:00:00Z')
  assert.deepEqual(design.semanticVariants, ['primary', 'neutral'])
  assert.deepEqual(design.unmappedOptions, ['Ghost'])
  assert.equal(design.evidence.source.path, 'Lib kit / Controls / Button')
  const record = component().records.find((candidate) => candidate.kind === 'platform-component') as PlatformComponent
  const conflicts = compareDesignKit(semantic, design, record, 'evidence:lib.button.variants')
  assert.deepEqual(conflicts.map((conflict) => conflict.id), ['conflict:button.android.neutral'])
  assert.deepEqual(conflicts[0]?.owners.map((owner) => owner.who), ['ds', 'lib'])
  assert.equal(conflicts[0]?.alignment, 'unreviewed-drift')
  assert.equal(conflicts[0]?.classification, 'unclassified')
  const document = assemble(fragment([semantic, design.evidence, ...conflicts]), component())
  assert.deepEqual(validateGraph(document).filter((issue) => issue.severity === 'error'), [])
})

test('a kit missing a variant the code offers is a conflict too', () => {
  const design = readFigmaComponentSet(figma(['Neutral']), { ...kit, variants: { Neutral: 'neutral' } }, 'semantic:button', '2026-10-11T00:00:00Z')
  const record = component().records.find((candidate) => candidate.kind === 'platform-component') as PlatformComponent
  const conflicts = compareDesignKit(semantic, design, record, 'evidence:lib.button.variants')
  assert.deepEqual(conflicts.map((conflict) => conflict.variant), ['primary', 'neutral'])
  assert.match(conflicts[0]!.summary, /offers Primary, which the Lib kit does not draw/)
})

test('reads a kit drawn before Figma variants from its component names', () => {
  const named = (id: string, name: string) => ({ id, name, type: 'FRAME', children: [{ id: `${id}c`, name, type: 'COMPONENT' }] })
  const file = {
    name: 'Old kit',
    version: '7',
    document: {
      id: '0:0',
      name: 'Document',
      type: 'DOCUMENT',
      children: [
        {
          id: '1:0',
          name: 'Components',
          type: 'CANVAS',
          children: [
            {
              id: '1:1',
              name: 'Buttons',
              type: 'FRAME',
              children: [named('1:2', '01. Primary / ⚪️ A. Default - Light'), named('1:3', '01. Primary / ⚫️ B. Pressed - Dark'), named('1:4', '03. Text / ⚪️ A. Default - Light')],
            },
          ],
        },
      ],
    },
  }
  const design = readFigmaComponentSet(file, { ...kit, componentFrame: 'Buttons', variants: { Primary: 'primary' } }, 'semantic:button', 'x')
  assert.deepEqual(design.semanticVariants, ['primary'])
  assert.deepEqual(design.unmappedOptions, ['Text'])
  assert.equal(design.evidence.finding, 'Button draws Style: Primary, Text; each drawn as Default, Pressed; Light, Dark.')
  assert.equal(design.evidence.source.path, 'Old kit / Components / Buttons')
  assert.throws(() => readFigmaComponentSet(file, { ...kit, componentFrame: 'Buttons' }, 'semantic:button', 'x'), /names Neutral, which Buttons does not draw/)
  assert.throws(() => readFigmaComponentSet(file, { ...kit, componentFrame: 'Chips' }, 'semantic:button', 'x'), /no frame named Chips/)
})

test('a Figma mapping naming an option the file does not draw fails the import', () => {
  assert.throws(() => readFigmaComponentSet(figma(['Primary', 'Neutral'], ['Primary']), kit, 'semantic:button', 'x'), /names Neutral/)
  assert.throws(() => readFigmaComponentSet({ document: {} }, kit, 'semantic:button', 'x'), /Not a Figma file export/)
})

test('reads a Playwright report: passes, failures, skips and the revision', () => {
  const spec = (title: string, status: string, annotated = true) => ({
    title,
    file: 'button.spec.ts',
    line: 1,
    tests: [{ annotations: annotated ? [{ type: 'civic.subject', description: 'semantic:button' }] : [], results: [{ status, startTime: '2026-10-11T00:00:00Z', errors: [{ message: 'expected blue\nreceived red' }] }] }],
  })
  const report = {
    config: { metadata: { 'civic.revision': 'lib@1.0.0' } },
    suites: [{ specs: [spec('Primary renders', 'passed'), spec('Neutral renders', 'failed'), spec('Later', 'skipped'), spec('Unrelated', 'passed', false)] }],
  }
  const evidence = readPlaywrightReport(report, 'web')
  assert.deepEqual(evidence.map((item) => [item.id, item.outcome]), [
    ['evidence:playwright.primary-renders', 'pass'],
    ['evidence:playwright.neutral-renders', 'fail'],
  ])
  assert.equal(evidence[1]?.finding, 'expected blue')
  assert.equal(evidence[0]?.source.revision, 'lib@1.0.0')
  assert.throws(() => readPlaywrightReport({ config: {}, suites: [] }, 'web'), /civic.revision/)
})

test('a Playwright test can record that it observed a Storybook story', () => {
  const story = (method: string) => ({
    config: { metadata: { 'civic.revision': 'lib@1.0.0' } },
    suites: [{ specs: [{ title: 'Appearance story renders', file: 'storybook.spec.ts', line: 3, tests: [{
      annotations: [
        { type: 'civic.subject', description: 'semantic:button' },
        { type: 'civic.method', description: method },
        { type: 'civic.source', description: 'stories/Button.stories.tsx#components-button--appearance' },
      ],
      results: [{ status: 'passed', startTime: '2026-10-11T00:00:00Z' }],
    }] }] }],
  })
  const [evidence] = readPlaywrightReport(story('storybook'), 'web')
  assert.equal(evidence?.id, 'evidence:storybook.appearance-story-renders')
  assert.deepEqual([evidence?.method, evidence?.tier, evidence?.source.path, evidence?.source.anchor], ['storybook', 'automated', 'stories/Button.stories.tsx', 'components-button--appearance'])
  assert.throws(() => readPlaywrightReport(story('source-analysis'), 'web'), /not a run method/)
})

test('a report without CIVIC annotations takes its subjects from the project\'s declared mapping', () => {
  const report = {
    config: { metadata: { 'civic.revision': 'abc123' } },
    suites: [{ specs: [
      { title: 'Opens the drawer', file: 'drawer.spec.ts', line: 4, tests: [{ annotations: [], results: [{ status: 'passed', startTime: '2026-10-12T00:00:00Z' }] }] },
      { title: 'Annotated wins', file: 'drawer.spec.ts', line: 9, tests: [{ annotations: [{ type: 'civic.subject', description: 'target:app.b' }], results: [{ status: 'failed', startTime: '2026-10-12T00:00:00Z' }] }] },
    ] }],
  }
  const evidence = readPlaywrightReport(report, 'web', { subjectsFor: (spec) => (spec.file === 'drawer.spec.ts' ? ['target:app.a'] : []), pathFor: (file) => `apps/web/e2e/${file}` })
  assert.deepEqual(evidence.map((item) => [item.subjectIds, item.outcome, item.source.path, item.source.anchor]), [
    [['target:app.a'], 'pass', 'apps/web/e2e/drawer.spec.ts', 'line 4'],
    [['target:app.b'], 'fail', 'apps/web/e2e/drawer.spec.ts', 'line 9'],
  ])
  assert.deepEqual(readPlaywrightReport(report, 'web').map((item) => item.title), ['Annotated wins'])
})

test('reads the journey engine\'s review index into screens, journeys, paths and declared checks', () => {
  const index = {
    revision: { head: 'abc123', source: 'hash' },
    scenarios: [
      { id: 'intake.type', label: 'Type', journey: 'Add a towel', checks: ['apps/web/e2e/intake.spec.ts'], edges: [{ action: 'Continue', destination: 'intake.final' }] },
      { id: 'intake.final', label: 'Final', journey: 'Add a towel', checks: ['apps/web/e2e/intake.spec.ts'], edges: [{ action: 'Open closet', destination: 'closet.index', when: 'Saved' }] },
      { id: 'legacy.home', label: 'Home', journey: 'Existing specimens', edges: [{ action: 'Open', destination: 'intake.type' }] },
    ],
    routeActions: [{ from: 'legacy.home', action: 'Open', destination: 'intake.type', route: '/add', source: 'apps/web/src/home.tsx', anchor: 'renderLink' }],
  }
  const { fragment: read, checks } = readJourneyIndex(index, { prefix: 'app', platform: 'web', owners: [{ role: 'qa', who: 'qa' }], catalogs: ['Existing specimens'], path: 'scenarios.json' })
  const graph = assemble(read)
  assert.deepEqual(validateGraph(graph).filter((issue) => issue.severity === 'error'), [])
  const targets = Object.fromEntries(graph.records.map((record) => [record.id, record.kind === 'target' ? record.scale : record.kind]))
  assert.deepEqual(targets, {
    'target:app.catalog.existing-specimens': 'surface',
    'target:app.intake.final': 'screen',
    'target:app.intake.type': 'screen',
    'target:app.journey.add-a-towel': 'journey',
    'target:app.legacy.home': 'screen',
  })
  const paths = graph.links.filter((link) => link.relation === 'navigates')
  assert.deepEqual(paths.map((link) => [link.from, link.to ?? `unmapped ${link.unmapped}`, link.status]), [
    ['target:app.intake.final', 'unmapped closet.index', 'declared'],
    ['target:app.intake.type', 'target:app.intake.final', 'declared'],
    ['target:app.legacy.home', 'target:app.intake.type', 'declared'],
  ])
  const fromSource = paths.find((link) => link.from === 'target:app.legacy.home')
  assert.deepEqual([fromSource?.route, fromSource?.source?.path, fromSource?.source?.anchor], ['/add', 'apps/web/src/home.tsx', 'renderLink'])
  assert.deepEqual(checks.get('apps/web/e2e/intake.spec.ts'), ['target:app.intake.type', 'target:app.intake.final'])
  assert.throws(() => readJourneyIndex({ scenarios: [] } as never, { prefix: 'app', platform: 'web', owners: [], path: 'x' }), /review index/)
})

test('a crawl comes in discovered and proposed, and counts only once a person confirms it', () => {
  const crawl = {
    schema: 'civic.crawl/0', seed: 'index.html', platform: 'web', driver: 'playwright-core', revision: 'abc123',
    states: [{ id: 'index', location: 'index.html', title: 'Notes', hash: 'h1' }, { id: 'draft', location: 'draft.html', title: 'Compose', hash: 'h2' }],
    transitions: [{ from: 'index', to: 'draft', action: { role: 'link', name: 'Write note' } }, { from: 'draft', to: 'index', action: { role: 'link', name: 'Back home' } }],
  }
  const raised = assemble(readCrawl(crawl, { prefix: 'notes', owners: [{ role: 'engineering', who: 'eng' }], path: 'crawl.json' }))
  assert.deepEqual(validateGraph(raised).filter((issue) => issue.severity === 'error'), [])
  assert.deepEqual(raised.records.map((record) => [record.id, record.kind === 'target' && record.presence]), [['target:notes.draft', 'discovered'], ['target:notes.index', 'discovered']])
  assert.deepEqual(raised.links.map((link) => [link.action, link.status]), [['Back home', 'proposed'], ['Write note', 'proposed']])
  assert.throws(() => readCrawl({ schema: 'other' }, { prefix: 'notes', owners: [], path: 'x' }), /civic.crawl/)

  const file = {
    schema: 'civic.confirmations/0' as const, by: { role: 'product-management' as const, who: 'pm' }, at: '2026-10-12',
    screens: ['target:notes.index', 'target:notes.draft'],
    paths: [{ from: 'target:notes.index', to: 'target:notes.draft', action: 'Write note' }],
    journeys: [{ id: 'target:notes.journey.write', title: 'Write a note', entry: ['target:notes.index'], exits: ['target:notes.draft'], screens: ['target:notes.index', 'target:notes.draft'] }],
  }
  const applied = applyConfirmations(raised, file, 'confirmations.json', JSON.stringify(file))
  const confirmed = assemble(fragment(applied.records, applied.links))
  assert.deepEqual(validateGraph(confirmed).filter((issue) => issue.severity === 'error'), [])
  const presence = Object.fromEntries(confirmed.records.map((record) => [record.id, record.kind === 'target' && record.presence]))
  assert.deepEqual(presence, { 'target:notes.draft': 'expected', 'target:notes.index': 'expected', 'target:notes.journey.write': 'expected' })
  const statuses = confirmed.links.map((link) => [link.relation, link.action ?? link.to, link.status])
  assert.deepEqual(statuses, [
    ['navigates', 'Back home', 'proposed'],
    ['navigates', 'Write note', 'declared'],
    ['contains', 'target:notes.draft', 'declared'],
    ['contains', 'target:notes.index', 'declared'],
  ])
  assert.throws(() => applyConfirmations(raised, { ...file, screens: ['target:notes.gone'], journeys: [] }, 'c.json', ''), /did not find: target:notes.gone/)
  assert.throws(() => applyConfirmations(raised, { ...file, screens: ['target:notes.index'] }, 'c.json', ''), /not a confirmed screen/)
})

test('reads DTCG tokens with inherited types and nested paths', () => {
  const tokens = readDtcgTokens({ color: { $type: 'color', brand: { $value: '#0f6cbd' } }, radius: { $value: '4px', $type: 'dimension' } }, { tool: 'npm', importer: 'dtcg', revision: '1' })
  assert.deepEqual([...tokens.keys()], ['color.brand', 'radius'])
  assert.equal(tokens.get('color.brand')?.type, 'color')
  assert.equal(tokens.get('color.brand')?.id, 'token:color.brand')
  assert.throws(() => readDtcgTokens({ size: { $value: 4 } }, { tool: 'npm', importer: 'dtcg', revision: '1' }), /no \$type/)
})

test('assemble is ordered and refuses two claims on one ID', () => {
  const document = assemble(component(), fragment([semantic]))
  assert.equal(document.records[0]?.id, 'semantic:button')
  assert.throws(() => assemble(fragment([semantic]), fragment([semantic])), /Two importers produced semantic:button/)
})

test('decision records decide raised conflicts, and stale decisions fail', () => {
  const design = readFigmaComponentSet(figma(['Primary', 'Neutral']), kit, 'semantic:button', 'x')
  const record = component().records.find((candidate) => candidate.kind === 'platform-component') as PlatformComponent
  const document = assemble(fragment([semantic, design.evidence, ...compareDesignKit(semantic, design, record, 'evidence:lib.button.variants')]), component())
  const decision: Decision = {
    id: 'decision:button.android.neutral',
    kind: 'decision',
    title: 'Neutral as a temporary exception',
    conflictId: 'conflict:button.android.neutral',
    outcome: 'approve-exception',
    classification: 'temporary-gap',
    alignment: 'accepted-limitation',
    decidedBy: { role: 'design', who: 'ds' },
    at: '2026-10-11T00:00:00Z',
    rationale: 'Use custom tokens.',
    evidenceIds: ['evidence:lib.button.variants'],
    revisitTrigger: 'The library adds a neutral style.',
  }
  const decided = applyDecisions(document, { schema: 'civic.decisions/0', decisions: [decision] })
  const graph = indexGraph(decided)
  const conflict = graph.get('conflict:button.android.neutral') as ContractConflict
  assert.equal(conflict.alignment, 'unreviewed-drift', 'the conflict keeps what the import raised')
  assert.equal(conflictState(graph, conflict).alignment, 'accepted-limitation')
  assert.deepEqual(validateGraph(decided).filter((issue) => issue.severity === 'error'), [])
  assert.throws(() => applyDecisions(document, [{ ...decision, conflictId: 'conflict:button.ios.neutral' }]), /did not raise/)
})

test('a conflict an adopted fix removed is settled: its loop records stay in the file and out of the graph', () => {
  const component_ = component()
  const record = component_.records.find((candidate) => candidate.kind === 'platform-component') as PlatformComponent
  const raise = (variants: string[]) => {
    const mapping = { ...kit, variants: Object.fromEntries(Object.entries(kit.variants).filter(([name]) => variants.includes(name))) }
    const design = readFigmaComponentSet(figma(variants), mapping, 'semantic:button', variants.join('-'))
    return assemble(fragment([semantic, design.evidence, ...compareDesignKit(semantic, design, record, 'evidence:lib.button.variants')]), component())
  }
  const decision: Decision = {
    id: 'decision:button.android.neutral',
    kind: 'decision',
    title: 'Drop Neutral from the kit',
    conflictId: 'conflict:button.android.neutral',
    outcome: 'update-design',
    classification: 'outdated-design-source',
    alignment: 'awaiting-adoption',
    decidedBy: { role: 'design', who: 'ds' },
    at: '2026-10-11T00:00:00Z',
    rationale: 'The library has no neutral style.',
    evidenceIds: ['evidence:lib.button.variants'],
  }
  const adoption: Adoption = {
    id: 'adoption:button.android.neutral',
    kind: 'adoption',
    title: 'Kit drops Neutral',
    decisionId: decision.id,
    carriedBy: { tool: 'figma', revision: 'Primary' },
    adoptedBy: { role: 'design', who: 'ds' },
    at: '2026-10-12T00:00:00Z',
  }
  const file: DecisionFile = { schema: 'civic.decisions/0', decisions: [decision], adoptions: [adoption] }

  // Still raised: the adoption is applied and waits for the import to read the adopted kit.
  const before = applyDecisions(raise(['Primary', 'Neutral']), file)
  assert.deepEqual(validateGraph(before).filter((issue) => issue.severity === 'error'), [])
  assert.equal(conflictState(indexGraph(before), indexGraph(before).get('conflict:button.android.neutral') as ContractConflict).fix?.stage, 'adopted')

  // The kit no longer draws Neutral: the conflict is gone, and the adopted decision settles it.
  const after = raise(['Primary'])
  const settled = applyDecisions(after, file)
  assert.deepEqual(validateGraph(settled).filter((issue) => issue.severity === 'error'), [])
  assert.ok(!settled.records.some((item) => item.kind === 'decision' || item.kind === 'adoption'))
  assert.deepEqual(settledConflicts(after, file), [{ conflictId: 'conflict:button.android.neutral', decisionId: decision.id, adoptionIds: [adoption.id] }])

  // Without the adoption, a vanished conflict's decision is stale.
  assert.throws(() => applyDecisions(after, { ...file, adoptions: [] }), /record the revision that carries it with civic adopt/)
})
