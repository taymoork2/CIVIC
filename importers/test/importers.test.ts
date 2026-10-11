import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validateGraph, type ContractConflict, type PlatformComponent, type SemanticComponent } from '../../graph/src/index.ts'
import {
  applyDecisions,
  assemble,
  compareDesignKit,
  fragment,
  readDtcgTokens,
  readFigmaComponentSet,
  readPlatformComponent,
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
  assert.equal(conflicts[0]?.status, 'open')
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

test('decisions classify and resolve raised conflicts, and stale decisions fail', () => {
  const design = readFigmaComponentSet(figma(['Primary', 'Neutral']), kit, 'semantic:button', 'x')
  const record = component().records.find((candidate) => candidate.kind === 'platform-component') as PlatformComponent
  const document = assemble(fragment([semantic, design.evidence, ...compareDesignKit(semantic, design, record, 'evidence:lib.button.variants')]), component())
  const decided = applyDecisions(document, [
    {
      conflictId: 'conflict:button.android.neutral',
      classification: 'temporary-gap',
      alignment: 'accepted-limitation',
      resolution: {
        outcome: 'approve-exception',
        decidedBy: { role: 'design', who: 'ds' },
        at: '2026-10-11T00:00:00Z',
        rationale: 'Use custom tokens.',
        evidenceIds: ['evidence:lib.button.variants'],
        revisitTrigger: 'The library adds a neutral style.',
      },
    },
  ])
  const conflict = decided.records.find((candidate) => candidate.kind === 'contract-conflict') as ContractConflict
  assert.equal(conflict.status, 'resolved')
  assert.deepEqual(validateGraph(decided).filter((issue) => issue.severity === 'error'), [])
  assert.throws(() => applyDecisions(document, [{ conflictId: 'conflict:button.ios.neutral', classification: 'temporary-gap' }]), /did not raise/)
})
