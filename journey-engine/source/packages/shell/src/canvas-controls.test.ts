import { expect, test } from 'vitest'
import { canvasShortcut } from './canvas-controls'

test('canvas shortcuts leave typing and browser commands alone', () => {
  const key = { key: 'h', shiftKey: false, metaKey: false, ctrlKey: false, altKey: false }
  expect(canvasShortcut(key, false)).toBe('hand')
  expect(canvasShortcut(key, true)).toBeNull()
  expect(canvasShortcut({ ...key, metaKey: true }, false)).toBeNull()
  expect(canvasShortcut({ ...key, key: '!', shiftKey: true }, false)).toBe('app')
  expect(canvasShortcut({ ...key, key: '2', shiftKey: true }, false)).toBe('selection')
  expect(canvasShortcut({ ...key, key: ')', shiftKey: true }, false)).toBe('actual')
  expect(canvasShortcut({ ...key, key: ' ' }, false)).toBeNull()
  expect(canvasShortcut({ ...key, key: '+', shiftKey: true }, false)).toBe('in')
})
