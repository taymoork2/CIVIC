import { journeyGraph, pathId } from './journey-graph.mjs'
import { extension } from './extension'
import { routeConnections, type Connection } from './connection-routing'
import { interactionOf, type Interaction } from './connection-semantics'

export type RouteAction = { from: string; action: string; destination?: string; route: string; when: string; returnTo?: string; source: string; status: string }
export type MapScreen = { id: string; label: string; scenario: string; partial: boolean; viewport?: { width: number; height: number }; section?: string; x?: number; y?: number; branchOf?: string; edges: { action: string; destination: string; when?: string; returnTo?: string; interaction?: Interaction }[]; routeActions?: RouteAction[] }
export type AppFlow = { id: string; label: string; section: string; screens: MapScreen[]; x: number; y: number; width: number; height: number }
export type MapScenario = { id: string; label: string; journey: string; renderer: string; targetId?: string; componentId?: string; component?: string; componentExport?: string; route?: string; viewport?: MapScreen['viewport']; flow?: string; section?: string; screen?: string; branchOf?: string; edges?: MapScreen['edges']; routeActions?: RouteAction[]; discovery?: { evidence: string } }
export type GraphFlow = { id: string; label: string; screens: MapScreen[] }
export const flowContent = { x: 38, y: 134 }
export const screenHeadingHeight = 84
export function screenSize(screen: Pick<MapScreen, 'viewport'>) {
  if (!screen.viewport) return { width: 271, height: 588 + screenHeadingHeight, previewHeight: 588 }
  const width = screen.viewport.width > screen.viewport.height ? 800 : 271
  const previewHeight = width * screen.viewport.height / screen.viewport.width
  return { width, height: previewHeight + screenHeadingHeight, previewHeight }
}
const previewBox = (screen: MapScreen) => ({ x: screen.x!, y: screen.y! + screenHeadingHeight, width: screenSize(screen).width, height: screenSize(screen).previewHeight })
/**
 * Lays out the journey graph. Module projects group screens by their declared flow and section; a
 * host's canvas extension may supply its own graph, flow order and sections (Laundry does).
 */
export function appFlows(scenarios: MapScenario[], project?: { adapter: string; navigation: string[] }): AppFlow[] {
  const sections = project?.navigation ?? extension.sections ?? []
  const rows: GraphFlow[] = (extension.journeyGraph ?? journeyGraph)(scenarios, project)
  extension.arrange?.(rows)
  const result = rows.map((flow) => {
    const main = flow.screens.filter((screen) => !screen.branchOf)
    const spacing = Math.max(...flow.screens.map(screen => screenSize(screen).width)) + 169
    const lanes = new Map<number, number>()
    const screens = flow.screens.map((screen, i) => {
      const parent = main.findIndex((entry) => entry.id === screen.branchOf)
      const x = (parent >= 0 ? parent : main.indexOf(screen) >= 0 ? main.indexOf(screen) : i) * spacing
      const lane = (lanes.get(x) ?? 0) + 1
      if (screen.branchOf) lanes.set(x, lane)
      return { ...screen, label: screen.partial ? screen.label.replace(/-/g, ' ').replace(/^./, (letter) => letter.toUpperCase()) : screen.label, x, y: screen.branchOf ? lane * 900 : extension.lowered?.includes(screen.id) ? 900 : 0 }
    })
    const width = 72 + Math.max(...screens.map((screen) => screen.x + screenSize(screen).width + 169))
    const gutter = Math.max(131, screens.reduce((count, screen) => count + screen.edges.length, 0) * 8 + 40)
    const height = Math.max(1000, ...screens.map((screen) => screen.y + screenSize(screen).height + 132 + gutter))
    return { ...flow, section: extension.sectionOf?.(flow) ?? flow.screens[0]?.section ?? sections[0]!, x: 0, y: 0, width, height, screens }
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
  const sections = [...new Set([...flows].sort((a, b) => a.x - b.x).map((flow) => flow.section))]
  return flows.map((flow) => ({ ...flow, x: 40 + sections.indexOf(flow.section) * 460, y: 40 + flows.filter((other) => other.section === flow.section).indexOf(flow) * 360, width: 340, height: 260 }))
}

export function flowAtCenter(flows: AppFlow[], x: number, y: number): AppFlow | undefined {
  return flows.find((flow) => x >= flow.x && x <= flow.x + flow.width && y >= flow.y && y <= flow.y + flow.height)
}

export function screenAtCenter(flow: AppFlow, x: number, y: number): MapScreen | undefined {
  return flow.screens.find((screen) => x >= flow.x + flowContent.x + screen.x! && x <= flow.x + flowContent.x + screen.x! + screenSize(screen).width && y >= flow.y + flowContent.y + screen.y! && y <= flow.y + flowContent.y + screen.y! + screenSize(screen).height)
}

export function flowEdges(flow: AppFlow) {
  const boxes = flow.screens.map((screen) => ({ x: screen.x!, y: screen.y!, ...screenSize(screen) }))
  const raw = flow.screens.flatMap<Connection>((screen) => screen.edges.flatMap((edge) => {
    const target = flow.screens.find((node) => node.id === edge.destination)
    if (!target) return []
    const vertical = screen.x === target.x, returning = vertical ? target.y! <= screen.y! : target.x! < screen.x!
    // Backtracking geometry uses bottom ports; it does not determine interaction meaning.
    return [{ id: pathId(screen.id, target.id, edge.action), from: screen.id, to: target.id, ...edge, returning, branch: Boolean(edge.when),
      source: { box: previewBox(screen), side: returning || vertical ? 'bottom' : 'right' },
      target: { box: previewBox(target), side: returning ? 'bottom' : 'left' },
    }]
  }))
  return routeConnections(raw, boxes)
}

export function crossFlowEdges(flows: AppFlow[]) {
  const innerBoxes = flows.flatMap(flow => [{ x: flow.x, y: flow.y, width: flow.width, height: 104 }, ...flow.screens.map(screen => ({ x: flow.x + flowContent.x + screen.x!, y: flow.y + flowContent.y + screen.y!, ...screenSize(screen) }))])
  return routeConnections(crossFlowConnections(flows), flows, innerBoxes)
}

export function crossFlowConnections(flows: AppFlow[]): Connection[] {
  return flows.flatMap((flow) => flow.screens.flatMap<Connection>((screen) => screen.edges.flatMap((edge) => {
    const destination = flows.find((other) => other.id !== flow.id && other.screens.some((node) => node.id === edge.destination))
    const target = destination?.screens.find((node) => node.id === edge.destination)
    if (!destination || !target) return []
    return [{ id: pathId(screen.id, target.id, edge.action), from: screen.id, to: target.id, ...edge, returning: interactionOf(edge) === 'return', branch: Boolean(edge.when),
      source: { box: screenBox(flow, screen), boundary: flow, side: 'bottom' }, target: { box: screenBox(destination, target), boundary: destination, side: destination.x < flow.x ? 'right' : 'left' },
    }]
  })))
}

const screenBox = (flow: AppFlow, screen: MapScreen) => ({ ...previewBox(screen), x: flow.x + flowContent.x + screen.x!, y: flow.y + flowContent.y + screen.y! + screenHeadingHeight })
