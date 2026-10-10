import towel from './towel-journey.json'
import { towelEdges } from './journey'
import { arrowPath, routeArrow } from './arrow-routing'

export type RouteAction = { from: string; action: string; destination?: string; route: string; when: string; returnTo?: string; source: string; status: string }
export type MapScreen = { id: string; label: string; scenario: string; partial: boolean; x?: number; y?: number; edges: { action: string; destination: string }[]; routeActions?: RouteAction[] }
export type AppFlow = { id: string; label: string; section: string; screens: MapScreen[]; x: number; y: number; width: number; height: number }
export type MapScenario = { id: string; label: string; journey: string; renderer: string; screen?: string; edges?: { action: string; destination: string }[]; routeActions?: RouteAction[] }
const areas: Record<string, string> = { home: 'Home', closet: 'Closet', laundry: 'Washing & recovery', drying: 'Drying', household: 'Household', me: 'Me', settings: 'Settings', product: 'Product details', profile: 'Profiles', outfit: 'Outfits' }
// Tab order comes from kit/app-shell.tsx; entry screens precede the signed-in navigation.
export const journeySections = ['Start', 'Home', 'Closet', 'Laundry', 'Household', 'Me']
const sectionOf: Record<string, string> = { 'Sign-in & setup': 'Start', Home: 'Home', Outfits: 'Home', Closet: 'Closet', 'Add a towel': 'Closet', 'Multicolor pack': 'Closet', 'Saved records': 'Closet', 'Nested quick edits': 'Closet', 'Washing & recovery': 'Laundry', Drying: 'Laundry', Household: 'Household', Appliances: 'Household', Products: 'Household', 'Product details': 'Household', Profiles: 'Household', Me: 'Me', Settings: 'Me' }
const entryScreens = ['sign-in', 'create-account', 'reset-email', 'reset-code', 'reset-password', 'household-choice', 'household-name', 'household-setup', 'household-created', 'household-joined', 'setup-first-use', 'setup-closet']
const flowOrder = ['Sign-in & setup', 'Home', 'Outfits', 'Closet', 'Add a towel', 'Multicolor pack', 'Saved records', 'Nested quick edits', 'Washing & recovery', 'Drying', 'Household', 'Appliances', 'Products', 'Product details', 'Profiles', 'Me', 'Settings']
export function appFlows(scenarios: MapScenario[]): AppFlow[] {
  const flows = new Map<string, { id: string; label: string; screens: MapScreen[] }>()
  flows.set('towel', { id: 'towel', label: 'Add a towel', screens: towel.map((node) => ({ ...node, partial: false, edges: towelEdges.filter((edge) => edge.from === node.id).map((edge) => ({ action: edge.label, destination: edge.to })) })) })
  for (const scenario of scenarios) {
    if (scenario.id.startsWith('intake.towel.')) continue
    const partial = scenario.renderer === 'legacy'
    const area = (scenario.screen ?? '').split('-')[0]!
    const isEntry = entryScreens.includes(scenario.screen ?? '') || area === 'join'
    const label = partial ? isEntry ? 'Sign-in & setup' : area === 'invite' ? 'Household' : areas[area] ?? 'Washing & recovery' : scenario.journey
    const id = partial ? `area:${label}` : `flow:${label}`
    if (!flows.has(id)) flows.set(id, { id, label, screens: [] })
    flows.get(id)!.screens.push({ id: scenario.id, label: scenario.label, scenario: scenario.id, partial, edges: scenario.edges ?? [], routeActions: scenario.routeActions })
  }
  const rows = [...flows.values()].sort((a, b) => flowOrder.indexOf(a.label) - flowOrder.indexOf(b.label))
  for (const flow of rows) flow.screens.sort((a, b) => {
    const key = (screen: MapScreen) => screen.id.replace(/^legacy\./, '')
    if (flow.label === 'Sign-in & setup') return (entryScreens.indexOf(key(a)) < 0 ? 99 : entryScreens.indexOf(key(a))) - (entryScreens.indexOf(key(b)) < 0 ? 99 : entryScreens.indexOf(key(b)))
    const rank = (screen: MapScreen) => /-(index|one)$/.test(key(screen)) ? 0 : /-empty$/.test(key(screen)) ? 1 : 2
    return rank(a) - rank(b)
  })
  const result = rows.map((flow) => {
    const width = 72 + flow.screens.length * 440
    return { ...flow, section: sectionOf[flow.label] ?? 'Laundry', x: 0, y: 0, width, height: flow.id === 'towel' || flow.label === 'Multicolor pack' ? 1900 : 1000, screens: flow.screens.map((screen, i) => ({ ...screen, label: screen.partial ? screen.label.replace(/-/g, ' ').replace(/^./, (letter) => letter.toUpperCase()) : screen.label, x: i * 440, y: screen.id === 'dye' || screen.id === 'intake.pack.dye' ? 900 : 0 })) }
  })
  let x = 40
  for (const section of journeySections) {
    const column = result.filter((flow) => flow.section === section)
    let y = 40
    for (const flow of column) { flow.x = x; flow.y = y; y += flow.height + 240 }
    if (column.length) x += Math.max(...column.map((flow) => flow.width)) + 320
  }
  return result
}

// Navigation grouping is layout intent; only registry edges establish declared actions.
export function overviewFlows(flows: AppFlow[]): AppFlow[] {
  const sections = journeySections.filter((section) => flows.some((flow) => flow.section === section))
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
    return [{ from: screen.id, to: target.id, action: edge.action, d: arrowPath([a, ...points, b]), branch: screen.edges.length > 1, returning: target.x! <= screen.x!, x: a.x + 30, y: bottom > Math.max(a.y, b.y) ? bottom - 12 : b.y > a.y ? a.y + 110 : a.y - 16 }]
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
    return [{ id: `${screen.id}-${target.id}-${edge.action}`, action: edge.action, d, x: startX + 20, y: start.y - 12, kind: /^back\b|return\b/i.test(edge.action) ? 'return' : screen.edges.length > 1 ? 'branch' : 'action' }]
  })))
}
