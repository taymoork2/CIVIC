import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

// Decision 0004: the graph never depends on the journey engine or Laundry.
// Decision 0006: CIVIC makes no model calls.
const sourceDir = new URL('../src/', import.meta.url)
const files = readdirSync(sourceDir).filter((name) => name.endsWith('.ts'))
const imports = files.flatMap((name) =>
  [...readFileSync(new URL(name, sourceDir), 'utf8').matchAll(/from\s+'([^']+)'/g)].map((match) => ({ name, specifier: match[1]! })),
)

test('the graph imports only its own files and Node built-ins', () => {
  assert.ok(files.length > 0)
  for (const { name, specifier } of imports) {
    assert.ok(specifier.startsWith('./') || specifier.startsWith('node:'), `${name} imports ${specifier}`)
  }
})

test('the graph has no runtime dependencies', () => {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as Record<string, unknown>
  assert.equal(manifest.dependencies, undefined)
})
