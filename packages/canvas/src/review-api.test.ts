import { afterEach, expect, test, vi } from 'vitest'
import { bindProjectRequests } from './project-request'
import { reviewApi } from './review-api'

afterEach(() => vi.unstubAllGlobals())

function respond(response: Response) {
  bindProjectRequests('project-one')
  const fetch = vi.fn(async (_path: string, _options?: RequestInit) => response)
  vi.stubGlobal('fetch', fetch)
  return fetch
}

test('GET and JSON POST keep the bound project and caller signal', async () => {
  const fetch = respond(Response.json({ ready: true }))
  const controller = new AbortController()
  expect(await reviewApi('index', undefined, { signal: controller.signal })).toEqual({ ready: true })
  expect(fetch).toHaveBeenCalledWith('/api/review/index', expect.objectContaining({ signal: controller.signal }))
  expect(new Headers(fetch.mock.calls[0]![1]?.headers).get('x-rehearsal-project')).toBe('project-one')
  fetch.mockResolvedValueOnce(Response.json({ saved: true }))
  await reviewApi('coverage', { operation: 'save' })
  expect(fetch).toHaveBeenLastCalledWith('/api/review/coverage', expect.objectContaining({ method: 'POST', body: '{"operation":"save"}' }))
  expect(new Headers(fetch.mock.calls[1]![1]?.headers).get('content-type')).toBe('application/json')
})

test('HTTP errors retain server messages and status, with a fallback for invalid bodies', async () => {
  respond(Response.json({ error: 'Changed project' }, { status: 409 }))
  await expect(reviewApi('coverage')).rejects.toMatchObject({ message: 'Changed project', status: 409 })
  for (const body of ['<html>Unavailable</html>', 'null', '{"error":42}']) {
    respond(new Response(body, { status: 503 }))
    await expect(reviewApi('projects', undefined, { fallback: 'Source discovery unavailable' })).rejects.toMatchObject({ message: 'Source discovery unavailable', status: 503 })
  }
  respond(new Response('', { status: 500 }))
  await expect(reviewApi('index')).rejects.toThrow('Your draft is kept')
})

test('invalid success JSON, network failures and cancellation remain failures', async () => {
  respond(new Response('not json'))
  await expect(reviewApi('index')).rejects.toBeInstanceOf(SyntaxError)
  const network = new TypeError('Network unavailable')
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(network))
  await expect(reviewApi('index')).rejects.toBe(network)
  const controller = new AbortController()
  controller.abort()
  vi.stubGlobal('fetch', vi.fn((_path, options) => { options.signal.throwIfAborted() }))
  await expect(reviewApi('index', undefined, { signal: controller.signal })).rejects.toBe(controller.signal.reason)
})
