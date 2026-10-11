#!/usr/bin/env node
// Trims a full Figma file export (`GET /v1/files/:key`) to what the demo reads: the file's
// identity and the path down to each design kit's component set or frame, with only the
// node fields the importer uses. The result keeps Figma's REST shape, so the importer reads
// the trimmed and the full export the same way; the full kit is several MB of artwork the
// demo never looks at, and CC BY 4.0 asks for credit, not a copy of all of it.
//
//   node demo/fluent-button/design/trim.ts <full-export.json> > demo/fluent-button/design/android-kit.figma.json

import { readFileSync } from 'node:fs'
import type { DesignKitMapping } from '../../../importers/src/index.ts'

interface FigmaNode {
  id: string
  name: string
  type: string
  children?: FigmaNode[]
  componentPropertyDefinitions?: unknown
}

const [input] = process.argv.slice(2)
if (!input) throw new Error('Usage: node trim.ts <full-export.json>')
const file = JSON.parse(readFileSync(input, 'utf8')) as { name: string; version: string; lastModified: string; schemaVersion: number; document: FigmaNode }
const mappings = JSON.parse(readFileSync(new URL('../contract/mappings.json', import.meta.url), 'utf8')) as { designKits: DesignKitMapping[] }
const targets = mappings.designKits.map((kit) => (kit.componentFrame ? { type: 'FRAME', name: kit.componentFrame } : { type: 'COMPONENT_SET', name: kit.componentSet }))

const bare = (node: FigmaNode): FigmaNode => ({ id: node.id, name: node.name, type: node.type })

/** A kit's own node, keeping only its component descendants and the frames that hold them. */
function keepComponents(node: FigmaNode): FigmaNode | undefined {
  if (node.type === 'COMPONENT') return bare(node)
  const children = (node.children ?? []).flatMap((child) => keepComponents(child) ?? [])
  if (children.length === 0) return undefined
  return { ...bare(node), ...(node.componentPropertyDefinitions ? { componentPropertyDefinitions: node.componentPropertyDefinitions } : {}), children }
}

/** The path from `node` down to every target, with nothing else on the way. */
function prune(node: FigmaNode): FigmaNode | undefined {
  if (targets.some((target) => target.type === node.type && target.name === node.name)) return keepComponents(node)
  const children = (node.children ?? []).flatMap((child) => prune(child) ?? [])
  return children.length > 0 ? { ...bare(node), children } : undefined
}

const document = prune(file.document)
if (!document) throw new Error(`${file.name} has none of ${targets.map((target) => target.name).join(', ')}.`)
const trimmed = { name: file.name, lastModified: file.lastModified, version: file.version, schemaVersion: file.schemaVersion, document }
process.stdout.write(`${JSON.stringify(trimmed, null, 2)}\n`)
