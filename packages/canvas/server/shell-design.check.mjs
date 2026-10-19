import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { test } from 'node:test'
import { parseSync } from 'vite'

test('the active shell uses shared controls and has no obsolete workspace cascade or route', async () => {
  const directory = new URL('../src/', import.meta.url)
  const findings = []
  const native = new Set(['button', 'input', 'select', 'textarea', 'details', 'summary', 'dialog', 'meter', 'label', 'fieldset', 'legend'])
  for (const file of await readdir(directory)) {
    if (!file.endsWith('.tsx') || file.endsWith('.test.tsx')) continue
    const source = await readFile(new URL(file, directory), 'utf8')
    const tree = parseSync(file, source)
    assert.deepEqual(tree.errors, [], file)
    const visit = node => {
      if (!node || typeof node !== 'object') return
      if (node.type === 'JSXOpeningElement' && node.name.type === 'JSXIdentifier' && native.has(node.name.name)) findings.push(`${file}:${source.slice(0, node.start).split('\n').length} <${node.name.name}>`)
      for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(visit); else if (value && typeof value === 'object') visit(value)
    }
    visit(tree)
    if (/extension\.legacy|params\.get\(['"]legacy['"]\)|styles\/(?:canvas|app-canvas|canvas-chrome)\.css/.test(source)) findings.push(`${file}: obsolete workspace entry point`)
  }
  for (const directory of [new URL('../src/', import.meta.url), new URL('../../shell/styles/', import.meta.url)]) {
    for (const file of await readdir(directory)) {
      assert.ok(!['shell.css', 'review.css', 'project-picker.css', 'canvas.css', 'canvas-chrome.css', 'app-canvas.css'].includes(file), `Superseded stylesheet returned: ${file}`)
      if (!file.endsWith('.css') || file === 'ui.generated.css') continue
      const source = await readFile(new URL(file, directory), 'utf8')
      if (/civic-legacy|button:not\(\[data-civic-control\]\)|--rh-(?:ink|muted|line|accent)/.test(source)) findings.push(`${file}: obsolete shell fallback styling`)
    }
  }
  assert.deepEqual(findings, [])
})
