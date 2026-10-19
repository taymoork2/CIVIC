export type Interaction = 'navigate' | 'update' | 'return'
export type PathAction = { action: string; interaction?: Interaction; when?: string }

// Legacy registries have labels only; explicit interaction metadata takes precedence.
export function interactionOf(edge: PathAction): Interaction {
  if (edge.interaction) return edge.interaction
  if (/^(?:back\b|go back\b|return to\b|cancel\b|close\b)/i.test(edge.action.trim())) return 'return'
  if (/^(?:save|submit|confirm|delete|remove|dismiss|update|transfer|put away|send)\b/i.test(edge.action.trim())) return 'update'
  return 'navigate'
}

export function connectionStyle(edge: PathAction) {
  const interaction = interactionOf(edge)
  return {
    interaction,
    label: interaction === 'return' ? 'Back / cancel' : interaction === 'update' ? 'Action / update' : 'Navigate',
    stroke: interaction === 'return' ? '#526880' : interaction === 'update' ? '#7c3fb0' : edge.when ? '#157b70' : '#2456d6',
    strokeDasharray: interaction === 'return' ? '8 6' : edge.when ? '2 5' : undefined,
  }
}

export function connectionDescription(edge: PathAction) {
  return `${connectionStyle(edge).label}${edge.interaction ? '' : ' · inferred from action label'}${edge.when ? ` · When: ${edge.when}` : ''}`
}
