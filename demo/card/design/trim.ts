#!/usr/bin/env node
// Trims a full Figma file export of the design system library (`GET /v1/files/:key`) to the
// Card component set and the nested sets mappings.json declares as its parts, so the demo
// commits only what it reads.
//
//   node demo/card/design/trim.ts <full-export.json> > demo/card/design/library.figma.json

import { readFileSync } from 'node:fs'
import type { LibraryComponentMapping } from '../../../importers/src/index.ts'
import { trimFigmaFile } from '../../../importers/src/figma-trim.ts'

const [input] = process.argv.slice(2)
if (!input) throw new Error('Usage: node trim.ts <full-export.json>')
const { library } = JSON.parse(readFileSync(new URL('../contract/mappings.json', import.meta.url), 'utf8')) as { library: LibraryComponentMapping }
const targets = [library.componentSet, ...Object.keys(library.parts ?? {})].map((name) => ({ type: 'COMPONENT_SET' as const, name }))
process.stdout.write(`${JSON.stringify(trimFigmaFile(JSON.parse(readFileSync(input, 'utf8')), targets), null, 2)}\n`)
