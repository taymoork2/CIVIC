import { expect, test } from 'vitest'
import { appFlows, crossFlowEdges, flowAtCenter, screenAtCenter } from './app-map'
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
  expect(crossFlowEdges(flows).map((edge) => edge.id)).toContain('intake.pack.final-records.pack')
  expect(flows.find((flow) => flow.label === 'Drying')!.screens[0]!.partial).toBe(true)
  for (const flow of flows) expect(flowAtCenter(flows, flow.x + flow.width / 2, flow.y + flow.height / 2)?.id).toBe(flow.id)
  expect(flowAtCenter(flows, -1, -1)).toBeUndefined()
  for (let i = 1; i < flows.length; i++) {
    expect(flows[i]!.x).toBeGreaterThan(flows[i - 1]!.x + flows[i - 1]!.width)
    expect(flows[i]!.y).toBe(flows[0]!.y)
  }
  const origin = towel.screens.find((screen) => screen.id === 'origin')!
  expect(screenAtCenter(towel, towel.x + 36 + origin.x! + 100, towel.y + 132 + origin.y! + 300)?.id).toBe('origin')
  expect(screenAtCenter(towel, towel.x + 36 + origin.x! + 350, towel.y + 500)).toBeUndefined()
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
