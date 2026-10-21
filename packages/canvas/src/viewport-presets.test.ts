import { expect, test } from 'vitest'
import { presetOf, validViewport } from './viewport-presets'

test('viewport preferences retain resolved appearance and an optional app theme', () => {
  const value = { width: 393, height: 852, theme: 'dark', appearance: 'system', appTheme: 'ocean', textScale: 1 }
  expect(validViewport(value)).toBe(true)
  expect(validViewport({ ...value, appearance: 'automatic' })).toBe(false)
  expect(validViewport({ ...value, appTheme: '../private' })).toBe(false)
})

test('exact dimensions take precedence over a rotated match', () => {
  expect(presetOf({ width: 1024, height: 768 })?.id).toBe('desktop')
  expect(presetOf({ width: 768, height: 1024 })?.id).toBe('tablet')
  expect(presetOf({ width: 852, height: 393 })?.id).toBe('phone')
  expect(presetOf({ width: 640, height: 800 })).toBeUndefined()
})

test('an explicitly selected device keeps its identity through rotation', () => {
  expect(presetOf({ width: 1024, height: 768, preset: 'tablet' })?.id).toBe('tablet')
  expect(presetOf({ width: 768, height: 1024, preset: 'desktop' })?.id).toBe('desktop')
  expect(presetOf({ width: 1024, height: 768, preset: 'phone' })?.id).toBe('desktop')
  expect(presetOf({ width: 640, height: 800, preset: 'tablet' })).toBeUndefined()
})
