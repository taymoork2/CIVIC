import { arrowPath, routeArrow, simplifyRoute, type Obstacle, type Point } from './arrow-routing'
import { interactionOf, type Interaction } from './connection-semantics'

type Side = 'top' | 'right' | 'bottom' | 'left'
// Overview ports belong to journey nodes while connection IDs still name the actual screens.
type Endpoint = { box: Obstacle; side: Side; node?: string; boundary?: Obstacle }
export type Connection = {
  id: string; from: string; to: string; action: string; when?: string; returnTo?: string; interaction?: Interaction
  returning: boolean; branch: boolean; source: Endpoint; target: Endpoint
}
type Trunk = { id: string; d: string; arrowD: string; x: number; y: number }
export type RoutedConnection = Connection & {
  points: Point[]; d: string; branchD?: string; branchArrow: boolean; bundle?: Trunk; x: number; y: number
}
export type ConnectionBundle = { id: string; action: string; members: RoutedConnection[] }

export function connectionBounds(boxes: Obstacle[], edges: RoutedConnection[]) {
  const points = edges.flatMap(edge => edge.points)
  return { width: Math.max(0, ...boxes.map(box => box.x + box.width), ...points.map(point => point.x)) + 60,
    height: Math.max(0, ...boxes.map(box => box.y + box.height), ...points.map(point => point.y)) + 60 }
}

export function connectionBundles(edges: RoutedConnection[]): ConnectionBundle[] {
  const groups = new Map<string, RoutedConnection[]>()
  for (const edge of edges) if (edge.bundle) {
    const members = groups.get(edge.bundle.id) ?? []
    members.push(edge); groups.set(edge.bundle.id, members)
  }
  return [...groups].map(([id, members]) => ({ id, action: members[0]!.action, members }))
}

export function routeConnections(edges: Connection[], boxes: Obstacle[], innerBoxes = boxes): RoutedConnection[] {
  const groups = groupConnections(edges)
  const groupOf = new Map(groups.flatMap(group => group.members.map(edge => [edge, group] as const)))
  const used = new Map<string, number>(), sources = new Map<string, Port | undefined>(), arrivals = new Map<string, Port | undefined>(), totals = new Map<string, number>()
  const exits = new Set(edges.map(edge => portKey(edge.from, edge.source)))
  const arrivalKeys = new Set<string>()
  for (const edge of edges) {
    const key = portKey(edge.to, edge.target), arrival = JSON.stringify([key, groupOf.get(edge)!.id])
    if (!arrivalKeys.has(arrival)) { arrivalKeys.add(arrival); totals.set(key, (totals.get(key) ?? 0) + 1) }
  }
  const port = (id: string, end: Endpoint, outgoing: boolean): Port | undefined => {
    const key = portKey(id, end), ordinal = used.get(key) ?? 0, total = totals.get(key) ?? 1
    if (!outgoing) used.set(key, ordinal + 1)
    const { box, side, boundary } = end, vertical = side === 'top' || side === 'bottom'
    const spacing = Math.min(24, (vertical ? box.width : box.height) / (total + 2))
    let offset = outgoing ? 0 : (ordinal - (total - 1) / 2) * spacing
    if (!outgoing && exits.has(key)) offset += offset < 0 ? -spacing / 2 : spacing / 2
    const point = vertical
      ? { x: box.x + box.width / 2 + offset, y: box.y + (side === 'bottom' ? box.height : 0) }
      : { x: box.x + (side === 'right' ? box.width : 0), y: box.y + box.height / 2 + offset }
    const stub = { x: point.x + (side === 'right' ? 16 : side === 'left' ? -16 : 0), y: point.y + (side === 'bottom' ? 16 : side === 'top' ? -16 : 0) }
    if (!boundary) return { stub, lead: [point, stub] }
    const escape = vertical
      ? { x: stub.x, y: side === 'bottom' ? boundary.y + boundary.height + 24 : boundary.y - 24 }
      : { x: side === 'right' ? boundary.x + boundary.width + 24 : boundary.x - 24, y: stub.y }
    const lead = routeArrow(stub, escape, innerBoxes)
    return lead.length ? { stub: escape, lead: [point, ...lead] } : undefined
  }
  type Bus = { trunk: Trunk; stem: Point[]; common: Point[]; fanIn: boolean; legs: { edge: RoutedConnection; points: Point[] }[] }
  const buses = new Map<string, Bus>(), occupied: Point[][] = []
  const result: RoutedConnection[] = []
  for (const [lane, edge] of edges.entries()) {
    const group = groupOf.get(edge)!, bundled = group.members.length > 1
    const sourceKey = portKey(edge.from, edge.source), arrival = JSON.stringify([portKey(edge.to, edge.target), group.id])
    if (!sources.has(sourceKey)) sources.set(sourceKey, port(edge.from, edge.source, true))
    const a = sources.get(sourceKey)
    if (!arrivals.has(arrival)) arrivals.set(arrival, port(edge.to, edge.target, false))
    const b = arrivals.get(arrival)
    if (!a || !b) continue
    let bus = buses.get(group.id)
    const gutter = group.gutter
    const exit = { x: a.stub.x, y: gutter }, entry = { x: b.stub.x, y: gutter }
    const departure = bundled && !group.fanIn && bus ? bus.stem : edge.returning || bundled ? routeArrow(a.stub, exit, boxes, lane, occupied, 'horizontal-line') : []
    const approach = bundled && group.fanIn && bus ? bus.stem : edge.returning || bundled ? routeArrow(b.stub, entry, boxes, lane, occupied, 'horizontal-line').reverse() : []
    const middle = edge.returning || bundled ? departure.length && approach.length ? [...departure, ...approach] : [] : routeArrow(a.stub, b.stub, boxes, lane, occupied)
    if (!middle.length) continue
    const source = simplifyRoute([...a.lead.slice(0, -1), ...departure])
    const target = simplifyRoute([...approach, ...b.lead.slice(0, -1).reverse()])
    const points = simplifyRoute(edge.returning || bundled ? [...source, ...target] : [...a.lead.slice(0, -1), ...middle, ...b.lead.slice(0, -1).reverse()])
    occupied.push(points)
    if (bundled) {
      if (!bus) {
        bus = { trunk: { id: group.id, d: '', arrowD: '', x: 0, y: gutter - 12 }, stem: group.fanIn ? approach : departure, common: group.fanIn ? target : source, fanIn: group.fanIn, legs: [] }
        buses.set(group.id, bus)
      }
    }
    const label = points.slice(1).map((end, i) => ({ start: points[i]!, end })).sort((a, b) => length(b.start, b.end) - length(a.start, a.end))[0]!
    const routed: RoutedConnection = { ...edge, points, d: arrowPath(points), branchArrow: !bus || !group.fanIn, bundle: bus?.trunk, x: (label.start.x + label.end.x) / 2, y: (label.start.y + label.end.y) / 2 - 12 }
    result.push(routed)
    bus?.legs.push({ edge: routed, points: group.fanIn ? source : target })
  }
  for (const bus of buses.values()) {
    const common = bus.fanIn ? bus.common[0]! : bus.common.at(-1)!
    const anchors = bus.legs.map(leg => bus.fanIn ? leg.points.at(-1)! : leg.points[0]!)
    const sameSide = anchors.every(point => point.x < common.x) || anchors.every(point => point.x > common.x)
    const nearest = anchors.reduce((a, b) => Math.abs(a.x - common.x) < Math.abs(b.x - common.x) ? a : b)
    const join = sameSide ? towards(common, nearest) : common
    const attachments = bus.legs.map((leg, index) => {
      const attachment = towards(anchors[index]!, common)
      leg.edge.branchD = arrowPath(bus.fanIn ? [...leg.points, attachment] : [attachment, ...leg.points])
      return attachment
    })
    const left = Math.min(join.x, ...attachments.map(point => point.x)), right = Math.max(join.x, ...attachments.map(point => point.x))
    const spine = arrowPath([{ x: left, y: common.y }, { x: right, y: common.y }])
    const stem = arrowPath(bus.fanIn ? [join, ...bus.common] : [...bus.common, join])
    bus.trunk.d = spine + (bus.fanIn ? '' : ' ' + stem)
    bus.trunk.arrowD = bus.fanIn ? stem : ''
    bus.trunk.x = (left + right) / 2
  }
  return result

  function groupConnections(rows: Connection[]) {
    const identity = (edge: Connection, end: 'from' | 'to') => JSON.stringify([edge.action, interactionOf(edge), edge.when ?? '', edge.returnTo ?? '', edge.returning, edge.branch, edge.source.side, edge.target.side, edge[end]])
    const destinations = new Map<string, number>()
    for (const edge of rows) { const key = identity(edge, 'to'); destinations.set(key, (destinations.get(key) ?? 0) + 1) }
    const groups = new Map<string, Connection[]>()
    // A shared endpoint prevents matching labels from implying unrelated source/destination pairs.
    for (const edge of rows) {
      const key = (destinations.get(identity(edge, 'to')) ?? 0) > 1 ? 'to:' + identity(edge, 'to') : 'from:' + identity(edge, 'from')
      const members = groups.get(key) ?? []; members.push(edge); groups.set(key, members)
    }
    return [...groups].map(([id, members]) => {
      const bounds = members.flatMap(edge => [edge.source.boundary ?? edge.source.box, edge.target.boundary ?? edge.target.box])
      const left = Math.min(...bounds.map(box => box.x)), right = Math.max(...bounds.map(box => box.x + box.width))
      const gap = 24 + rows.indexOf(members[0]!) * 8
      let gutter = Math.max(...bounds.map(box => box.y + box.height)) + gap
      // Keep the shared horizontal line outside every obstacle it spans.
      for (;;) {
        const blocking = boxes.filter(box => box.x < right && box.x + box.width > left && gutter > box.y - 8 && gutter < box.y + box.height + 8)
        if (!blocking.length) break
        gutter = Math.max(...blocking.map(box => box.y + box.height)) + gap
      }
      return { id, members, fanIn: id.startsWith('to:'), gutter }
    })
  }
}

type Port = { stub: Point; lead: Point[] }
const portKey = (id: string, end: Endpoint) => JSON.stringify([end.node ?? id, end.side])
const length = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y)

function towards(from: Point, to: Point) {
  return { x: from.x + Math.sign(to.x - from.x) * Math.min(20, Math.abs(to.x - from.x) / 2), y: from.y }
}
