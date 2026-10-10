import assert from 'node:assert/strict'
import { test } from 'node:test'
import scenarios from '../src/review/scenarios.json' with { type: 'json' }
import { laundryReviewAdapter } from './review-adapter.mjs'

test('the Laundry adapter declares unique towel screens over registered scenarios', () => {
  const { screens, proposalProperties } = laundryReviewAdapter
  assert.equal(new Set(screens.map((screen) => screen.id)).size, screens.length)
  for (const screen of screens) assert.ok(scenarios.some((scenario) => scenario.id === screen.scenario), screen.id)
  assert.deepEqual(proposalProperties, ['title', 'action', 'color'])
})
