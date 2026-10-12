import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServerFunctions, decode, encode, executeServerFunction } from '../src/server-functions-core.mjs'
import { closingParen, transformServerFunctions } from './server-functions.mjs'

const module = `import { createServerFn as fn, notFound } from '@tanstack/react-start'
import { db } from './db.server'
import { format, type Row } from './format'
// db is the server's database
export const getRows = fn({ method: 'GET' }).handler(async (): Promise<Row[]> => db.rows(\`a)\${')'}b\`, ')', /* ) */ 1))
export const label = (row: Row) => format(row)
export const thrower = fn().handler(() => { throw notFound() })
`

test('the preview keeps each server function\'s name and calls, and loses its handler and the imports only the handler used', () => {
  const client = transformServerFunctions(module, 'src/rows.ts', 'client')
  assert.match(client, /const fn = __civicStart\.createServerFn;/)
  assert.match(client, /import \{ notFound \} from '@tanstack\/react-start';/, 'other Start exports still come from the package')
  assert.match(client, /getRows = fn\.as\("getRows", \{ method: 'GET' \}\)\.handler\(\)/)
  assert.match(client, /thrower = fn\.as\("thrower", \)\.handler\(\)/)
  assert.doesNotMatch(client, /db\.server/, 'server-only modules never reach the page')
  assert.match(client, /import \{ format \} from '\.\/format';/, 'type-only specifiers go, used bindings stay')
  assert.equal(client.split('\n').length, module.split('\n').length, 'line numbers are kept')
  const server = transformServerFunctions(module, 'src/rows.ts', 'server')
  assert.match(server, /import \{ db \} from '\.\/db\.server'/)
  assert.match(server, /\.handler\(async/)
  assert.equal(transformServerFunctions("import { Link } from '@tanstack/react-router'", 'src/a.ts', 'client'), null)
})

test('the parenthesis scan skips strings, templates and comments and gives up when unsure', () => {
  const code = 'f(a, `x${ g(")") }y`, "(", \'(\', /* ( */ { b: [1] }) + 1'
  assert.equal(closingParen(code, 1), code.lastIndexOf(')'))
  assert.equal(closingParen('f(a, "unterminated', 1), -1)
  assert.equal(closingParen('f(a, /* open', 1), -1)
  assert.equal(closingParen('f(a]', 1), -1)
})

test('tagged JSON keeps what JSON loses', () => {
  const value = { when: new Date(Date.UTC(2026, 9, 12)), tags: new Set(['a']), index: new Map([[1, { n: 2n }]]), gone: undefined, inf: Infinity, $civic: 'mine' }
  assert.deepEqual(decode(JSON.parse(JSON.stringify(encode(value)))), value)
})

test('client middleware sends context, server middleware adds its own, and validators run in order', async () => {
  const server = createServerFunctions('src/fns.ts')
  const auth = server.createMiddleware({ type: 'function' }).server(({ next, context }) => next({ context: { user: `${context.role}:${context.device}` } }))
  const device = server.createMiddleware({ type: 'function' }).client(({ next }) => next({ sendContext: { device: 'phone' } }))
  server.createServerFn.as('whoami', { method: 'POST' }).middleware([device, auth]).validator((input) => ({ n: Number(input.n) })).validator((input) => ({ n: input.n * 2 })).handler(({ data, context }) => ({ n: data.n, user: context.user }))
  server.createServerFn.as('redirect').handler(() => { throw { to: '/signin', statusCode: 307 } })
  // The preview's copy of the same module sends its calls to the run.
  const client = createServerFunctions('src/fns.ts', async (key, method, data, context) => (await executeServerFunction(method === 'GET' ? 'query' : 'mutation', key, { data: encode(data), context: encode(context) }, { role: 'editor' })).value)
  const clientDevice = client.createMiddleware({ type: 'function' }).client(({ next }) => next({ sendContext: { device: 'phone' } }))
  const whoami = client.createServerFn.as('whoami', { method: 'POST' }).middleware([clientDevice]).handler()
  assert.deepEqual(await whoami({ data: { n: '2' } }), { n: 4, user: 'editor:phone' })
  await assert.rejects(executeServerFunction('query', 'src/fns.ts:redirect', {}), (error) => { assert.deepEqual(decode(error.data.thrown), { to: '/signin', statusCode: 307 }); return true })
  const broken = server.createMiddleware().server(() => ({}))
  server.createServerFn.as('broken').middleware([broken]).handler(() => 1)
  await assert.rejects(executeServerFunction('query', 'src/fns.ts:broken', {}), /must return the result of next\(\)/)
  assert.throws(() => server.createServerFn.as('put', { method: 'PUT' }).handler(() => 1), /GET or POST/)
})
