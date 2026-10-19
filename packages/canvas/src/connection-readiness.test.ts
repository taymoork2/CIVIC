import { expect, test } from 'vitest'
import { readinessFor, supportsPreview } from './connection-readiness'

test('configuration and missing metadata never certify a mounted preview or its capabilities', () => {
  expect(readinessFor(undefined).state).toBe('unchecked')
  expect(readinessFor({ state: 'ready' }).state).toBe('unchecked')
  for (const state of ['unchecked', 'checking', 'failed', 'unsupported'] as const) {
    expect(readinessFor({ state, source: 'one', reason: state }, 'one').state).toBe(state)
    expect(supportsPreview({ readiness: { state, source: 'one' }, capabilities: { resize: true }, setViewport: async () => {} }, 'resize')).toBe(false)
  }
  expect(supportsPreview({ setViewport: async () => {} }, 'resize')).toBe(false)
})

test('readiness is source-bound while actions require observed capability and a callable method', () => {
  const ready = { state: 'ready' as const, source: 'one', reason: 'Preview mounted' }
  expect(readinessFor(ready, 'two').state).toBe('stale')
  expect(readinessFor(ready, 'one')).toEqual(ready)
  expect(supportsPreview({ readiness: ready, capabilities: { resize: true }, setViewport: async () => {} }, 'resize')).toBe(true)
  expect(supportsPreview({ readiness: ready, capabilities: { resize: true } }, 'resize')).toBe(false)
  expect(supportsPreview({ readiness: ready, recording: async () => ({}), capabilities: {} }, 'record')).toBe(false)
  const isolated = { readiness: ready, replay: async () => ({}), capabilities: { replay: false } }
  expect(supportsPreview(isolated, 'replay')).toBe(false)
  expect(supportsPreview({ ...isolated, capabilities: { replay: true }, mode: 'live-read-only' }, 'replay')).toBe(false)
})
