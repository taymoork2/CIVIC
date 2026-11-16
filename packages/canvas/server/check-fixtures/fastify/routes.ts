import Fastify from 'fastify'
import external from './external'

const app = Fastify()
const alias = app
alias.get('/health', handler)
app.route({ method: ['POST', 'PUT'], url: '/items/:id', handler })
function plugin(server) {
  server.get('/users/:id', handler)
  server.register(nested, { prefix: '/v2' })
}
const nested = server => server.delete('/items', handler)
app.register(plugin, { prefix: '/api' })
app.register(external, { prefix: '/external' })
app.get(path, handler)
app.route({ method, url: '/dynamic', handler })
const other = { get() { return null } }
other.get('/false', handler)
// oxlint-disable-next-line eslint/no-shadow -- Deliberately shadow the framework binding to test false positives.
export function shadow(app) { app.get('/shadow', handler) }
// app.get('/comment', handler)
