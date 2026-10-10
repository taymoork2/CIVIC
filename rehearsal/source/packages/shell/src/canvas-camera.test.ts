import { expect, test } from 'vitest'
import { containCamera, panCamera, zoomCamera } from './canvas-camera'

test('zoom keeps the world point beneath the pointer, with a modest panning margin', () => {
  const initial = { x: 20, y: 40, zoom: .25 }
  expect(panCamera(initial, -100000, 100000)).toEqual({ x: -99980, y: 100040, zoom: .25 })
  const point = { x: 430, y: 270 }, next = zoomCamera(initial, .8, point)
  expect((point.x - next.x) / next.zoom).toBeCloseTo((point.x - initial.x) / initial.zoom)
  expect((point.y - next.y) / next.zoom).toBeCloseTo((point.y - initial.y) / initial.zoom)
  expect(containCamera({ x: 100000, y: -100000, zoom: 1 }, { width: 1000, height: 700 }, { width: 6000, height: 1200 })).toEqual({ x: 240, y: -740, zoom: 1 })
  expect(containCamera(initial, { width: 1000, height: 700 }, { width: 6000, height: 1200 })).toEqual(initial)
})
