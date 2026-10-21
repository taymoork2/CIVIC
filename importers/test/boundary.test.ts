import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

// Importers read tool output into the graph. They depend on the graph package and Node
// built-ins only: never on the journey engine or Example (decision 0004), and never on a
// model provider (decision 0006).
const sourceDir = new URL('../src/', import.meta.url)
const files = readdirSync(sourceDir).filter((name) => name.endsWith('.ts'))

test('importers import only their own files, the graph and Node built-ins', () => {
  assert.ok(files.length > 0)
  for (const name of files) {
    for (const [, specifier] of readFileSync(new URL(name, sourceDir), 'utf8').matchAll(/from\s+'([^']+)'/g)) {
      assert.ok(specifier!.startsWith('./') || specifier!.startsWith('node:') || specifier!.startsWith('../../graph/src/'), `${name} imports ${specifier}`)
    }
  }
})

test('importers have no runtime dependencies', () => {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as Record<string, unknown>
  assert.equal(manifest.dependencies, undefined)
})
