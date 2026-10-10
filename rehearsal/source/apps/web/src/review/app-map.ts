import towel from './towel-journey.json'
import { towelEdges } from './journey'

export type MapScreen = { id: string; label: string; scenario: string; partial: boolean; x?: number; y?: number; edges: { action: string; destination: string }[] }
export type AppFlow = { id: string; label: string; section: string; screens: MapScreen[]; x: number; y: number; width: number; height: number }
export type MapScenario = { id: string; label: string; journey: string; renderer: string; screen?: string; edges?: { action: string; destination: string }[] }
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
    flows.get(id)!.screens.push({ id: scenario.id, label: scenario.label, scenario: scenario.id, partial, edges: scenario.edges ?? [] })
  }
  const rows = [...flows.values()].sort((a, b) => flowOrder.indexOf(a.label) - flowOrder.indexOf(b.label))
  for (const flow of rows) flow.screens.sort((a, b) => {
    const key = (screen: MapScreen) => screen.id.replace(/^legacy\./, '')
    if (flow.label === 'Sign-in & setup') return (entryScreens.indexOf(key(a)) < 0 ? 99 : entryScreens.indexOf(key(a))) - (entryScreens.indexOf(key(b)) < 0 ? 99 : entryScreens.indexOf(key(b)))
    const rank = (screen: MapScreen) => /-(index|one)$/.test(key(screen)) ? 0 : /-empty$/.test(key(screen)) ? 1 : 2
    return rank(a) - rank(b)
  })
  let x = 40
  return rows.map((flow) => {
    const width = 72 + flow.screens.length * 440
    const result = { ...flow, section: sectionOf[flow.label] ?? 'Laundry', x, y: 40, width, height: flow.id === 'towel' || flow.label === 'Multicolor pack' ? 1560 : 1000, screens: flow.screens.map((screen, i) => ({ ...screen, label: screen.partial ? screen.label.replace(/-/g, ' ').replace(/^./, (letter) => letter.toUpperCase()) : screen.label, x: i * 440, y: screen.id === 'dye' || screen.id === 'intake.pack.dye' ? 520 : 0 })) }
    x += width + 320
    return result
  })
}

export function flowAtCenter(flows: AppFlow[], x: number, y: number): AppFlow | undefined {
  return flows.find((flow) => x >= flow.x && x <= flow.x + flow.width && y >= flow.y && y <= flow.y + flow.height)
}

export function screenAtCenter(flow: AppFlow, x: number, y: number): MapScreen | undefined {
  return flow.screens.find((screen) => x >= flow.x + 36 + screen.x! && x <= flow.x + 36 + screen.x! + 271 && y >= flow.y + 132 + screen.y! && y <= flow.y + 132 + screen.y! + 665)
}

export function crossFlowEdges(flows: AppFlow[]) {
  return flows.flatMap((flow) => flow.screens.flatMap((screen) => screen.edges.flatMap((edge) => {
    const destination = flows.find((other) => other.id !== flow.id && other.screens.some((node) => node.id === edge.destination))
    const target = destination?.screens.find((node) => node.id === edge.destination)
    if (!destination || !target) return []
    const x1 = flow.x + 36 + screen.x! + 271, y1 = flow.y + 132 + screen.y! + 370
    const x2 = destination.x + 36 + target.x!, y2 = destination.y + 132 + target.y! + 370
    return [{ id: `${screen.id}-${target.id}`, action: edge.action, d: `M ${x1} ${y1} C ${x1 + 100} ${y1}, ${x2 - 100} ${y2}, ${x2} ${y2}`, x: x1 + 30, y: y1 - 20 }]
  })))
}
