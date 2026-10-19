import assert from 'node:assert/strict'
import { test } from 'node:test'
import { browseMessage, routeScreen, liveScenarios, allowedAsset } from './orca-live.mjs'

test('live Orca forwards reads and refuses every write, including automatic drafts', () => {
  for (const message of [{ _tag: 'Hello' }, { _tag: 'LoadTranscript', sessionId: 's' }, { _tag: 'Command', id: 'r', command: { _tag: 'GetAppSettings' } }]) assert.equal(browseMessage(message), true)
  for (const tag of ['SendInput', 'RespondRequest', 'SaveDraft', 'MarkSeen', 'RestartServer', 'CreateWorkItem', 'SaveAppSettings', 'Unknown']) assert.equal(browseMessage({ _tag: 'Command', id: 'x', command: { _tag: tag } }), false)
  for (const input of [null, [], {}, { _tag: 'Command', command: null }]) assert.equal(browseMessage(input), false)
})

test('actual routes keep one journey identity across viewports without inventing states', () => {
  const screens = liveScenarios()
  assert.equal(screens.length, 7)
  assert.equal(routeScreen('/p/project/settings'), 'orca.live.project-settings')
  assert.equal(routeScreen('/w/work'), 'orca.live.work')
  assert.equal(routeScreen('/unknown', 'desktop'), null)
  assert.deepEqual(screens.find(row => row.id === 'orca.live.home').viewport, { width: 1440, height: 900 })
  assert.equal(new Set(screens.map(row => row.journey)).size, 1)
  assert.ok(screens.every(row => row.captureFields.length === 0 && row.behavior.includes('unverified')))
  assert.ok(screens.every(row => row.edges.every(edge => !edge.when)), 'Ordinary navigation links are not conditional journey branches')
  assert.ok(!screens.find(row => row.id === 'orca.live.work').edges.some(edge => edge.destination === 'orca.live.session'), 'The work tree selects sessions in place; it does not navigate to the standalone session route')
})

test('asset proxy accepts only bounded frontend assets, never APIs or arbitrary URLs', () => {
  assert.equal(allowedAsset('/assets/index-Ab_12.js'), true)
  for (const path of ['/health', '/mcp', '/ws', '/assets/../secret.js', '/assets/%2e%2e/secret.js', '//evil.test/assets/x.js', '/assets/x.js?url=http://evil.test']) assert.equal(allowedAsset(path), false)
})
