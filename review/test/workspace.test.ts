import assert from 'node:assert/strict'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const root = new URL('../../', import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), 'utf8')

test('engine libraries share the packages install and lockfile', () => {
  const workspace = read('packages/pnpm-workspace.yaml')
  const resolve = (member: string, dependency: string) =>
    realpathSync(createRequire(new URL(`${member}/package.json`, root)).resolve(`${dependency}/package.json`))
  for (const member of ['graph', 'review', 'importers', 'crawl']) {
    assert.ok(workspace.includes(`'../${member}'`))
    assert.equal(existsSync(new URL(`${member}/pnpm-lock.yaml`, root)), false)
    assert.equal(existsSync(new URL(`${member}/pnpm-workspace.yaml`, root)), false)
    for (const dependency of ['typescript', '@types/node']) {
      assert.equal(resolve(member, dependency), resolve('packages/canvas', dependency))
    }
  }
  assert.equal(resolve('review', 'playwright-core'), resolve('crawl', 'playwright-core'))
})

test('git-installed packages keep standalone runtime dependency ranges', () => {
  for (const member of ['canvas', 'shell', 'vite-connector']) {
    const manifest = JSON.parse(read(`packages/${member}/package.json`))
    // A caret range, or an exact pin for a prerelease, which a caret would not hold; never catalog: or workspace:.
    for (const range of Object.values(manifest.dependencies ?? {})) {
      assert.match(String(range), /^(?:\^\d|\d+\.\d+\.\d+-[\w.]+$)/u)
    }
  }
})
