import { expect, test } from 'vitest'
import { overviewConnections } from './app-overview'
import type { AppFlow } from './app-map'
import { appFlows, flowEdges, crossFlowEdges, overviewFlows, screenSize, screenAtCenter, flowContent } from './app-map'
import { connectionStyle, interactionOf } from './connection-semantics'
import { connectionBounds, connectionBundles } from './connection-routing'

test('screen arrows meet the preview surface rather than the title or unused card padding', () => {
  const [flow] = appFlows(['a', 'b'].map(id => ({ id, label: id, journey: 'Screens', renderer: 'adapter', section: 'Web', edges: [{ action: id === 'a' ? 'Next' : 'Back', destination: id === 'a' ? 'b' : 'a' }] })), { adapter: 'module', navigation: ['Web'] })
  const edges = flowEdges(flow!)
  expect(edges).toHaveLength(2)
  const forward = edges.find(edge => edge.from === 'a')!
  expect(forward.points[0]!.y).toBe(84 + 588 / 2)
  const back = edges.find(edge => edge.from === 'b')!
  expect(back.points[0]!.y).toBe(84 + 588)
  expect(back.points.at(-1)!.y).toBe(84 + 588)
})

test('shared navigation combines only matching actions, destinations and conditions and keeps every source', () => {
  const [journey] = appFlows(['a', 'b', 'c', 'd'].map(id => ({ id, label: id, journey: 'Nav', renderer: 'adapter', section: 'Web', edges: id === 'd' ? [] : [{ action: 'Settings', destination: id === 'c' ? 'b' : 'd' }] })), { adapter: 'module', navigation: ['Web'] })
  const groups = connectionBundles(flowEdges(journey!))
  expect(groups).toHaveLength(1)
  expect(groups[0]!.members.map(edge => edge.from)).toEqual(['a', 'b'])
  expect(groups[0]!.members.every(edge => edge.to === 'd')).toBe(true)
})

test('screen paths share outgoing anchors, separate incoming ports and retain branch and return routes', () => {
  const [journey] = appFlows(['a', 'b', 'c'].map((id, index) => ({ id, label: id, journey: 'Journey', renderer: 'adapter', section: 'Web',
    edges: index === 0 ? [{ action: 'Next', destination: 'b' }, { action: 'Alternate', destination: 'c', when: 'Eligible' }] : [{ action: 'Back home', destination: 'a' }],
  })), { adapter: 'module', navigation: ['Web'] })
  const edges = flowEdges(journey!)
  expect(edges).toHaveLength(4)
  expect(edges.find(edge => edge.action === 'Next')!.branch).toBe(false)
  expect(edges.find(edge => edge.action === 'Alternate')!.branch).toBe(true)
  const outgoing = edges.filter(edge => edge.from === 'a')
  expect(outgoing[0]!.points[0]).toEqual(outgoing[1]!.points[0])
  for (const edge of outgoing) {
    expect(edge.points[1]!.y).toBe(edge.points[0]!.y)
    expect(edge.points[1]!.x).toBeGreaterThanOrEqual(edge.points[0]!.x + 16)
  }
  expect(outgoing[0]!.points).not.toEqual(outgoing[1]!.points)
  const returns = edges.filter(edge => edge.returning)
  expect(returns[0]!.bundle).toBe(returns[1]!.bundle)
  expect(returns[0]!.points.at(-1)).toEqual(returns[1]!.points.at(-1))
  for (const edge of edges) {
    for (let i = 2; i < edge.points.length - 1; i++) {
      const a = edge.points[i - 1]!, b = edge.points[i]!
      expect(a.x === b.x || a.y === b.y).toBe(true)
      for (const screen of journey!.screens) {
        const { width, height } = screenSize(screen), x = screen.x!, y = screen.y!
        expect(a.x === b.x ? a.x <= x || a.x >= x + width || Math.max(a.y, b.y) <= y || Math.min(a.y, b.y) >= y + height : a.y <= y || a.y >= y + height || Math.max(a.x, b.x) <= x || Math.min(a.x, b.x) >= x + width).toBe(true)
      }
    }
  }
  const gutters = returns.map(edge => Math.max(...edge.points.map(point => point.y)))
  expect(new Set(gutters).size).toBe(new Set(returns.map(edge => edge.bundle?.id ?? edge.id)).size)
})

test('desktop screens retain their landscape geometry and do not overlap adjacent screens', () => {
  const scenarios = ['a', 'b'].map(id => ({ id, label: id, journey: 'Desktop', renderer: 'adapter', section: 'Web', viewport: { width: 1440, height: 900 }, edges: [] }))
  const [desktop] = appFlows(scenarios, { adapter: 'module', navigation: ['Web'] })
  const first = desktop!.screens[0]!, next = desktop!.screens[1]!
  expect(screenSize(first)).toEqual({ width: 800, height: 584, previewHeight: 500 })
  expect(next.x!).toBeGreaterThan(first.x! + screenSize(first).width)
  expect(screenAtCenter(desktop!, desktop!.x + 36 + first.x! + 700, desktop!.y + 132 + first.y! + 200)?.id).toBe('a')
  expect(screenSize({})).toEqual({ width: 271, height: 672, previewHeight: 588 })
})

test('dense navigation keeps every declared path and fits its return gutters inside the flow', () => {
  const ids = Array.from({ length: 7 }, (_, index) => String(index))
  for (const viewport of [{ width: 1440, height: 900 }, { width: 393, height: 852 }]) {
    const [journey] = appFlows(ids.map(id => ({ id, label: id, journey: 'Dense', renderer: 'adapter', section: 'Web', viewport,
      edges: ids.filter(to => to !== id).map(destination => ({ destination, action: `Open ${destination}` })),
    })), { adapter: 'module', navigation: ['Web'] })
    const edges = flowEdges(journey!)
    expect(edges).toHaveLength(42)
    for (const edge of edges) if (edge.bundle) expect(Math.max(...edge.points.map(point => point.y)), `${edge.action} overshoots its shared line`).toBe(edge.bundle.y + 12)
    for (const edge of edges) for (let i = 2; i < edge.points.length; i++) {
      const a = edge.points[i - 2]!, b = edge.points[i - 1]!, c = edge.points[i]!
      const backtracks = a.x === b.x && b.x === c.x && (b.y - a.y) * (c.y - b.y) < 0 || a.y === b.y && b.y === c.y && (b.x - a.x) * (c.x - b.x) < 0
      expect(backtracks, `${edge.action} doubles back at ${JSON.stringify(b)}`).toBe(false)
    }
    for (const id of ids) for (const returning of [false, true]) {
      const outgoing = edges.filter(edge => edge.from === id && edge.returning === returning)
      expect(new Set(outgoing.map(edge => JSON.stringify(edge.points[0]))).size).toBeLessThanOrEqual(1)
      for (const incoming of edges.filter(edge => edge.to === id)) for (const exit of outgoing) expect(incoming.points.at(-1)).not.toEqual(exit.points[0])
    }
    const returns = edges.filter(edge => edge.returning)
    expect(new Set(returns.map(edge => Math.max(...edge.points.map(point => point.y)))).size).toBe(new Set(returns.map(edge => edge.bundle?.id ?? edge.id)).size)
    expect(Math.max(...edges.flatMap(edge => edge.points.map(point => point.y))) + 132).toBeLessThan(journey!.height)
  }
})

test('matching actions share trunks without merging different conditions, return contexts or unrelated endpoints', () => {
  const routes = {
    a: [{ action: 'Settings', destination: 'e', when: 'Ready' }],
    b: [{ action: 'Settings', destination: 'e', when: 'Ready' }],
    c: [{ action: 'Settings', destination: 'e', when: 'Blocked' }],
    d: [{ action: 'Settings', destination: 'e', when: 'Ready', returnTo: 'd' }],
    e: [{ action: 'Settings', destination: 'a', when: 'Ready' }],
  }
  const [journey] = appFlows(Object.entries(routes).map(([id, edges]) => ({ id, label: id, journey: 'Settings', renderer: 'adapter', section: 'Web', edges })), { adapter: 'module', navigation: ['Web'] })
  const edges = flowEdges(journey!), groups = connectionBundles(edges)
  expect(edges).toHaveLength(5)
  expect(groups).toHaveLength(1)
  const [first, second] = groups[0]!.members
  expect(groups[0]!.members.map(edge => edge.from)).toEqual(['a', 'b'])
  expect(first!.bundle).toBe(second!.bundle)
  expect(first!.bundle!.arrowD).not.toBe('')
  expect(first!.branchArrow).toBe(false)
  expect(first!.branchD).not.toEqual(second!.branchD)
  expect(edges.filter(edge => !edge.bundle)).toHaveLength(3)
})

test('adjacent navigation buses stop at their shared line instead of overshooting and hooking back', () => {
  const destinations = [[1, 5, 6], [0, 2, 4, 5, 6], [0, 1, 5, 6], [0, 1, 2, 5, 6], [0, 1, 5, 6], [0, 1, 6], [0, 1, 5]]
  const [journey] = appFlows(destinations.map((rows, index) => ({ id: String(index), label: String(index), journey: 'Example', section: 'Web', renderer: 'adapter',
    viewport: { width: 1440, height: 900 }, edges: rows.map(to => ({ action: `Open ${to}`, destination: String(to) })),
  })), { adapter: 'module', navigation: ['Web'] })
  const edges = flowEdges(journey!)
  expect(edges).toHaveLength(27)
  for (const edge of edges) if (edge.bundle) expect(Math.max(...edge.points.map(point => point.y)), `${edge.from}: ${edge.action} overshoots its shared line`).toBe(edge.bundle.y + 12)
})

test('one action can fan out to multiple destinations while retaining each review path', () => {
  const [journey] = appFlows(['a', 'b', 'c'].map(id => ({ id, label: id, journey: 'Open', renderer: 'adapter', section: 'Web',
    edges: id === 'a' ? ['b', 'c'].map(destination => ({ action: 'Open', destination })) : [],
  })), { adapter: 'module', navigation: ['Web'] })
  const edges = flowEdges(journey!), groups = connectionBundles(edges)
  expect(edges).toHaveLength(2)
  expect(groups).toHaveLength(1)
  expect(edges[0]!.id).not.toBe(edges[1]!.id)
  expect(edges[0]!.bundle).toBe(edges[1]!.bundle)
  expect(edges[0]!.bundle!.arrowD).toBe('')
  expect(edges.every(edge => edge.branchArrow)).toBe(true)
  expect(edges.map(edge => edge.to)).toEqual(['b', 'c'])
})

test('stacked states share the bottom exit while a self-return keeps a separate arrival', () => {
  const [journey] = appFlows(['a', 'b', 'c'].map(id => ({ id, label: id, journey: 'States', renderer: 'adapter', section: 'Web', branchOf: id === 'a' ? undefined : 'a',
    edges: id === 'a' ? ['a', 'b', 'c'].map(destination => ({ action: `Open ${destination}`, destination })) : [],
  })), { adapter: 'module', navigation: ['Web'] })
  const edges = flowEdges(journey!)
  expect(edges).toHaveLength(3)
  expect(new Set(edges.map(edge => JSON.stringify(edge.points[0]))).size).toBe(1)
  const returning = edges.find(edge => edge.to === 'a')!
  expect(returning.returning).toBe(true)
  expect(returning.points.at(-1)).not.toEqual(returning.points[0])
})

const flow = (id: string, x: number, y: number, edges: { action: string; destination: string; when?: string }[] = []): AppFlow => ({ id, x, y, width: 340, height: 260, label: id, section: id, screens: [{ id, scenario: id, label: id, partial: false, edges }] })
test('overview follows declared app navigation even when the registry starts in Example', () => {
  const flows = appFlows(['Example', 'Start', 'Home'].map(section => ({ id: section, label: section, journey: section, section, renderer: 'adapter' })), { adapter: 'module', navigation: ['Start', 'Home', 'Example'] })
  const overview = overviewFlows(flows)
  expect([...overview].sort((a, b) => a.x - b.x).map(flow => flow.section)).toEqual(['Start', 'Home', 'Example'])
})

test('spatial backtracking never changes navigation or update meaning in any canvas view', () => {
  const scenarios = [
    { id: 'a', label: 'Earlier screen', journey: 'A', section: 'Web', renderer: 'adapter' },
    { id: 'b', label: 'Later screen', journey: 'B', section: 'Web', renderer: 'adapter', edges: [{ action: 'Open item', destination: 'a' }, { action: 'Save item', destination: 'a', when: 'Valid' }, { action: 'Back home', destination: 'a' }] },
  ]
  const separate = appFlows(scenarios, { adapter: 'module', navigation: ['Web'] })
  const together = appFlows(scenarios.map(row => ({ ...row, journey: 'Same' })), { adapter: 'module', navigation: ['Web'] })
  for (const edges of [flowEdges(together[0]!), crossFlowEdges(separate), overviewConnections(overviewFlows(separate))]) {
    expect(edges.map(edge => interactionOf(edge))).toEqual(['navigate', 'update', 'return'])
    expect(connectionStyle(edges[0]!).strokeDasharray).toBeUndefined()
    expect(connectionStyle(edges[1]!).strokeDasharray).toBe('2 5')
    expect(connectionStyle(edges[2]!).strokeDasharray).toBe('8 6')
    expect(edges.every(edge => edge.from === 'b' && edge.to === 'a')).toBe(true)
  }
})
test('overview shares outgoing anchors while keeping opposing arrows distinct', () => {
  const flows = [flow('home', 40, 40, [{ action: 'Open wash', destination: 'wash' }, { action: 'Open dry', destination: 'dry', when: 'Washed pieces' }]), flow('wash', 500, 40, [{ action: 'Back home', destination: 'home' }]), flow('dry', 500, 400)]
  const edges = overviewConnections(flows)
  expect(edges).toHaveLength(3)
  const forward = edges.find((edge) => edge.from === 'home' && edge.to === 'wash')!
  const back = edges.find((edge) => edge.returning)!
  expect(forward.points[0]).toEqual(edges.find(edge => edge.to === 'dry')!.points[0])
  for (const edge of edges.filter(edge => edge.from === 'home')) {
    expect(edge.points[1]!.y).toBe(edge.points[0]!.y)
    expect(edge.points[1]!.x).toBeGreaterThanOrEqual(edge.points[0]!.x + 16)
  }
  expect(forward.points[0]).not.toEqual(back.points.at(-1))
  expect(edges.find((edge) => edge.to === 'dry')!.branch).toBe(true)
  for (const edge of edges) for (let i = 2; i < edge.points.length - 1; i++) {
    const a = edge.points[i - 1]!, b = edge.points[i]!
    expect(a.x === b.x || a.y === b.y).toBe(true)
    for (const box of flows) {
      if (a.x === b.x) expect(a.x <= box.x || a.x >= box.x + box.width || Math.max(a.y, b.y) <= box.y || Math.min(a.y, b.y) >= box.y + box.height).toBe(true)
      else expect(a.y <= box.y || a.y >= box.y + box.height || Math.max(a.x, b.x) <= box.x || Math.min(a.x, b.x) >= box.x + box.width).toBe(true)
    }
  }
})

test('overview summarizes journey pairs without dropping actions, conditions or interaction types', () => {
  const flows = [flow('home', 40, 40, [
    { action: 'Open wash', destination: 'wash' }, { action: 'Inspect wash', destination: 'wash' },
    { action: 'Open eligible wash', destination: 'wash', when: 'Eligible' },
    { action: 'Save wash', destination: 'wash' },
  ]), flow('wash', 500, 40, [{ action: 'Back home', destination: 'home' }])]
  const edges = overviewConnections(flows), groups = connectionBundles(edges)
  expect(edges).toHaveLength(5)
  expect(new Set(edges.map(edge => edge.id)).size).toBe(5)
  expect(groups).toHaveLength(4)
  const navigation = groups.find(group => group.members.some(edge => edge.action === 'Inspect wash'))!
  expect(navigation.members.map(edge => edge.action)).toEqual(['Open wash', 'Inspect wash'])
  expect(navigation.members.every(edge => !edge.when && interactionOf(edge) === 'navigate')).toBe(true)
  expect(groups.find(group => group.members.some(edge => edge.when))!.members).toHaveLength(1)
  expect(edges.every(edge => edge.branchD === '' && edge.bundle?.arrowD)).toBe(true)
  expect(Math.max(...edges.flatMap(edge => edge.points.map(point => point.y)))).toBeLessThan(300)
})

test('cross-journey fan-in, fan-out and returns share trunks without losing identities or crossing screens', () => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 393, height: 852 }]) {
    const routes = [
      { id: 'a', journey: 'Start', section: 'Work', edges: [{ action: 'Inspect', destination: 'd' }, { action: 'Open', destination: 'd' }, { action: 'Open', destination: 'e' }] },
      { id: 'b', journey: 'Other', section: 'Work', edges: [{ action: 'Inspect', destination: 'd' }] },
      { id: 'c', journey: 'Other', section: 'Work', edges: [{ action: 'Inspect', destination: 'd', when: 'Blocked' }] },
      { id: 'd', journey: 'Details', section: 'Details', edges: [{ action: 'Back home', destination: 'a' }] },
      { id: 'e', journey: 'Details', section: 'Details', edges: [{ action: 'Back home', destination: 'a' }] },
    ]
    const flows = appFlows(routes.map(row => ({ ...row, label: row.id, renderer: 'adapter', viewport })), { adapter: 'module', navigation: ['Work', 'Details'] })
    const edges = crossFlowEdges(flows), groups = connectionBundles(edges)
    expect(edges).toHaveLength(7)
    expect(new Set(edges.map(edge => edge.id)).size).toBe(7)
    expect(groups).toHaveLength(3)
    expect(groups.find(group => group.action === 'Inspect')!.members.map(edge => edge.from)).toEqual(['a', 'b'])
    expect(groups.find(group => group.action === 'Open')!.members.map(edge => edge.to)).toEqual(['d', 'e'])
    expect(groups.find(group => group.action === 'Back home')!.members.every(edge => edge.returning)).toBe(true)
    expect(edges.find(edge => edge.when === 'Blocked')!.bundle).toBeUndefined()
    const bounds = connectionBounds(flows, edges)
    expect(Math.max(...edges.flatMap(edge => edge.points.map(point => point.x)))).toBeLessThan(bounds.width)
    expect(Math.max(...edges.flatMap(edge => edge.points.map(point => point.y)))).toBeLessThan(bounds.height)
    const boxes = flows.flatMap(flow => [{ x: flow.x, y: flow.y, width: flow.width, height: 104 }, ...flow.screens.map(screen => ({ x: flow.x + flowContent.x + screen.x!, y: flow.y + flowContent.y + screen.y!, ...screenSize(screen) }))])
    for (const edge of edges) for (let i = 1; i < edge.points.length; i++) {
      const a = edge.points[i - 1]!, b = edge.points[i]!
      expect(a.x === b.x || a.y === b.y).toBe(true)
      for (const box of boxes) expect(a.x === b.x
        ? a.x <= box.x || a.x >= box.x + box.width || Math.max(a.y, b.y) <= box.y || Math.min(a.y, b.y) >= box.y + box.height
        : a.y <= box.y || a.y >= box.y + box.height || Math.max(a.x, b.x) <= box.x || Math.min(a.x, b.x) >= box.x + box.width).toBe(true)
    }
    const overview = overviewConnections(flows)
    expect(new Set(overview.map(edge => edge.id))).toEqual(new Set(edges.map(edge => edge.id)))
    expect(connectionBundles(overview).some(group => group.members.some(edge => edge.action === 'Inspect'))).toBe(true)
    const conditional = connectionBundles(overview).find(group => group.members.some(edge => edge.when === 'Blocked'))!
    expect(conditional.members.every(edge => edge.when === 'Blocked')).toBe(true)
  }
})
