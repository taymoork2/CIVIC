import { test } from 'vite-plus/test'
import assert from 'node:assert/strict'
import { globSync, readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { parseSync } from 'vite'

test('public exports and browser sources cannot reach lifecycle development dependencies', () => {
  const root = path.resolve(import.meta.dirname, '..')
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
  const dependencies = ['@civic/core', 'effect', 'xstate', '@xstate/effect']
  for (const name of dependencies) {
    assert.ok(pkg.devDependencies[name])
    assert.equal(pkg.dependencies[name], undefined)
  }
  const pending = [
    ...globSync(`${root}/src/**/*.{ts,tsx,mjs,js}`).filter(file => !file.includes('.test.')),
    ...Object.values(pkg.exports).filter((value): value is string => typeof value === 'string' && !value.includes('*')).map(value => path.resolve(root, value)),
  ]
  const visited = new Set<string>()
  while (pending.length) {
    const file = pending.pop()
    if (!file) continue
    if (visited.has(file) || !/\.[cm]?[jt]sx?$/u.test(file)) continue
    visited.add(file)
    const ast = parseSync(file, readFileSync(file, 'utf8'))
    assert.deepEqual(ast.errors, [])
    for (const node of ast.program.body) {
      if (!['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(node.type) || !('source' in node) || !node.source) continue
      const specifier = node.source.value
      assert.ok(!dependencies.some(name => specifier === name || specifier.startsWith(`${name}/`)), `${file} imports ${specifier}`)
      if (!specifier.startsWith('.')) continue
      const target = path.resolve(path.dirname(file), specifier)
      assert.ok(!/\/server\/(?:server|run)-lifecycle/u.test(target), file)
      const resolved = [target, `${target}.ts`, `${target}.tsx`, `${target}.mjs`, `${target}.js`].find(existsSync)
      assert.ok(resolved, `${file}: ${specifier}`)
      pending.push(resolved)
    }
  }
})
