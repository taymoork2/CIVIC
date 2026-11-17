import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { nextRouteOperations } from './next-routes.mjs'
import { nextActionOperations } from './next-actions.mjs'
import { expressOperations } from './express-routes.mjs'
import { honoOperations } from './hono-routes.mjs'
import { fastifyOperations } from './fastify-routes.mjs'
import { elysiaOperations } from './elysia-routes.mjs'
import { nestjsOperations } from './nestjs-routes.mjs'
import { trpcOperations } from './trpc-procedures.mjs'
import { backendInventory } from './backend-coverage.mjs'
import { backendCoverage } from '../../shell/server/backend-coverage.mjs'
import { fileURLToPath } from 'node:url'

const fixture = path => readFile(new URL('./check-fixtures/' + path, import.meta.url), 'utf8')
for (const [framework, detect, expected] of [
  ['nestjs', nestjsOperations, ['GET /cats/:id', 'POST /cats', 'PUT /cats/:id', 'PATCH /cats/:id', 'DELETE /cats/:id', 'OPTIONS /cats', 'HEAD /cats', 'ALL /cats/health', 'GET /']],
  ['trpc', trpcOperations, ['trpc:user.byId', 'trpc:user.save', 'trpc:events.latest']],
]) {
  test(framework + ' inventories literal declarations with import provenance', async () => {
    const rows = detect(await fixture(framework + '/routes.ts'), 'routes.ts')
    assert.deepEqual(rows.map(row => row.id), expected)
    assert.equal(rows[0].export, framework === 'nestjs' ? 'Cats.find' : 'user.byId')
    assert.ok(rows.every(row => row.limits.length && row.kind === (framework === 'nestjs' ? 'route' : 'rpc')))
    const root = fileURLToPath(new URL('./check-fixtures/' + framework, import.meta.url))
    const inventory = await backendInventory({ root, sources: [root], manifest: { adapter: {} } })
    assert.deepEqual(inventory.map(row => row.id), expected)
    assert.ok(inventory.every(row => row.detector === framework))
  })
}

test('Nest skips nonliteral options and foreign decorators; tRPC skips foreign routers', () => {
  assert.deepEqual(nestjsOperations("import {Controller, Get} from 'other'; @Controller() class C { @Get() f() {} }", 'a.ts'), [])
  assert.deepEqual(nestjsOperations("import {Controller, Get} from '@nestjs/common'; @Controller({...options, path:'x'}) class C { @Get() f() {} }", 'a.ts'), [])
  assert.deepEqual(trpcOperations("import {router} from 'other'; const trpc = router({x: p.query(fn)})", 'a.ts'), [])
  assert.throws(() => nestjsOperations("import '@nestjs/common'; const =", 'a.ts'))
  assert.throws(() => trpcOperations("import '@trpc/server'; const =", 'a.ts'))
  assert.deepEqual(nestjsOperations("import {Controller, Get} from '@nestjs/common'; @Controller('x') class C { @Get('/y/') f() {} }", 'a.ts').map(row => row.id), ['GET /x/y'])
  const local = "import {initTRPC as init} from '@trpc/server'; const t = init.create(); const router = t.router; export default router({x: t.procedure.query(fn)})"
  assert.deepEqual(trpcOperations(local, 'a.ts').map(row => row.id), ['trpc:x'])
  const nested = "import {router} from './trpc'; const user = router({byId:p.query(fn)}); export default router({api:router({user})})"
  assert.deepEqual(trpcOperations(nested, 'a.ts').map(row => row.id), ['trpc:api.user.byId'])
})

test('tRPC single and batch HTTP names match RPC paths only in verified successful steps', () => {
  const operations = [...['a', 'b', 'user.byId', 'failed', 'later'].map(path => ({ id: 'trpc:' + path, kind: 'rpc' })), { id: 'GET /trpc/:path', kind: 'route' }]
  const tape = { project: 'p', source: 's', seed: { context: { scenario: 'start' } }, steps: [
    { operations: [{ name: 'GET /trpc/user.byId?input=1' }, { name: 'POST:/trpc/a,b?batch=1' }, { name: 'GET /trpc/failed', result: { status: 500 } }] },
    { operations: [{ name: 'GET /trpc/later' }] },
  ] }
  const replay = { schema: 'civic.replay/0', project: 'p', source: 's', tape: 't', scenario: 'start', outcome: 'fail', steps: 2, divergedAt: 2 }
  const result = backendCoverage(operations, new Map([['t', tape]]), [replay], { project: 'p', source: 's', journeys: [{ id: 'j', scenarios: ['start'] }] })
  assert.deepEqual(result.unreached, ['trpc:failed', 'trpc:later'])
})
for (const [framework, detect, expected, runtime] of [
  ['hono', honoOperations, ['GET /api/v1/users/:id', 'POST /api/items', 'PUT /api/items', 'ALL /api/health', 'GET /schema'], /Hono app.routes/u],
  ['fastify', fastifyOperations, ['GET /health', 'POST /items/:id', 'PUT /items/:id', 'GET /api/users/:id', 'DELETE /api/v2/items'], /Fastify onRoute/u],
  ['elysia', elysiaOperations, ['GET /api/health', 'POST /api/items', 'ALL /api/any', 'GET /api/v1/users', 'DELETE /api/v1/users/:id', 'GET /api/sub/users/:id'], /Elysia routes/u],
]) {
  test(framework + ' finds literal routes and local composition without unrelated or shadowed calls', async () => {
    const rows = detect(await fixture(framework + '/routes.ts'), 'routes.ts')
    assert.deepEqual(rows.map(row => row.id), expected)
    assert.match(rows[0].limits[0], /Skipped 3 /u)
    assert.match(rows[0].limits[0], runtime)
    assert.deepEqual(detect("const other = {}; other.get('/no', handler)", 'a.js'), [])
    assert.throws(() => detect(`import '${framework}'; const =`, 'a.js'))
    const root = fileURLToPath(new URL('./check-fixtures/' + framework, import.meta.url))
    const inventory = await backendInventory({ root, sources: [root], manifest: { adapter: {} } })
    assert.deepEqual(inventory.map(row => row.id), expected)
    assert.ok(inventory.every(row => row.detector === framework))
  })
}

test('literal HTTP inventory identities match concrete replay paths and ALL methods', () => {
  const operations = [{ id: 'GET /users/:id', kind: 'route' }, { id: 'ALL /health', kind: 'route' }]
  const tape = { project: 'p', source: 's', seed: { context: { scenario: 'start' } }, steps: [{ operations: [{ name: 'GET /users/42' }, { name: 'POST /health' }] }] }
  const replay = { schema: 'civic.replay/0', project: 'p', source: 's', tape: 't', scenario: 'start', outcome: 'pass', steps: 1 }
  const result = backendCoverage(operations, new Map([['t', tape]]), [replay], { project: 'p', source: 's', journeys: [{ id: 'j', scenarios: ['start'] }] })
  assert.deepEqual(result.unreached, [])
})

test('dynamic prefixes and unknown fluent return values do not invent routes', () => {
  assert.deepEqual(elysiaOperations("import { Elysia } from 'elysia'; new Elysia(config).get('/x', handler)", 'a.ts'), [])
  assert.deepEqual(elysiaOperations("import { Elysia } from 'elysia'; new Elysia({ ...config }).get('/x', handler)", 'a.ts'), [])
  assert.deepEqual(honoOperations("import { Hono } from 'hono'; const sub = new Hono().basePath('/v1').get('/x', handler); new Hono().route(prefix, sub)", 'a.ts'), [])
  assert.deepEqual(honoOperations("import { Hono } from 'hono'; new Hono().unknown().get('/x', handler)", 'a.ts'), [])
  const code = "import { Hono } from 'hono'; const sub = new Hono().basePath('/v1').get('/x', handler); new Hono().route('/api', sub)"
  assert.deepEqual(honoOperations(code, 'a.ts').map(row => row.id), ['GET /api/v1/x'])
  const plugin = "import fastify from 'fastify'; const app = fastify(); function plugin(server) { server.get('/x', handler) }; app.register(plugin, { prefix })"
  assert.deepEqual(fastifyOperations(plugin, 'a.ts'), [])
})
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
