import { randomUUID } from 'node:crypto'
import { resolveAnchor, type AnchorOutcome, type Annotation, type DraftChoice, type GraphDocument, type Line, type ObservedElement } from '../../graph/src/index.ts'
import { idPath } from './git.ts'
import { ensureActor } from './identity.ts'
import { allow, find, type Context } from './loop.ts'

// Design drafts as lines (D36). CIVIC reads a draft from its Figma file export, as it reads
// the main file, so no new integration is needed: only the line label on import. Comments on
// a draft stay on that draft, and choosing a draft is a person's DraftChoice record.

/** The parts of a Figma REST file export (GET /v1/files/:key) that lines need. */
export interface FigmaFileExport {
  name: string
  version: string
  lastModified?: string
  document: FigmaNode
}

interface FigmaNode {
  id: string
  name: string
  type: string
  children?: FigmaNode[]
}

/** A top-level frame on a page: what a designer annotates on a draft. */
export interface DraftFrame {
  node: string
  name: string
  page: string
}

/** Where an annotation made on the draft stands on the revision just registered. */
export interface FollowedAnnotation {
  annotationId: string
  title: string
  outcome: AnchorOutcome
}

export interface DesignLineResult {
  line: Line
  frames: DraftFrame[]
  /** Annotations on this line that point at a Figma node, found again or not on this revision. */
  annotations: FollowedAnnotation[]
}

export function designLineId(fileKey: string): string {
  return `line:figma.${idPath(fileKey)}`
}

export function draftLineId(fileKey: string, name: string): string {
  return `${designLineId(fileKey)}.draft.${idPath(name.toLowerCase())}`
}

const figmaLink = (key: string) => `https://www.figma.com/design/${key}`

function checkExport(file: FigmaFileExport) {
  if (typeof file?.version !== 'string' || typeof file.name !== 'string' || typeof file.document !== 'object' || file.document === null) {
    throw new Error('That is not a Figma file export: it needs the name, version and document of GET /v1/files/:key.')
  }
}

/**
 * Records a design file's main line at the version its export carries. Drafts branch from
 * it, so register the main file before its drafts, and again when it moves.
 */
export function registerDesignFile(context: Context, input: { file: FigmaFileExport; fileKey: string }): DesignLineResult {
  allow(context, 'write', 'register a design file')
  checkExport(input.file)
  const { file, fileKey } = input
  return context.store.transact((document) => {
    const id = designLineId(fileKey)
    let line = document.records.find((record): record is Line => record.id === id && record.kind === 'line')
    if (!line) {
      line = { id, kind: 'line', title: file.name, type: 'main', tool: 'figma', ref: fileKey, head: file.version, status: 'open' }
      document.records.push(line)
    }
    line.head = file.version
    line.source = { tool: 'figma', importer: 'civic-review', revision: file.version, path: figmaLink(fileKey) }
    return { line: structuredClone(line), frames: framesOf(file), annotations: follow(document, id, file) }
  })
}

/**
 * Records a designer's draft as its own line, branched from the file's main line, at the
 * version its export carries. A Figma branch passes its branch key; a draft page or frame
 * set inside the main file is named only. Registering it again moves the line to the new
 * version and reports which annotations on its frames are still found there.
 */
export function registerDesignDraft(context: Context, input: { file: FigmaFileExport; fileKey: string; name: string; branchKey?: string }): DesignLineResult {
  allow(context, 'write', 'register a design draft')
  checkExport(input.file)
  const { file, fileKey, name } = input
  if (!name.trim()) throw new Error('Name the draft, as the designer calls it.')
  return context.store.transact((document) => {
    const base = designLineId(fileKey)
    if (!document.records.some((record) => record.id === base && record.kind === 'line')) {
      throw new Error(`Register the main design file first: civic design <main export> --file ${fileKey}`)
    }
    const id = draftLineId(fileKey, name)
    let line = document.records.find((record): record is Line => record.id === id && record.kind === 'line')
    if (line && line.status !== 'open') {
      throw new Error(`${id} is ${line.status}${line.status === 'abandoned' ? ' (another draft was chosen)' : ''}. Register further work under a new draft name.`)
    }
    if (!line) {
      line = { id, kind: 'line', title: `Draft: ${name}`, type: 'design-draft', tool: 'figma', ref: input.branchKey ?? name, base, head: file.version, status: 'open' }
      document.records.push(line)
    }
    line.head = file.version
    line.source = { tool: 'figma', importer: 'civic-review', revision: file.version, path: figmaLink(input.branchKey ?? fileKey) }
    return { line: structuredClone(line), frames: framesOf(file), annotations: follow(document, id, file) }
  })
}

/**
 * A person chooses one draft over the others from the same base. The choice names the
 * chosen line and the revision they saw; the other open drafts are marked abandoned, never
 * deleted. When the designer has already merged the draft, `mergedAs` names the main file
 * version that carries it, and the chosen line is marked merged.
 */
export function chooseDraft(context: Context, input: { line: string; rationale: string; mergedAs?: string }): DraftChoice {
  if (context.identity.type !== 'person') throw new Error('Only a person chooses between drafts; an agent can annotate them.')
  allow(context, 'approve', 'choose a design draft')
  if (!input.rationale.trim()) throw new Error('Say why this draft was chosen, so the others keep their answer.')
  return context.store.transact((document) => {
    const chosen = find<Line>(document, input.line, 'line')
    if (chosen.type !== 'design-draft') throw new Error(`${chosen.id} is not a design draft.`)
    if (chosen.status !== 'open') throw new Error(`${chosen.id} is already ${chosen.status}.`)
    const over = document.records.filter((record): record is Line => record.kind === 'line' && record.type === 'design-draft' && record.base === chosen.base && record.id !== chosen.id && record.status === 'open')
    for (const line of over) line.status = 'abandoned'
    if (input.mergedAs) {
      chosen.status = 'merged'
      chosen.mergedAs = input.mergedAs
    }
    const choice: DraftChoice = {
      id: `choice:${randomUUID()}`,
      kind: 'draft-choice',
      title: `Chose ${chosen.title}`,
      base: chosen.base!,
      chosen: { line: chosen.id, revision: chosen.head },
      over: over.map((line) => line.id),
      rationale: input.rationale,
      at: (context.now ?? (() => new Date()))().toISOString(),
      writtenBy: ensureActor(document, context.identity),
    }
    document.records.push(choice)
    return structuredClone(choice)
  })
}

function framesOf(file: FigmaFileExport): DraftFrame[] {
  return (file.document.children ?? []).flatMap((page) =>
    (page.children ?? []).filter((node) => ['FRAME', 'SECTION', 'COMPONENT', 'COMPONENT_SET'].includes(node.type)).map((node) => ({ node: node.id, name: node.name, page: page.name })),
  )
}

function nodesOf(node: FigmaNode, into: ObservedElement[] = []): ObservedElement[] {
  into.push({ civicIds: [], figmaNode: node.id, name: node.name })
  for (const child of node.children ?? []) nodesOf(child, into)
  return into
}

/** D37 on a design line: an annotation on a Figma node is found by that node ID, or not at all. */
function follow(document: GraphDocument, lineId: string, file: FigmaFileExport): FollowedAnnotation[] {
  const annotations = document.records.filter((record): record is Annotation => record.kind === 'annotation' && record.seenOn.line === lineId && record.anchor?.locator?.figmaNode !== undefined)
  if (annotations.length === 0) return []
  const elements = nodesOf(file.document)
  return annotations.map((annotation) => ({
    annotationId: annotation.id,
    title: annotation.title,
    // Only the node locator applies here: graph target IDs are found on product captures, not in a design file.
    outcome: resolveAnchor({ targetIds: [], locator: { figmaNode: annotation.anchor!.locator!.figmaNode! } }, elements).outcome,
  }))
}
