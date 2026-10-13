import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validateGraph, type Evidence } from '../../graph/src/index.ts'
import { assemble, compareCssTokens, fragment, readCssTokens, sameCssValue } from '../src/index.ts'

const design = `/* the reference */
@font-face { font-family: "Serif"; src: url("serif.woff2"); }
:root, [data-theme="light"] {
  --ac: #1f45ff;
  --pr: #164be0;
  --accent: var(--pr); /* an alias */
  --glass: rgba(255,253,249,.72);
  --space-4: 4px;
}
[data-theme="dark"] { --ac: #b7c6ff; }
@media (prefers-reduced-motion: reduce) { :root { --space-4: 0px; } }
:root { --space-4: 8px; --only-design: 1px; }`

const code = `:root {
  --accent: #1F45FF;
  --glass: rgba(255, 253, 249, 0.72);
  --space-4: 1rem;
  --only-code: 2px;
}
:root[data-palette='cobalt'] { --accent: #000; }
:root[data-theme='dark'] { --glass: #000; }`

const evidence = (id: string): Evidence => ({ id, kind: 'evidence', title: id, subjectIds: [], tier: 'static-analysis', method: 'token-analysis', outcome: 'finding', finding: 'Read the default theme.', capturedAt: '2026-10-13T06:00:00Z', source: { tool: 't', importer: 'css-tokens', revision: 'r' } })

test("a stylesheet's default theme is read with its aliases resolved, and other themes, palettes and media are not", () => {
  assert.deepEqual(Object.fromEntries(readCssTokens(design)), { ac: '#1f45ff', accent: '#164be0', glass: 'rgba(255,253,249,.72)', 'only-design': '1px', pr: '#164be0', 'space-4': '4px' })
  assert.deepEqual(Object.fromEntries(readCssTokens(code)), { accent: '#1F45FF', glass: 'rgba(255, 253, 249, 0.72)', 'only-code': '2px', 'space-4': '1rem' })
  assert.ok(sameCssValue('rgba(255,253,249,.72)', 'rgba(255, 253, 249, 0.72)'))
  assert.ok(!sameCssValue('0.5rem', '2px'))
})

test('a name design and code set differently is an open conflict on that token; one only the design sets is listed, not raised', () => {
  const sides = { design: { tokens: readCssTokens(design), evidence: evidence('evidence:design'), label: 'The reference' }, code: { tokens: readCssTokens(code), evidence: evidence('evidence:code'), label: 'The code' } }
  const result = compareCssTokens(sides.design, sides.code, { owners: [{ role: 'design', who: 'd' }] })
  assert.deepEqual(result.agreed, ['glass'])
  assert.deepEqual(result.designOnly, ['ac', 'only-design', 'pr'])
  assert.deepEqual(result.conflicts.map((conflict) => [conflict.id, conflict.targetId, conflict.summary]), [
    ['conflict:token.accent', 'token:accent', 'The reference sets --accent to #164be0; The code sets it to #1F45FF.'],
    ['conflict:token.space-4', 'token:space-4', 'The reference sets --space-4 to 4px; The code sets it to 1rem.'],
  ])
  assert.deepEqual(result.tokens.map((token) => [token.id, token.type]), [['token:accent', 'color'], ['token:glass', 'color'], ['token:space-4', 'dimension']])
  const graph = assemble(fragment([...result.tokens, { ...sides.design.evidence, subjectIds: ['token:accent'] }, { ...sides.code.evidence, subjectIds: ['token:accent'] }, ...result.conflicts]))
  assert.deepEqual(validateGraph(graph).filter((issue) => issue.severity === 'error'), [])
})
