import assert from 'node:assert/strict'
import { test } from 'node:test'
import { judge } from '../../bin/civic-start.mjs'

// civic doctor: what a first-time user is told, given what their machine has.
const facts = { node: '26.9.0', git: true, pnpm: true, chrome: true, installed: true }
const failing = (overrides: Partial<typeof facts>) => judge({ ...facts, ...overrides }).filter((row) => !row.ok).map((row) => row.name)

test('a machine with everything passes', () => assert.deepEqual(failing({}), []))

test('Node older than 22.18 fails, and 22.18 and newer pass', () => {
  assert.deepEqual(failing({ node: '22.17.1' }), ['Node.js'])
  assert.deepEqual(failing({ node: '20.19.0' }), ['Node.js'])
  assert.deepEqual(failing({ node: '22.18.0' }), [])
  assert.deepEqual(failing({ node: '24.0.0' }), [])
})

test('git and pnpm are required; Chrome and the install are only advice', () => {
  const rows = judge({ ...facts, git: false, pnpm: false, chrome: false, installed: false })
  assert.deepEqual(rows.filter((row) => !row.ok && row.required).map((row) => row.name), ['git', 'pnpm'])
  assert.deepEqual(rows.filter((row) => !row.ok && !row.required).map((row) => row.name), ['Google Chrome', 'CIVIC packages installed'])
  assert.ok(rows.every((row) => row.ok || row.fix))
})
