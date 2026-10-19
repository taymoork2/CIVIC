import assert from 'node:assert/strict'
import { test } from 'node:test'
import { catalogRows } from './onboard.mjs'

test('design catalog accepts only the expected forty distinct families without running source', () => {
  const rows = Array.from({ length: 40 }, (_, i) => `['${String(i + 1).padStart(2, '0')}','Family','proposed','empty|ready',[],'source'],`).join('\n')
  assert.equal(catalogRows(rows).length, 40)
  assert.throws(() => catalogRows('globalThis.doNotExecute()'), /40 distinct/)
  assert.throws(() => catalogRows(rows.replace("['02'", "['01'")), /40 distinct/)
})
