import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

// The crawl loop drives an app through Playwright and nothing else: it imports no journey
// engine or Example code (decision 0004) and no model provider (decision 0006).
const sourceDir = new URL('../src/', import.meta.url)

test('the crawl imports only its own files, Node built-ins and playwright-core', () => {
  for (const name of readdirSync(sourceDir).filter((file) => file.endsWith('.ts'))) {
    for (const [, specifier] of readFileSync(new URL(name, sourceDir), 'utf8').matchAll(/(?:from\s+|import\()'([^']+)'/g)) {
      assert.ok(specifier!.startsWith('./') || specifier!.startsWith('node:') || specifier === 'playwright-core', `${name} imports ${specifier}`)
    }
  }
})

test('the crawl depends on playwright-core alone', () => {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { dependencies?: Record<string, string> }
  assert.deepEqual(Object.keys(manifest.dependencies ?? {}), ['playwright-core'])
})
