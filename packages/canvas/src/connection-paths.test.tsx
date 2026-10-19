import { expect, test } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ConnectionPaths } from './connection-paths'
import { routeConnections, type Connection } from './connection-routing'

test('rendering preserves action type through captured visits and refuses mixed-type bundles', () => {
  const box = { x: 0, y: 0, width: 100, height: 100 }
  const input: Connection[] = (['navigate', 'update', 'return'] as const).map((interaction, i) => ({ id: interaction, from: interaction, to: 'target', action: 'Done', interaction, returning: false, branch: false,
    source: { box: { ...box, y: i * 150 }, side: 'right' }, target: { box: { ...box, x: 500 }, side: 'left' },
  }))
  const edges = routeConnections(input, [])
  expect(edges.every(edge => !edge.bundle)).toBe(true)
  const markup = renderToStaticMarkup(<svg><ConnectionPaths edges={edges} markerId="semantics" disabled={false} observed={() => true} select={() => {}} selectBundle={() => {}} /></svg>)
  expect(markup).toContain('marker-end="url(#semantics-navigate)"')
  expect(markup).toContain('marker-end="url(#semantics-update)"')
  expect(markup).toContain('marker-end="url(#semantics-return)"')
  expect(markup).toContain('stroke="var(--civic-connection-update, #7c3fb0)"')
  expect(markup).toContain('stroke-dasharray="8 6"')
  expect(markup.match(/stroke-width="3"/g)).toHaveLength(3)
  expect(markup).toContain('aria-description="Action / update · Captured visit"')
})

test('the shared renderer draws one trunk and label while retaining each selectable review path', () => {
  const source = { x: 0, y: 0, width: 100, height: 100 }, target = { x: 300, y: 0, width: 100, height: 100 }
  const input: Connection[] = ['a', 'b'].map((id, index) => ({ id, from: id, to: 'target', action: 'Open', returning: false, branch: false,
    source: { box: { ...source, y: index * 150 }, side: 'right' }, target: { box: target, side: 'left' },
  }))
  const edges = routeConnections(input, [source, { ...source, y: 150 }, target])
  const markup = renderToStaticMarkup(<svg><ConnectionPaths edges={edges} markerId="test-arrow" disabled={false} selectedPath="b" select={() => {}} selectBundle={() => {}} /></svg>)
  expect(markup.match(/data-path-id=/g)).toHaveLength(3)
  expect(markup.match(/data-path-id="bundle:/g)).toHaveLength(1)
  expect(markup.match(/<text /g)).toHaveLength(1)
  expect(markup).toContain('aria-label="Review path: Open · 2 paths"')
  expect(markup).toContain('data-path-id="b" class="rh-selectable-path is-selected"')
  expect(markup).toContain('aria-disabled="false"')
  const panning = renderToStaticMarkup(<svg><ConnectionPaths edges={edges} markerId="test-arrow" disabled select={() => {}} selectBundle={() => {}} /></svg>)
  expect(panning.match(/tabindex="-1"/g)).toHaveLength(3)
  expect(panning.match(/data-path-id=/g)).toHaveLength(3)
})

test('bus branches round into the shared line without leaving a square corner or a dead stub', () => {
  const box = (x: number) => ({ x, y: 0, width: 100, height: 100 })
  for (const fanIn of [true, false]) {
    const input: Connection[] = [0, 1].map(index => ({ id: String(index), from: fanIn ? `source-${index}` : 'source', to: fanIn ? 'target' : `target-${index}`,
      action: 'Open', returning: false, branch: false,
      source: { box: box(fanIn ? index * 180 : 0), side: 'right' }, target: { box: box(fanIn ? 600 : 300 + index * 300), side: 'left' },
    }))
    const edges = routeConnections(input, [])
    expect(edges).toHaveLength(2)
    const bus = edges[0]!.bundle!
    expect(edges[1]!.bundle).toBe(bus)
    for (const edge of edges) expect(edge.branchD).toContain(' Q ')
    if (fanIn) {
      expect(bus.d).toBe('M 136 124 L 564 124')
      expect(bus.arrowD).toContain('Q 584 124 584 114')
      expect(edges[0]!.branchD).toMatch(/Q 116 124 126 124 L 136 124$/)
      expect(edges[1]!.branchD).toMatch(/Q 296 124 306 124 L 316 124$/)
    } else {
      expect(bus.d).toContain('M 136 124 L 564 124')
      expect(bus.d).toContain('Q 116 124 126 124 L 136 124')
      expect(edges[0]!.branchD).toMatch(/^M 264 124 L 274 124 Q 284 124 284 114/)
      expect(edges[1]!.branchD).toMatch(/^M 564 124 L 574 124 Q 584 124 584 114/)
    }
  }
})
