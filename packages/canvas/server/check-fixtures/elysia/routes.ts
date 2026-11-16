import { Elysia } from 'elysia'
import external from './external'

const sub = new Elysia({ prefix: '/sub' }).get('/users/:id', handler)
const app = new Elysia({ prefix: '/api' })
  .get('/health', handler)
  .route('POST', '/items', handler)
  .all('/any', handler)
  .group('/v1', server => server.get('/users', handler).delete('/users/:id', handler))
  .use(sub)
app.use(external)
app.get(path, handler)
app.route(method, '/dynamic', handler)
const other = { get() { return null } }
other.get('/false', handler)
// oxlint-disable-next-line eslint/no-shadow -- Deliberately shadow the framework binding to test false positives.
export function shadow(app) { app.get('/shadow', handler) }
// app.get('/comment', handler)
