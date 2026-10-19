import { expect, test } from 'vitest'
import { arrowPath, routeArrow, simplifyRoute } from './arrow-routing'

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

test('straight segments and backtracks do not create fake bends or hooked joins', () => {
  const points = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 100 }, { x: 16, y: 100 }, { x: 0, y: 100 }, { x: 100, y: 100 }]
  expect(simplifyRoute(points)).toEqual([{ x: 0, y: 0 }, { x: 0, y: 100 }, { x: 100, y: 100 }])
  expect(arrowPath(points)).toBe('M 0 0 L 0 90 Q 0 100 10 100 L 100 100')
  expect(arrowPath([{ x: 0, y: 0 }, { x: 16, y: 0 }, { x: 100, y: 0 }])).toBe('M 0 0 L 100 0')
  expect(simplifyRoute([{ x: 0, y: 0 }, { x: 16, y: 0 }, { x: 0, y: 0 }])).toEqual([{ x: 0, y: 0 }])
})

test('a congested bus leg joins the line directly without returning to a forced x coordinate', () => {
  const start = { x: 116, y: 50 }, end = { x: 116, y: 124 }
  const route = routeArrow(start, end, [{ x: 0, y: 0, width: 100, height: 100 }], 0, [[start, end]], 'horizontal-line')
  expect(route.at(-1)!.y).toBe(end.y)
  expect(route.at(-1)!.x).toBeGreaterThan(start.x)
  expect(route.at(-2)!.x).toBe(route.at(-1)!.x)
  expect(route.every(point => point.y <= end.y)).toBe(true)
})
