export type Point = { x: number; y: number }
export type Obstacle = Point & { width: number; height: number }

function blocked(a: Point, b: Point, boxes: Obstacle[]) {
  return boxes.some((box) => a.x === b.x
    ? a.x > box.x - 8 && a.x < box.x + box.width + 8 && Math.max(a.y, b.y) > box.y - 8 && Math.min(a.y, b.y) < box.y + box.height + 8
    : a.y > box.y - 8 && a.y < box.y + box.height + 8 && Math.max(a.x, b.x) > box.x - 8 && Math.min(a.x, b.x) < box.x + box.width + 8)
}

// Rectilinear A*: distance plus bend cost, through gutters outside the cards.
export function routeArrow(start: Point, end: Point, boxes: Obstacle[], lane = 0, occupied: Point[][] = []): Point[] {
  const gap = 24 + lane % 4 * 8
  const xs = [...new Set([start.x, end.x, ...boxes.flatMap((box) => [box.x - gap, box.x + box.width + gap])])].sort((a, b) => a - b)
  const ys = [...new Set([start.y, end.y, ...boxes.flatMap((box) => [box.y - gap, box.y + box.height + gap])])].sort((a, b) => a - b)
  const distance = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
  type Visit = { x: number; y: number; direction: number; cost: number; score: number; previous?: Visit }
  const first = { x: xs.indexOf(start.x), y: ys.indexOf(start.y), direction: -1, cost: 0, score: distance(start, end) }
  const pending: Visit[] = [first]
  const costs = new Map<string, number>()
  while (pending.length) {
    let best = 0
    for (let i = 1; i < pending.length; i++) if (pending[i]!.score < pending[best]!.score) best = i
    const current = pending.splice(best, 1)[0]!
    if (current.cost > (costs.get(`${current.x}:${current.y}:${current.direction}`) ?? Infinity)) continue
    const point = { x: xs[current.x]!, y: ys[current.y]! }
    if (point.x === end.x && point.y === end.y) {
      const points: Point[] = []
      for (let node: Visit | undefined = current; node; node = node.previous) points.unshift({ x: xs[node.x]!, y: ys[node.y]! })
      return points.filter((p, i) => !i || i === points.length - 1 || !(points[i - 1]!.x === p.x && p.x === points[i + 1]!.x || points[i - 1]!.y === p.y && p.y === points[i + 1]!.y))
    }
    for (const [dx, dy, direction] of [[1, 0, 0], [-1, 0, 0], [0, 1, 1], [0, -1, 1]]) {
      const x = current.x + dx!, y = current.y + dy!
      if (x < 0 || y < 0 || x >= xs.length || y >= ys.length) continue
      const next = { x: xs[x]!, y: ys[y]! }
      if (blocked(point, next, boxes)) continue
      let congestion = 0
      for (const path of occupied) for (let i = 1; i < path.length; i++) {
        const a = path[i - 1]!, b = path[i]!
        const horizontal = point.y === next.y, otherHorizontal = a.y === b.y
        if (horizontal === otherHorizontal) {
          const same = horizontal ? point.y === a.y : point.x === a.x
          const overlap = horizontal ? Math.min(Math.max(point.x, next.x), Math.max(a.x, b.x)) - Math.max(Math.min(point.x, next.x), Math.min(a.x, b.x)) : Math.min(Math.max(point.y, next.y), Math.max(a.y, b.y)) - Math.max(Math.min(point.y, next.y), Math.min(a.y, b.y))
          if (same && overlap > 0) congestion += overlap * 3
        } else {
          const h = horizontal ? [point, next] : [a, b], v = horizontal ? [a, b] : [point, next]
          if (v[0]!.x > Math.min(h[0]!.x, h[1]!.x) && v[0]!.x < Math.max(h[0]!.x, h[1]!.x) && h[0]!.y > Math.min(v[0]!.y, v[1]!.y) && h[0]!.y < Math.max(v[0]!.y, v[1]!.y)) congestion += 120
        }
      }
      const cost = current.cost + distance(point, next) + congestion + (current.direction < 0 || current.direction === direction ? 0 : 48)
      const key = `${x}:${y}:${direction}`
      if (cost >= (costs.get(key) ?? Infinity)) continue
      costs.set(key, cost); pending.push({ x, y, direction: direction!, cost, score: cost + distance(next, end), previous: current })
    }
  }
  return [] // Never draw a fallback through a card when no safe path exists.
}

export function arrowPath(points: Point[], radius = 10) {
  if (!points.length) return ''
  let d = `M ${points[0]!.x} ${points[0]!.y}`
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1]!, b = points[i]!, c = points[i + 1]!
    const before = Math.hypot(b.x - a.x, b.y - a.y), after = Math.hypot(c.x - b.x, c.y - b.y)
    if (!before || !after) continue
    const r = Math.min(radius, before / 2, after / 2)
    d += ` L ${b.x - (b.x - a.x) / before * r} ${b.y - (b.y - a.y) / before * r} Q ${b.x} ${b.y} ${b.x + (c.x - b.x) / after * r} ${b.y + (c.y - b.y) / after * r}`
  }
  return `${d} L ${points.at(-1)!.x} ${points.at(-1)!.y}`
}
