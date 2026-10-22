import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkGraph, indexGraph, validateGraph, type GraphDocument, type Target } from '../src/index.ts'

// A control a crawl took that left the screen as it was is a dead or stale control (decision 0016).

const screen = (controls: Target['controls']): Target => ({ id: 'target:app.home', kind: 'target', title: 'Home', scale: 'screen', presence: 'expected', platforms: ['web'], owners: [{ role: 'engineering', who: 'web-team' }], controls })
const document = (controls: Target['controls']): GraphDocument => ({ schema: 'civic.graph/0', records: [screen(controls)], links: [] })

test('a control that changed nothing is an advisory finding, counted against the controls taken', () => {
  const doc = document([{ role: 'button', name: 'Save', outcome: 'no-effect' }, { role: 'link', name: 'Help', outcome: 'taken' }, { role: 'button', name: 'Remove', outcome: 'blocked' }])
  assert.deepEqual(validateGraph(doc).filter((issue) => issue.severity === 'error'), [])
  const check = checkGraph('app', indexGraph(doc), { today: '2026-10-21' })
  assert.deepEqual(check.findings.map((item) => [item.key, item.owners]), [['control-no-effect target:app.home button Save', [{ role: 'engineering', who: 'web-team' }]]])
  assert.match(check.findings[0]!.summary, /The button "Save" on Home changed nothing when taken/)
  assert.deepEqual(check.measures.find((item) => item.check === 'Controls taken that changed nothing')?.found, 1)
  assert.equal(check.measures.find((item) => item.check === 'Controls taken that changed nothing')?.of, 2)
  assert.deepEqual(checkGraph('app', indexGraph(document([{ role: 'link', name: 'Help', outcome: 'taken' }])), { today: '2026-10-21' }).findings, [])
})
