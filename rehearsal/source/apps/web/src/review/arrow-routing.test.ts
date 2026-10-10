import { expect, test } from 'vitest'
import { arrowPath, routeArrow } from './arrow-routing'

test('routing avoids the intervening card, prefers the shorter lower gutter and separates lanes', () => {
  const box = { x: 100, y: 0, width: 100, height: 100 }
  const start = { x: 20, y: 70 }, end = { x: 300, y: 70 }
  const route = routeArrow(start, end, [box])
  expect(route[0]).toEqual(start)
  expect(route.at(-1)).toEqual(end)
  expect(route.some((point) => point.y > 100)).toBe(true)
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1]!, b = route[i]!
    expect(a.x === b.x || a.y === b.y).toBe(true)
    if (a.x === b.x) expect(a.x <= box.x || a.x >= box.x + box.width || Math.max(a.y, b.y) <= box.y || Math.min(a.y, b.y) >= box.y + box.height).toBe(true)
    else expect(a.y <= box.y || a.y >= box.y + box.height || Math.max(a.x, b.x) <= box.x || Math.min(a.x, b.x) >= box.x + box.width).toBe(true)
  }
  expect(routeArrow(start, end, [box], 2)).not.toEqual(route)
  expect(arrowPath(route)).toContain(' Q ')
})

test('reverse and empty routes remain valid; an enclosed endpoint has no misleading fallback', () => {
  const a = { x: 0, y: 0 }, b = { x: 100, y: 100 }
  expect(routeArrow(b, a, []).at(-1)).toEqual(a)
  expect(routeArrow(a, b, [{ x: 90, y: 90, width: 20, height: 20 }])).toEqual([])
  expect(arrowPath([])).toBe('')
})
