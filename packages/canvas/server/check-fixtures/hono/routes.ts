import { Hono as Router } from 'hono'
import { OpenAPIHono } from '@hono/zod-openapi'
import external from './external'

const app = new Router().basePath('/api')
const sub = new Router()
sub.get('/users/:id', handler)
app.route('/v1', sub)
app.on(['POST', 'PUT'], '/items', handler)
app.all('/health', handler)
const schema = new OpenAPIHono()
schema.get('/schema', handler)
app.get(path, handler)
app.on(method, '/dynamic', handler)
app.route('/external', external)
const other = { get() { return null } }
other.get('/false', handler)
// oxlint-disable-next-line eslint/no-shadow -- Deliberately shadow the framework binding to test false positives.
export function shadow(app) { app.get('/shadow', handler) }
// app.get('/comment', handler)
