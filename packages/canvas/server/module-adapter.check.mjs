import assert from 'node:assert/strict'
import { test } from 'node:test'
import { moduleReviewAdapter } from './module-adapter.mjs'

test('fixture capture uses the declared viewport for browser rendering and frame bootstrap', async () => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 393, height: 852 }]) {
    let requested, address, flushed = false
    const context = { addCookies: async () => {}, route: async () => {}, close: async () => {}, newPage: async () => ({ goto: async (url, options) => { address = new URL(url); assert.equal(options.waitUntil, 'domcontentloaded', 'Live updates must not keep a ready app waiting for network silence') }, locator: () => ({ waitFor: async () => {} }), getByRole: () => ({ count: async () => 0 }), evaluate: async () => { flushed = true }, screenshot: async () => { assert.equal(flushed, true, 'Discovery is retained before the capture context closes'); return Buffer.from('png') } }) }
    const browser = { newContext: async options => { requested = options.viewport; return context } }
    await moduleReviewAdapter.captureFixture({ id: 'screen', viewport }, { origin: 'http://127.0.0.1:3012', cookie: 'review_session=test', browser })
    assert.deepEqual(requested, viewport)
    assert.equal(address.searchParams.get('width'), String(viewport.width))
    assert.equal(address.searchParams.get('height'), String(viewport.height))
  }
})

test('only authored isolated checks can send runtime mutations; external and application writes stay blocked', async () => {
  for (const writes of [false, true]) {
    let routeRequest
    const context = { addCookies: async () => {}, route: async (_, handler) => { routeRequest = handler }, close: async () => {}, newPage: async () => ({ goto: async () => {}, locator: () => ({ waitFor: async () => {} }), getByRole: () => ({ count: async () => 0 }) }) }
    await moduleReviewAdapter.captureFixture({ id: 'test' }, { origin: 'http://127.0.0.1:3013', cookie: 'review_session=test', writes, browser: { newContext: async () => context }, visit: async () => {
      for (const [url, action, allowed] of [['http://127.0.0.1:3013/api/review/runtime', 'mutation', writes], ['http://127.0.0.1:3013/api/review/runtime', 'query', true], ['http://127.0.0.1:4417/ws', 'mutation', false], ['https://example.test/api', 'mutation', false], ['http://127.0.0.1:3013/application-write', 'mutation', false]]) {
        let continued = false, aborted = false
        await routeRequest({ request: () => ({ url: () => url, method: () => 'POST', postDataJSON: () => ({ action }) }), continue: async () => { continued = true }, abort: async () => { aborted = true } })
        assert.equal(continued, allowed); assert.equal(aborted, !allowed)
      }
      let aborted = false
      await routeRequest({ request: () => ({ url: () => 'http://127.0.0.1:3013/api/review/runtime', method: () => 'POST', postDataJSON: () => ({ action: 'start' }) }), fetch: async () => { throw Error('connect ECONNREFUSED: fixture server closed') }, abort: async () => { aborted = true } })
      assert.equal(aborted, true, 'A runtime request interrupted by shutdown fails in the page, without an unhandled route rejection')
    } })
  }
})
