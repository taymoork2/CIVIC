import { expect, test } from 'vitest'
import { overviewConnections } from './app-overview'
import type { AppFlow } from './app-map'

const flow = (id: string, x: number, y: number, edges: { action: string; destination: string; when?: string }[] = []): AppFlow => ({ id, x, y, width: 340, height: 260, label: id, section: id, screens: [{ id, scenario: id, label: id, partial: false, edges }] })
test('overview routes opposing arrows to distinct ports and preserves action, branch and return identities', () => {
  const flows = [flow('home', 40, 40, [{ action: 'Open wash', destination: 'wash' }, { action: 'Open dry', destination: 'dry', when: 'Washed pieces' }]), flow('wash', 500, 40, [{ action: 'Back home', destination: 'home' }]), flow('dry', 500, 400)]
  const edges = overviewConnections(flows)
  expect(edges).toHaveLength(3)
  const forward = edges.find((edge) => edge.from === 'home' && edge.to === 'wash')!
  const back = edges.find((edge) => edge.returning)!
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
