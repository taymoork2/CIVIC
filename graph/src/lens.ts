import type { Graph } from './graph.ts'
import type { DesignFrame, Environment, Evidence, GraphRecord, Line } from './schema.ts'
import { CODE_LINE_TOOLS, RUN_METHODS } from './schema.ts'

// The story lens (decision 0013, point 3): a story plays through one design line, one code
// line and one environment, and the lens is part of its link. The design line says which
// frames are the design intent (a draft, main or a library publish), the code line says which
// run evidence counts (a branch, a PR or a package release), and the environment says what
// runs where people use it, and whether that is the code line's head. Lines and environments
// live in the review store; the lens reads them beside a product graph. Read-only,
// deterministic, no model calls (D30).

export interface StoryLens {
  design?: string
  code?: string
  environment?: string
}

export interface ResolvedLens {
  design?: Line
  code?: Line
  environment?: Environment
  /** The lens as a link's query, such as `design=line:figma.main&code=line:git.main`. */
  query: string
}

/** What one screen looks like through the lens. */
export interface LensView {
  /** The design line's frames that design the screen, and whether each differs from the line's base. */
  frames: (Pick<DesignFrame, 'node' | 'name' | 'page'> & { change: 'unchanged' | 'changed' | 'added' | 'no base' })[]
  /** Run evidence about the screen taken on the code line, at its head or a preview of it. */
  runs: Pick<Evidence, 'id' | 'title' | 'outcome' | 'method'>[]
  /** Run evidence about the screen from other lines or revisions, which this lens sets aside. */
  elsewhere: number
  /** Whether the environment runs the code line, and at which revision. */
  deployed?: { revision: string; observedAt: string; current: boolean }
}

/** Finds the lens's lines and environment among the store's records, and refuses a lens that names the wrong kind. */
export function resolveLens(records: readonly GraphRecord[], lens: StoryLens): ResolvedLens {
  const line = (id: string, what: string) => {
    const found = records.find((record) => record.id === id)
    if (found?.kind !== 'line') throw new Error(`No line ${id} for the lens's ${what}. \`civic lines\` lists them.`)
    return found
  }
  const design = lens.design ? line(lens.design, 'design') : undefined
  if (design && !design.frames) throw new Error(`${design.id} records no design frames, so it can't be a lens's design line. Register it with civic design or civic draft.`)
  const code = lens.code ? line(lens.code, 'code') : undefined
  if (code && !(CODE_LINE_TOOLS as readonly string[]).includes(code.tool)) throw new Error(`${code.id} is a ${code.tool} line, not code. A lens's code line is a branch, a PR or a package release.`)
  let environment: Environment | undefined
  if (lens.environment) {
    const found = records.find((record) => record.id === lens.environment)
    if (found?.kind !== 'environment') throw new Error(`No environment ${lens.environment} for the lens.`)
    environment = found
  }
  const query = [design && `design=${design.id}`, code && `code=${code.id}`, environment && `environment=${environment.id}`].filter(Boolean).join('&')
  return { ...(design ? { design } : {}), ...(code ? { code } : {}), ...(environment ? { environment } : {}), query }
}

/** Reads a lens from a link's query: the inverse of `query`. */
export function parseLens(query: string): StoryLens {
  const params = new URLSearchParams(query.replace(/^[?#]/, ''))
  const lens: StoryLens = {}
  for (const key of ['design', 'code', 'environment'] as const) {
    const value = params.get(key)
    if (value) lens[key] = value
  }
  return lens
}

export function lensView(graph: Graph, records: readonly GraphRecord[], lens: ResolvedLens, targetId: string): LensView {
  const target = graph.get(targetId)
  // A Figma frame designs the targets anchored to its node ID; another tool's frame names them.
  const designs = (frame: DesignFrame) => (frame.designs ? frame.designs.includes(targetId) : target?.source?.tool === 'figma' && target.source.anchor === frame.node)
  const base = lens.design?.base ? records.find((record): record is Line => record.id === lens.design!.base && record.kind === 'line') : undefined
  const frames = (lens.design?.frames ?? []).filter(designs).map((frame) => {
    const before = base?.frames?.find((item) => item.node === frame.node)
    const change: LensView['frames'][number]['change'] = !base?.frames ? 'no base' : !before ? 'added' : before.hash === frame.hash && before.name === frame.name ? 'unchanged' : 'changed'
    return { node: frame.node, name: frame.name, page: frame.page, change }
  })
  const code = lens.code
  const revisions = new Set(code ? [code.head, ...(code.previews ?? []).map((preview) => preview.revision)] : [])
  const runs = graph.ofKind('evidence').filter((item) => item.subjectIds.includes(targetId) && (RUN_METHODS as readonly string[]).includes(item.method))
  const onLine = (item: Evidence) => !code || item.source.line === code.id || revisions.has(item.source.revision)
  const deployedRun = code && lens.environment?.runs.find((run) => run.line === code.id)
  return {
    frames,
    runs: runs.filter(onLine).map((item) => ({ id: item.id, title: item.title, outcome: item.outcome, method: item.method })),
    elsewhere: runs.filter((item) => !onLine(item)).length,
    ...(deployedRun ? { deployed: { revision: deployedRun.revision, observedAt: deployedRun.observedAt, current: deployedRun.revision === code.head } } : {}),
  }
}

/** The lens in words, for a page heading or the CLI. */
export function describeLens(lens: ResolvedLens): string {
  const parts = [
    lens.design ? `design ${lens.design.title} at ${lens.design.head}` : 'no design line',
    lens.code ? `code ${lens.code.title} at ${lens.code.head.slice(0, 12)}` : 'every code line',
    lens.environment ? `environment ${lens.environment.title}` : 'no environment',
  ]
  return parts.join(', ')
}
