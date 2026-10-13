import { placesOn } from './completeness.ts'
import { decisionFor } from './decisions.ts'
import type { Graph } from './graph.ts'
import { propertyCovers } from './ids.ts'
import type { ComponentInstance, Decision, Override } from './schema.ts'

// Design and code instances of the same screen, compared (decision 0011, point 7). The design
// file says how the product changes a library component; the code says which extension
// points it sets. Each design change is matched to the code uses that express the same
// contract property, so a reviewer sees what the code builds of the design, what it doesn't,
// and what it sets that the design doesn't show. Deterministic and read-only.

export interface DesignChangeInCode {
  override: Override
  /** The maintainers' decision on it, when there is one: a rejected change should stay out of the code. */
  decision?: Decision['outcome']
  /** Code uses that express the same property. */
  code: { instanceId: string; extensionPointId: string; value?: string | number | boolean }[]
}

export interface ScreenImplementation {
  screenId: string
  semanticId: string
  design: string[]
  code: string[]
  changes: DesignChangeInCode[]
  /** Extension points the code sets that no design change on the screen accounts for. */
  codeOnly: { instanceId: string; extensionPointId: string; property: string; value?: string | number | boolean }[]
}

/** Per component on a screen (its states and the product components it places included), design changes against code uses. */
export function designAndCode(graph: Graph, screenId: string): ScreenImplementation[] {
  const places = new Set(placesOn(graph, screenId))
  const instances = graph.ofKind('component-instance').filter((instance) => places.has(instance.placedOn))
  const semantics = [...new Set(instances.map((instance) => instance.semanticId))].sort()
  const conflicts = graph.ofKind('contract-conflict')
  return semantics.flatMap((semanticId) => {
    const of = (origin: ComponentInstance['origin']) => instances.filter((instance) => instance.semanticId === semanticId && instance.origin === origin)
    const design = of('design')
    const code = of('code')
    if (code.length === 0) return []
    const designIds = new Set(design.map((instance) => instance.id))
    const overrides = graph.ofKind('override').filter((override) => designIds.has(override.instanceId)).sort((a, b) => a.id.localeCompare(b.id))
    const uses = code.flatMap((instance) => (instance.uses ?? []).map((use) => ({ instanceId: instance.id, ...use })))
    const related = (a: string, b: string) => propertyCovers(a, b) || propertyCovers(b, a)
    const changes = overrides.map((override): DesignChangeInCode => {
      const conflict = conflicts.find((candidate) => candidate.sides.some((side) => side.recordId === override.id))
      const decision = conflict ? decisionFor(graph, conflict.id) : undefined
      return {
        override,
        ...(decision ? { decision: decision.outcome } : {}),
        code: uses.filter((use) => related(use.property, override.property)).map(({ instanceId, extensionPointId, value }) => ({ instanceId, extensionPointId, ...(value !== undefined ? { value } : {}) })),
      }
    })
    const codeOnly = uses.filter((use) => !overrides.some((override) => related(use.property, override.property)))
    return [{ screenId, semanticId, design: design.map((instance) => instance.id), code: code.map((instance) => instance.id), changes, codeOnly }]
  })
}

/** The comparison as Markdown, one section per component. */
export function renderDesignAndCode(graph: Graph, results: ScreenImplementation[]): string {
  const title = (id: string) => graph.get(id)?.title ?? id
  const point = (id: string) => {
    const record = graph.get(id)
    return record?.kind === 'extension-point' ? `\`${record.name}\` ${record.mechanism}` : `\`${id}\``
  }
  const lines: string[] = []
  for (const result of results) {
    lines.push(`## ${title(result.screenId)}: ${title(result.semanticId)}`, '')
    lines.push(`${result.design.length} design instance(s) and ${result.code.length} code instance(s).`, '')
    for (const change of result.changes) {
      const built = change.code.map((use) => `${point(use.extensionPointId)}${use.value !== undefined ? ` = ${String(use.value)}` : ''}`)
      const decided = change.decision ? ` Decided: ${change.decision}.` : ' Not decided yet.'
      lines.push(`- Design changes \`${change.override.property}\` (${change.override.title}). ${built.length > 0 ? `The code sets ${built.join(', ')}.` : 'The code does not set it.'}${decided}`)
    }
    if (result.changes.length === 0) lines.push('- The design uses the component as the library draws it.')
    if (result.codeOnly.length > 0) {
      lines.push(`- The code also sets ${result.codeOnly.map((use) => `${point(use.extensionPointId)} (${use.property})`).join(', ')}, which the design shows without a change.`)
    }
    lines.push('')
  }
  return lines.join('\n').trimEnd()
}
