import { journeyGraph as moduleGraph, pathId } from '@civic/canvas/journey-graph'
import towel from './towel-journey.json' with { type: 'json' }

export const towelEdges = [...towel.slice(0, -1).flatMap((node, i) => node.id === 'origin' ? [
  { from: 'origin', to: 'dye', label: 'Newly owned', when: 'Item is newly owned' },
  { from: 'origin', to: 'care:wash', label: 'Pre-owned · skip dye', when: 'Item is pre-owned' },
] : [{ from: node.id, to: towel[i + 1].id, label: node.id === 'fabric' ? 'Next: color' : node.id === 'color' ? 'Next: where from' : 'Continue' }]), { from: 'care:wash', to: 'stain', label: 'Do not wash / dry clean only', when: 'Washing is disallowed or dry clean only' }]

const areas = { home: 'Home', closet: 'Closet', laundry: 'Washing & recovery', drying: 'Drying', household: 'Household', me: 'Me', settings: 'Settings', product: 'Product details', profile: 'Profiles', outfit: 'Outfits' }
export const entryScreens = ['sign-in', 'create-account', 'reset-email', 'reset-code', 'reset-password', 'household-choice', 'household-name', 'household-setup', 'household-created', 'household-joined', 'setup-first-use', 'setup-closet']
// Laundry's journey graph for the canvas extension and its review adapter; module projects use CIVIC's own.
export function journeyGraph(scenarios, project) {
  if (project?.adapter === 'module') return moduleGraph(scenarios)
  const flows = new Map([['towel', { id: 'towel', label: 'Add a towel', screens: towel.map((node) => ({ ...node, partial: false, edges: towelEdges.filter((edge) => edge.from === node.id).map((edge) => ({ action: edge.label, destination: edge.to, when: edge.when })) })) }]])
  for (const scenario of scenarios) {
    if (scenario.id.startsWith('intake.towel.')) continue
    const partial = scenario.renderer === 'legacy' || scenario.preview === 'requires-start-state'
    const runtime = scenario.renderer === 'runtime'
    const area = runtime ? (scenario.route?.split('/')[1] || 'home') : (scenario.screen ?? '').split('-')[0]
    const isEntry = entryScreens.includes(scenario.screen ?? '') || area === 'join'
    const label = partial || runtime ? isEntry ? 'Sign-in & setup' : area === 'invite' ? 'Household' : areas[area] ?? (runtime ? scenario.journey : 'Washing & recovery') : scenario.journey
    const id = partial || runtime || scenario.renderer === 'route-state' || scenario.renderer === 'reminder' ? `area:${label}` : `flow:${label}`
    if (!flows.has(id)) flows.set(id, { id, label, screens: [] })
    flows.get(id).screens.push({ id: scenario.id, label: scenario.label, scenario: scenario.id, partial, branchOf: scenario.branchOf, edges: scenario.edges ?? [], routeActions: scenario.routeActions })
  }
  return [...flows.values()]
}

export { pathId }
