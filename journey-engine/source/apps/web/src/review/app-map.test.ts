import { expect, test } from 'vitest'
import { appFlows, crossFlowEdges, flowAtCenter, screenAtCenter, overviewFlows, flowEdges } from '@civic/canvas/app-map'
import scenarios from './scenarios.json'
import routeActions from './route-actions.json'

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
  expect(crossFlowEdges(flows).some((edge) => edge.from === 'intake.pack.final' && edge.to === 'records.pack')).toBe(true)
  expect(flows.find((flow) => flow.label === 'Drying')!.screens.find((screen) => screen.id === 'legacy.drying-queue')!.partial).toBe(true)
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

test('route variants share their existing area and occupy separate branch lanes', () => {
  const flows = appFlows([...scenarios, { id: 'legacy.closet-record', label: 'Closet record', screen: 'closet-record', journey: 'Existing specimens', renderer: 'legacy' }])
  expect(flows.filter((flow) => flow.label === 'Closet')).toHaveLength(1)
  for (const flow of flows) for (const screen of flow.screens.filter((screen) => screen.branchOf)) {
    expect(screen.y).toBeGreaterThan(737)
    expect(screen.y! + 797).toBeLessThan(flow.height)
    for (const other of flow.screens.filter((other) => other !== screen)) expect(other.x !== screen.x || Math.abs(other.y! - screen.y!) >= 900).toBe(true)
  }
})

test('all five newly mapped destinations have routed arrows and their returns retain conditions', () => {
  const ids = [...new Set(routeActions.flatMap((action) => [action.from, action.destination]))]
  const legacy = ids.filter((id) => id.startsWith('legacy.')).map((id) => ({ id, label: id, screen: id.slice(7), renderer: 'legacy', journey: 'Existing specimens' }))
  const entries = [...scenarios, ...legacy].map((scenario) => ({ ...scenario, edges: routeActions.filter((action) => action.from === scenario.id).map((action) => ({ action: action.action, destination: action.destination, when: action.when, returnTo: action.returnTo })) }))
  const flows = appFlows(entries)
  const arrows = crossFlowEdges(flows)
  for (const id of ['route.closet.add-choose', 'route.laundry.session-closet', 'route.laundry.hamper-item', 'route.drying.washer-queued', 'route.closet.history']) {
    expect(arrows.some((edge) => edge.to === id)).toBe(true)
    expect(flows.flatMap((flow) => flow.screens).find((screen) => screen.id === id)!.edges.some((edge) => edge.when && edge.returnTo)).toBe(true)
  }
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
  expect(crossFlowEdges(flows).some((edge) => edge.from === 'saved' && edge.to === 'intake.pack.type')).toBe(false)
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
  expect(edges.some((edge) => edge.from === 'legacy.me-history' && edge.to === 'legacy.laundry-completed')).toBe(true)
  expect(edges.some((edge) => edge.from === 'legacy.laundry-completed' && edge.to === 'legacy.me-history')).toBe(true)
  expect(edges.some((edge) => edge.from === 'legacy.home-one' || edge.to === 'legacy.home-one')).toBe(false)
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
