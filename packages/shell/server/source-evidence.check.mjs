import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkedSourceEvidence } from './review-server.mjs'

test('source evidence keeps how a location was found and refuses anything else', () => {
  assert.deepEqual(checkedSourceEvidence({ via: 'vue-inspector', match: 'ancestor', file: 'ignored' }, 'src/a.vue:3:5'), { via: 'vue-inspector', match: 'ancestor' })
  assert.deepEqual(checkedSourceEvidence({ component: 'TodoListComponent' }, undefined), { component: 'TodoListComponent' })
  assert.equal(checkedSourceEvidence({}, undefined), undefined)
  assert.throws(() => checkedSourceEvidence({ via: 'guess' }, 'src/a.tsx:1:1'))
  assert.throws(() => checkedSourceEvidence({ via: 'civic' }, undefined), /needs a code location/u)
  assert.throws(() => checkedSourceEvidence('civic', 'src/a.tsx:1:1'))
  assert.throws(() => checkedSourceEvidence({ component: 'x'.repeat(201) }, undefined))
})
