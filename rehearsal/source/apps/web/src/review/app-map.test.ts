import { expect, test } from 'vitest'
import { appFlows, crossFlowEdges, flowAtCenter, screenAtCenter, overviewFlows, flowEdges } from './app-map'
import scenarios from './scenarios.json'

test('the app map retains every registered screen once and adds the separate towel care states', () => {
  const flows = appFlows([...scenarios, { id: 'legacy.drying-queue', label: 'Drying queue', journey: 'Existing specimens', renderer: 'legacy', screen: 'drying-queue' }])
  const screens = flows.flatMap((flow) => flow.screens)
  expect(new Set(screens.map((screen) => screen.id)).size).toBe(screens.length)
  for (const scenario of scenarios.filter((entry) => !entry.id.startsWith('intake.towel.'))) expect(screens.some((screen) => screen.id === scenario.id)).toBe(true)
  const towel = flows.find((flow) => flow.id === 'towel')!
  expect(towel.screens).toHaveLength(13)
  expect(towel.screens.find((screen) => screen.id === 'origin')!.edges.map((edge) => edge.destination)).toEqual(['dye', 'care:wash'])
  expect(towel.screens.every((screen, i) => screen.x === i * 440)).toBe(true)
  expect(towel.screens.find((screen) => screen.id === 'dye')!.y).toBeGreaterThan(towel.screens.find((screen) => screen.id === 'origin')!.y!)
  expect(crossFlowEdges(flows).some((edge) => edge.id.startsWith('intake.pack.final-records.pack-'))).toBe(true)
  expect(flows.find((flow) => flow.label === 'Drying')!.screens[0]!.partial).toBe(true)
  for (const flow of flows) expect(flowAtCenter(flows, flow.x + flow.width / 2, flow.y + flow.height / 2)?.id).toBe(flow.id)
  expect(flowAtCenter(flows, -1, -1)).toBeUndefined()
  const pack = flows.find((flow) => flow.label === 'Multicolor pack')!
  expect(pack.x).toBe(towel.x)
  expect(pack.y).toBeGreaterThan(towel.y + towel.height)
  expect(towel.screens.find((screen) => screen.id === 'dye')!.y).toBeGreaterThan(737)
  const branches = flowEdges(towel).filter((edge) => edge.from === 'origin')
  expect(branches.map((edge) => edge.to)).toEqual(['dye', 'care:wash'])
  expect(branches.every((edge) => edge.branch && !edge.d.includes(' C '))).toBe(true)
  expect(branches[0]!.d).not.toEqual(branches[1]!.d)
  const origin = towel.screens.find((screen) => screen.id === 'origin')!
  expect(screenAtCenter(towel, towel.x + 36 + origin.x! + 100, towel.y + 132 + origin.y! + 300)?.id).toBe('origin')
  expect(screenAtCenter(towel, towel.x + 36 + origin.x! + 350, towel.y + 500)).toBeUndefined()
})

test('app overview keeps navigation horizontal and related flows in nonoverlapping vertical lanes', () => {
  const flows = overviewFlows(appFlows(scenarios))
  const towel = flows.find((flow) => flow.id === 'towel')!
  const pack = flows.find((flow) => flow.label === 'Multicolor pack')!
  expect(pack.x).toBe(towel.x)
  expect(pack.y).toBeGreaterThan(towel.y + towel.height)
  expect(flows.every((flow) => flow.width === 340)).toBe(true)
  for (const from of flows) for (const to of flows.filter((flow) => flow !== from)) {
    expect(from.x + from.width <= to.x || to.x + to.width <= from.x || from.y + from.height <= to.y || to.y + to.height <= from.y).toBe(true)
  }
  expect(crossFlowEdges(flows).some((edge) => edge.id.startsWith('saved-intake.pack.type-'))).toBe(false)
})

test('declared actions can jump across navigation areas and back without inventing adjacent-tab edges', () => {
  const partial = (screen: string, destination: string) => ({ id: `legacy.${screen}`, screen, label: screen, journey: 'Existing specimens', renderer: 'legacy', edges: [{ action: 'Open history', destination }] })
  const flows = appFlows([partial('me-history', 'legacy.laundry-completed'), partial('laundry-completed', 'legacy.me-history'), partial('home-one', 'unmapped')])
  const edges = crossFlowEdges(flows)
  expect(edges).toHaveLength(2)
  expect(edges.every((edge) => !/undefined|NaN/.test(edge.d))).toBe(true)
  const me = flows.find((flow) => flow.section === 'Me')!
  const laundry = flows.find((flow) => flow.section === 'Laundry')!
  expect(me.x).toBeGreaterThan(laundry.x)
  expect(edges.some((edge) => edge.id.startsWith('legacy.me-history-legacy.laundry-completed'))).toBe(true)
  expect(edges.some((edge) => edge.id.startsWith('legacy.laundry-completed-legacy.me-history'))).toBe(true)
  expect(edges.some((edge) => edge.id.includes('home-one'))).toBe(false)
})

test('entry precedes Home and flows belong to their launching navigation area', () => {
  const partial = (screen: string) => ({ id: `legacy.${screen}`, screen, label: screen, journey: 'Existing specimens', renderer: 'legacy' })
  const flows = appFlows([...scenarios, ...['home-running', 'home-one', 'household-choice', 'sign-in', 'me-index', 'closet-index', 'household-index'].map(partial)])
  expect(flows.slice(0, 3).map((flow) => flow.label)).toEqual(['Sign-in & setup', 'Home', 'Closet'])
  expect(flows[0]!.screens.map((screen) => screen.id)).toEqual(['legacy.sign-in', 'legacy.household-choice'])
  expect(flows[1]!.screens[0]!.id).toBe('legacy.home-one')
  expect(flows.find((flow) => flow.id === 'towel')!.section).toBe('Closet')
  expect(flows.find((flow) => flow.label === 'Appliances')!.section).toBe('Household')
  expect(flows.at(-1)!.section).toBe('Me')
})
