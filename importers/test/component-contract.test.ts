import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validateGraph } from '../../graph/src/index.ts'
import { assemble, findWebComponents, fragment, readComponentFamilies } from '../src/index.ts'

const contract = `# Shared component contract

## Component families

| Stable family | Anatomy / sizing | Required states and behavior |
|---|---|---|
| \`answer-row\` | Two or three short answers in one row. | Wraps at large text; the chosen answer is \`aria-pressed\`. |
| \`source-row\` | 44px media tile, title and one fact. | Ready, missing fact, recorded conflict. |

## Maintained browser implementation

| Component | Anatomy | Implementation |
|---|---|---|
| Button | 48px | components.css |
`

const source = { tool: 'open-design', importer: 'component-contract', revision: 'r' }
const families = readComponentFamilies(contract, { prefix: 'app', owners: [{ role: 'design-engineering', who: 'd' }], source })

test('each family in the contract table is a Semantic component, its behavior kept as one rule in its own words', () => {
  assert.deepEqual(families.map((family) => [family.id, family.purpose, family.rules]), [
    ['semantic:app.answer-row', 'Two or three short answers in one row.', [{ key: 'states-and-behavior', statement: 'Wraps at large text; the chosen answer is `aria-pressed`.' }]],
    ['semantic:app.source-row', '44px media tile, title and one fact.', [{ key: 'states-and-behavior', statement: 'Ready, missing fact, recorded conflict.' }]],
  ])
  assert.throws(() => readComponentFamilies('# Nothing here', { prefix: 'app', owners: [], source }), /no "Component families" table/)
})

test('a web component exported under the family name implements it, inferred; a family with none is listed', () => {
  const sources = [
    { path: 'src/ui.tsx', text: "import x from 'y'\n\nexport function AnswerRow({ answers }: Props) {\n  return null\n}\nfunction SourceRow() {}\n" },
  ]
  const web = findWebComponents(families, sources, { prefix: 'app', package: '@app/web', owners: [], revision: 'a'.repeat(40), evidenceId: 'evidence:source-analysis.app-components', capturedAt: '2026-10-13T07:00:00Z' })
  assert.deepEqual(web.components.map((component) => [component.id, component.symbol, component.source?.path, component.source?.anchor]), [['platform:app.web.answer-row', 'AnswerRow', 'src/ui.tsx', 'L3']])
  assert.deepEqual(web.links, [{ from: 'platform:app.web.answer-row', relation: 'implements', to: 'semantic:app.answer-row', status: 'inferred', evidenceIds: ['evidence:source-analysis.app-components'] }])
  assert.deepEqual(web.missing, ['source-row'])
  const graph = assemble(fragment([...families, ...web.components, web.evidence], web.links))
  assert.deepEqual(validateGraph(graph).filter((issue) => issue.severity === 'error'), [])
})
