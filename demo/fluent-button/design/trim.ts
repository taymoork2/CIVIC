#!/usr/bin/env node
// Trims a full Figma file export (`GET /v1/files/:key`) to one design kit's component set or
// frame, as mappings.json declares it, so the demo commits only what it reads.
//
//   node demo/fluent-button/design/trim.ts <kit-id> <full-export.json> > demo/fluent-button/design/<kit-id>.figma.json

import { readFileSync } from 'node:fs'
import type { DesignKitMapping } from '../../../importers/src/index.ts'
import { trimFigmaFile } from '../../../importers/src/figma-trim.ts'

const [id, input] = process.argv.slice(2)
if (!id || !input) throw new Error('Usage: node trim.ts <kit-id> <full-export.json>')
const mappings = JSON.parse(readFileSync(new URL('../contract/mappings.json', import.meta.url), 'utf8')) as { designKits: DesignKitMapping[] }
const kit = mappings.designKits.find((candidate) => candidate.id === id)
if (!kit) throw new Error(`mappings.json has no design kit ${id}; it has ${mappings.designKits.map((candidate) => candidate.id).join(', ')}.`)
const target = kit.componentFrame ? { type: 'FRAME' as const, name: kit.componentFrame } : { type: 'COMPONENT_SET' as const, name: kit.componentSet }
process.stdout.write(`${JSON.stringify(trimFigmaFile(JSON.parse(readFileSync(input, 'utf8')), [target]), null, 2)}\n`)
