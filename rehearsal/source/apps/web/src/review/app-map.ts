import { journeyGraph, entryScreens, pathId } from './journey-graph.mjs'
import { arrowPath, routeArrow } from './arrow-routing'

export type RouteAction = { from: string; action: string; destination?: string; route: string; when: string; returnTo?: string; source: string; status: string }
export type MapScreen = { id: string; label: string; scenario: string; partial: boolean; section?: string; x?: number; y?: number; branchOf?: string; edges: { action: string; destination: string; when?: string; returnTo?: string }[]; routeActions?: RouteAction[] }
export type AppFlow = { id: string; label: string; section: string; screens: MapScreen[]; x: number; y: number; width: number; height: number }
export type MapScenario = { id: string; label: string; journey: string; renderer: string; flow?: string; section?: string; screen?: string; branchOf?: string; edges?: MapScreen['edges']; routeActions?: RouteAction[]; discovery?: { evidence: string } }
// Tab order comes from kit/app-shell.tsx; entry screens precede the signed-in navigation.
export const journeySections = ['Start', 'Home', 'Closet', 'Laundry', 'Household', 'Me']
const sectionOf: Record<string, string> = { 'Sign-in & setup': 'Start', Home: 'Home', Outfits: 'Home', Closet: 'Closet', 'Add a towel': 'Closet', 'Multicolor pack': 'Closet', 'Saved records': 'Closet', 'Nested quick edits': 'Closet', 'Washing & recovery': 'Laundry', Drying: 'Laundry', Household: 'Household', Appliances: 'Household', Products: 'Household', 'Product details': 'Household', Profiles: 'Household', Me: 'Me', Settings: 'Me' }
const flowOrder = ['Sign-in & setup', 'Home', 'Outfits', 'Closet', 'Add a towel', 'Multicolor pack', 'Saved records', 'Nested quick edits', 'Washing & recovery', 'Drying', 'Family simulation', 'Household', 'Appliances', 'Products', 'Product details', 'Profiles', 'Me', 'Settings']
export function appFlows(scenarios: MapScenario[], project?: { adapter: string; navigation: string[] }): AppFlow[] {
  const generic = project?.adapter === 'module'
  const sections = project?.navigation ?? journeySections
  const rows = journeyGraph(scenarios, project)
  if (!generic) rows.sort((a, b) => flowOrder.indexOf(a.label) - flowOrder.indexOf(b.label))
  if (!generic) for (const flow of rows) flow.screens.sort((a, b) => {
    const key = (screen: MapScreen) => screen.id.replace(/^legacy\./, '')
    if (flow.label === 'Sign-in & setup') return (entryScreens.indexOf(key(a)) < 0 ? 99 : entryScreens.indexOf(key(a))) - (entryScreens.indexOf(key(b)) < 0 ? 99 : entryScreens.indexOf(key(b)))
    const rank = (screen: MapScreen) => /-(index|one)$/.test(key(screen)) ? 0 : /-empty$/.test(key(screen)) ? 1 : 2
    return rank(a) - rank(b)
  })
  const result = rows.map((flow) => {
    const main = flow.screens.filter((screen) => !screen.branchOf)
    const lanes = new Map<number, number>()
    const screens = flow.screens.map((screen, i) => {
      const parent = main.findIndex((entry) => entry.id === screen.branchOf)
      const x = (parent >= 0 ? parent : main.indexOf(screen) >= 0 ? main.indexOf(screen) : i) * 440
      const lane = (lanes.get(x) ?? 0) + 1
      if (screen.branchOf) lanes.set(x, lane)
      return { ...screen, label: screen.partial ? screen.label.replace(/-/g, ' ').replace(/^./, (letter) => letter.toUpperCase()) : screen.label, x, y: screen.branchOf ? lane * 900 : screen.id === 'dye' || screen.id === 'intake.pack.dye' ? 900 : 0 }
    })
    const width = 72 + (Math.max(...screens.map((screen) => screen.x)) + 440)
    const height = Math.max(1000, ...screens.map((screen) => screen.y + 1000))
    return { ...flow, section: generic ? flow.screens[0]?.section ?? sections[0]! : sectionOf[flow.label] ?? 'Laundry', x: 0, y: 0, width, height, screens }
  })
  let x = 40
  for (const section of sections) {
    const column = result.filter((flow) => flow.section === section)
    let y = 40
    for (const flow of column) { flow.x = x; flow.y = y; y += flow.height + 240 }
    if (column.length) x += Math.max(...column.map((flow) => flow.width)) + 320
  }
  return result
}

// Navigation grouping is layout intent; only registry edges establish declared actions.
export function overviewFlows(flows: AppFlow[]): AppFlow[] {
  const sections = [...new Set(flows.map((flow) => flow.section))]
  return flows.map((flow) => ({ ...flow, x: 40 + sections.indexOf(flow.section) * 460, y: 40 + flows.filter((other) => other.section === flow.section).indexOf(flow) * 360, width: 340, height: 260 }))
}

export function flowAtCenter(flows: AppFlow[], x: number, y: number): AppFlow | undefined {
  return flows.find((flow) => x >= flow.x && x <= flow.x + flow.width && y >= flow.y && y <= flow.y + flow.height)
}

export function screenAtCenter(flow: AppFlow, x: number, y: number): MapScreen | undefined {
  return flow.screens.find((screen) => x >= flow.x + 36 + screen.x! && x <= flow.x + 36 + screen.x! + 271 && y >= flow.y + 132 + screen.y! && y <= flow.y + 132 + screen.y! + 665)
}

export function flowEdges(flow: AppFlow) {
  const boxes = flow.screens.map((screen) => ({ x: screen.x!, y: screen.y!, width: 271, height: 737 }))
  return flow.screens.flatMap((screen) => screen.edges.flatMap((edge, lane) => {
    const target = flow.screens.find((node) => node.id === edge.destination)
    if (!target) return []
    const a = { x: screen.x! + 271, y: screen.y! + 370 }, b = { x: target.x!, y: target.y! + 370 }
    const points = routeArrow({ x: a.x + 16, y: a.y }, { x: b.x - 16, y: b.y }, boxes, lane)
    if (!points.length) return []
    const bottom = Math.max(...points.map((point) => point.y))
    return [{ id: pathId(screen.id, target.id, edge.action), from: screen.id, to: target.id, action: edge.action, when: edge.when, returnTo: edge.returnTo, d: arrowPath([a, ...points, b]), branch: screen.edges.length > 1, returning: target.x! <= screen.x!, x: a.x + 30, y: bottom > Math.max(a.y, b.y) ? bottom - 12 : b.y > a.y ? a.y + 110 : a.y - 16 }]
  }))
}

export function crossFlowEdges(flows: AppFlow[]) {
  let lane = 0
  return flows.flatMap((flow) => flow.screens.flatMap((screen) => screen.edges.flatMap((edge) => {
    const destination = flows.find((other) => other.id !== flow.id && other.screens.some((node) => node.id === edge.destination))
    const target = destination?.screens.find((node) => node.id === edge.destination)
    if (!destination || !target) return []
    const x1 = flow.x + 36 + screen.x! + 271
    const x2 = destination.x + 36 + target.x!
    const startX = x1 - 135.5, startY = flow.y + 132 + screen.y! + 737
    const endX = x2 + 135.5, endY = destination.y + 112 + target.y!
    const start = { x: startX, y: flow.y + flow.height + 32 }, end = { x: endX, y: destination.y - 16 }
    const points = routeArrow(start, end, flows, lane++)
    if (!points.length) return []
    const d = arrowPath([{ x: startX, y: startY }, ...points, { x: endX, y: endY + 20 }])
    return [{ id: pathId(screen.id, target.id, edge.action), from: screen.id, to: target.id, action: edge.action, when: edge.when, returnTo: edge.returnTo, d, x: startX + 20, y: start.y - 12, kind: /^back\b|return\b/i.test(edge.action) ? 'return' : screen.edges.length > 1 ? 'branch' : 'action' }]
  })))
}
