import { spawnSync, execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve, relative, isAbsolute, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { parseSync } = await import(createRequire(resolve(root, 'packages/canvas/package.json')).resolve('vite'))
const baselinePath = resolve(root, 'lint-baseline.json')

export function architecture(file, source) {
  const findings = []
  const add = rule => findings.push({ code: rule, filename: file })
  const ui = /^packages\/(canvas|shell)\/src\//.test(file)
  const server = /^packages\/[^/]+\/server\/|^packages\/local\/|^(review|graph|importers|crawl)\/src\//.test(file)
  const ast = parseSync(file, source)
  if (ast.errors.length) throw new Error(`Cannot parse ${file}: ${JSON.stringify(ast.errors)}`)
  const aliases = new Map()
  for (const node of ast.program.body) {
    if (node.type !== 'ImportDeclaration') continue
    for (const specifier of node.specifiers) {
      if (specifier.type === 'ImportSpecifier') aliases.set(specifier.local.name, specifier.imported.name ?? specifier.imported.value)
    }
  }
  function callName(node) {
    if (node.type === 'Identifier') return aliases.get(node.name) ?? node.name
    if (node.type === 'MemberExpression') return `${callName(node.object)}.${node.computed ? node.property.value : node.property.name}`
    return ''
  }
  function visit(node) {
    if (!node || typeof node !== 'object') return
    if (node.type === 'CallExpression') {
      const name = callName(node.callee)
      if (ui && /(^|\.)useEffect$/.test(name)) add('architecture/useEffect')
      if (server && /(^|\.)(setTimeout|setInterval)$/.test(name)) add('architecture/raw-timer')
      if (/^(vi|vitest|jest)\.(mock|doMock|unstable_mockModule)$/.test(name) || name === 'mock.module') add('architecture/module-mocking')
    }
    let specifier
    if (['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration', 'ImportExpression'].includes(node.type)) specifier = node.source
    if (node.type === 'CallExpression' && node.callee.name === 'require') specifier = node.arguments[0]
    if (node.type === 'TSImportType') specifier = node.source
    if (specifier && typeof specifier.value === 'string') {
      const value = specifier.value
      // Integration tests spawn the real CLI; production data modules cannot spawn processes.
      const testProcess = /^(graph|importers)\/test\//.test(file) && /^(?:node:)?child_process$/.test(value)
      if (/^(graph|importers)\//.test(file) && !testProcess && /^(effect(?:\/|$)|xstate(?:\/|$)|@effect\/|@xstate\/|(?:node:)?child_process$)/.test(value)) add('architecture/data-core')
      // Node rendering tests use React's renderer, not a CIVIC server module.
      const testRenderer = /\.test\.[jt]sx?$/.test(file) && value === 'react-dom/server'
      if (ui && !testRenderer && /(^|\/)server(\/|$)/.test(value)) add('architecture/browser-server')
      if (isAbsolute(value) || value.startsWith('file:') || (value.startsWith('.') && relative(root, resolve(root, dirname(file), value)).split(sep)[0] === '..')) add('architecture/outside-repo')
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit)
      else if (value && typeof value === 'object') visit(value)
    }
  }
  visit(ast)
  return findings
}

export function count(findings) {
  const counts = {}
  for (const { code, filename } of findings) {
    if (!code || !filename) throw new Error('Unclassified diagnostic; refusing to baseline it')
    const key = `${code}:${filename}`
    counts[key] = (counts[key] ?? 0) + 1
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)))
}

export function compare(current, baseline, update = false) {
  const errors = []
  for (const [key, value] of Object.entries(baseline)) {
    if (!Number.isSafeInteger(value) || value < 1) throw new Error(`Invalid baseline: ${key}`)
  }
  for (const [key, value] of Object.entries(current)) {
    if (value > (baseline[key] ?? 0)) errors.push(`${key}: grew from ${baseline[key] ?? 0} to ${value}`)
  }
  if (!update && Object.entries(baseline).some(([key, value]) => (current[key] ?? 0) < value)) errors.push('Baseline shrank: run node bin/with-temp-root.mjs node bin/lint-baseline.mjs --update')
  return errors
}

export function collect() {
  const lint = spawnSync('pnpm', ['exec', 'vp', 'lint', '--format', 'json', '--threads', '2'], { cwd: resolve(root, 'packages'), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (lint.error || ![0, 1].includes(lint.status)) throw new Error(lint.error?.message ?? lint.stderr ?? 'Lint failed')
  const report = JSON.parse(lint.stdout)
  if (!Array.isArray(report.diagnostics) || !report.number_of_files) throw new Error('Invalid or empty lint report')
  const findings = report.diagnostics.map(item => ({ ...item, filename: `packages/${item.filename}` }))
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(file => /\.(?:[cm]?[jt]sx?)$/.test(file))
  for (const file of files) findings.push(...architecture(file, readFileSync(resolve(root, file), 'utf8')))
  return count(findings)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const update = process.argv.includes('--update')
    const current = collect()
    const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'))
    const errors = compare(current, baseline, update)
    if (errors.length) throw new Error(errors.join('\n'))
    if (update) writeFileSync(baselinePath, `${JSON.stringify(current, null, 2)}\n`)
    console.log(`Lint baseline passed (${Object.keys(current).length} rule/file pairs).`)
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
