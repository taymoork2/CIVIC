import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { nextRouteOperations } from './next-routes.mjs'
import { nextActionOperations } from './next-actions.mjs'
import { expressOperations } from './express-routes.mjs'

const fixture = path => readFile(new URL('./check-fixtures/' + path, import.meta.url), 'utf8')
test('Next routes use exported functions and file conventions', async () => {
  const code = await fixture('next-routes/route.ts')
  for (const extension of ['ts', 'js', 'mts', 'mjs', 'tsx', 'jsx']) {
    const file = 'src/app/(group)/api/[id]/route.' + extension
    assert.deepEqual(nextRouteOperations(code, file).map(row => row.id), ['GET /api/:id', 'POST /api/:id', 'HEAD /api/:id'])
  }
  assert.equal(nextRouteOperations(code, 'api/route.ts').length, 0)
  for (const folder of ['@slot', '_private']) assert.equal(nextRouteOperations(code, 'app/' + folder + '/route.ts').length, 0)
  assert.equal(nextRouteOperations(code, 'app/[...slug]/route.ts')[0].id, 'GET /:slug+')
  assert.equal(nextRouteOperations(code, 'app/[[...slug]]/route.ts')[0].id, 'GET /:slug*')
  assert.match(nextRouteOperations(code, 'app/route.ts')[0].limits[0], /basePath/u)
  for (const verb of ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
    assert.equal(nextRouteOperations(`export const ${verb} = () => null`, 'app/route.ts')[0].id, verb + ' /')
  }
  assert.deepEqual(nextRouteOperations("export { GET } from './other'", 'app/route.ts'), [])
  assert.throws(() => nextRouteOperations('export function GET(', 'app/route.ts'))
})
test('Next actions require real module or function directives and async exports', async () => {
  assert.deepEqual(nextActionOperations(await fixture('next-actions/actions.ts'), 'actions.ts').map(row => row.id), ['actions.ts:save', 'actions.ts:load', 'actions.ts:renamed'])
  assert.deepEqual(nextActionOperations(await fixture('next-actions/inline.ts'), 'inline.ts').map(row => row.export), ['action', 'arrow'])
  assert.deepEqual(nextActionOperations('// use server\nexport async function nope() {}', 'a.ts'), [])
  assert.deepEqual(nextActionOperations('const text = "use server"; export const nope = async () => text', 'a.ts'), [])
  assert.deepEqual(nextActionOperations("'use server'; export { action } from './other'", 'a.ts'), [])
  assert.throws(() => nextActionOperations("'use server'; export function (", 'a.ts'))
})
test('Express requires proven bindings, resolves local mounts and counts unsupported paths', async () => {
  const rows = expressOperations(await fixture('express/routes.ts'), 'routes.ts')
  assert.deepEqual(rows.map(row => row.id), ['GET /api/users/:id', 'POST /api/v1/items', 'DELETE /api/v1/items', 'ALL /health'])
  assert.match(rows[0].limits[0], /Skipped 3 /u)
  assert.deepEqual(expressOperations("const other = {}; other.get('/no', handler)", 'a.js'), [])
  assert.deepEqual(expressOperations("import express from 'express'; const app = express(); app.get('/setting')", 'a.js'), [])
  assert.deepEqual(expressOperations("import express from 'express'; const app = express(); const router = express.Router(); app.use(prefix, router); router.get('/x', handler)", 'a.js'), [])
  assert.deepEqual(expressOperations("const express = require('express'); const app = express(); app.get('/x', handler)", 'a.js').map(row => row.id), ['GET /x'])
  assert.throws(() => expressOperations("import express from 'express'; const =", 'a.js'))
})
