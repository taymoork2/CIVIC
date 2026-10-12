import type { CanvasExtension } from '@civic/canvas/extension'
import type { GraphFlow, MapScreen } from '@civic/canvas/app-map'
import { journeyGraph, entryScreens } from './journey-graph.mjs'
import { useTowelSession } from './towel-session'

// Laundry App's canvas: its own flow grouping and order, the towel journey as a guided run, its older workspace and the synthetic laundry day page (`?familyDay=1`).
// Tab order comes from kit/app-shell.tsx; entry screens precede the signed-in navigation.
const sections = ['Start', 'Home', 'Closet', 'Laundry', 'Household', 'Me']
const sectionOf: Record<string, string> = { 'Sign-in & setup': 'Start', Home: 'Home', Outfits: 'Home', Closet: 'Closet', 'Add a towel': 'Closet', 'Multicolor pack': 'Closet', 'Saved records': 'Closet', 'Nested quick edits': 'Closet', 'Washing & recovery': 'Laundry', Drying: 'Laundry', Household: 'Household', Appliances: 'Household', Products: 'Household', 'Product details': 'Household', Profiles: 'Household', Me: 'Me', Settings: 'Me' }
const flowOrder = ['Sign-in & setup', 'Home', 'Outfits', 'Closet', 'Add a towel', 'Multicolor pack', 'Saved records', 'Nested quick edits', 'Washing & recovery', 'Drying', 'Family laundry day', 'Household', 'Appliances', 'Products', 'Product details', 'Profiles', 'Me', 'Settings']

function arrange(rows: GraphFlow[]) {
  rows.sort((a, b) => flowOrder.indexOf(a.label) - flowOrder.indexOf(b.label))
  for (const flow of rows) flow.screens.sort((a, b) => {
    const key = (screen: MapScreen) => screen.id.replace(/^legacy\./, '')
    if (flow.label === 'Sign-in & setup') return (entryScreens.indexOf(key(a)) < 0 ? 99 : entryScreens.indexOf(key(a))) - (entryScreens.indexOf(key(b)) < 0 ? 99 : entryScreens.indexOf(key(b)))
    const rank = (screen: MapScreen) => /-(index|one)$/.test(key(screen)) ? 0 : /-empty$/.test(key(screen)) ? 1 : 2
    return rank(a) - rank(b)
  })
}

const laundryCanvas: CanvasExtension = {
  journeyGraph,
  arrange,
  sections,
  sectionOf: (flow) => sectionOf[flow.label] ?? 'Laundry',
  lowered: ['dye', 'intake.pack.dye'],
  guidedFlow: 'towel',
  useGuidedSession: useTowelSession,
  adapterScenario: (scenario) => scenario.startsWith('app.'),
  frameParams: (scenario) => scenario.startsWith('family.') ? ['familySize', 'familyStage'] : [],
  draftKey: 'rehearsal:review:draft:v1',
  legacy: () => import('./workspace'),
  pages: { familyDay: () => import('./family-workspace') },
}
export default laundryCanvas
