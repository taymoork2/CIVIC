// The canvas and the review server's feedback validator share these identities; layout never invents a transition.
/** Groups a module project's registered screens into flows, in registry order. */
export function journeyGraph(scenarios) {
  const flows = new Map()
  for (const scenario of scenarios) {
    const id = scenario.flow ?? `flow:${scenario.journey}`
    if (!flows.has(id)) flows.set(id, { id, label: scenario.journey, screens: [] })
    flows.get(id).screens.push({ id: scenario.id, label: scenario.label, scenario: scenario.id, partial: scenario.renderer === 'legacy' || scenario.preview === 'requires-start-state', section: scenario.section, branchOf: scenario.branchOf, edges: scenario.edges ?? [], routeActions: scenario.routeActions, viewport: scenario.viewport })
  }
  return [...flows.values()]
}

export const pathId = (from, to, action) => JSON.stringify([from, to, action])
