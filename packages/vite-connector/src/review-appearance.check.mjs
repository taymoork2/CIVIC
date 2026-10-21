import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkedProject, publicProject } from './review-project.mjs'

const manifest = { version: 1, id: 'themed', name: 'Themed', adapter: { kind: 'module' }, sources: ['src'], navigation: ['App'], personas: [{ id: 'reviewer', label: 'Reviewer' }], roles: [{ id: 'owner', label: 'Owner' }], conditions: [{ id: 'normal', label: 'Normal' }] }
test('declared app themes are bounded, unique, and exposed without private configuration', () => {
  const appearance = { themes: [{ id: 'paper', label: 'Paper' }, { id: 'ocean', label: 'Ocean' }], defaultTheme: 'paper' }
  assert.deepEqual(publicProject({ manifest: checkedProject({ ...manifest, appearance }), key: 'themed' }).appearance, appearance)
  for (const invalid of [{ themes: [] }, { themes: [appearance.themes[0], appearance.themes[0]] }, { ...appearance, defaultTheme: 'missing' }, { themes: [{ id: '../escape', label: 'Escape' }] }, { ...appearance, storageKey: 'private' }]) {
    assert.throws(() => checkedProject({ ...manifest, appearance: invalid }), /appearance|theme/)
  }
  assert.equal(publicProject({ manifest, key: 'plain' }).appearance, undefined)
})
