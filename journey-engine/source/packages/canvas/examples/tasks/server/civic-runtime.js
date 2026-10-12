import { createApi } from './api.js'

// CIVIC runs this per review run: the app's real API over an in-memory store seeded from the chosen persona, role and condition.
export function createFetchRuntime({ persona, role, condition }) {
  const db = {
    tasks: (persona.seed?.tasks ?? []).map((title, index) => ({ id: String(index + 1), title, done: false, createdAt: new Date().toISOString() })),
    next: (persona.seed?.tasks ?? []).length + 1,
    canWrite: role === 'member',
    unavailable: condition === 'api-down',
  }
  const api = createApi(db)
  return { seed: { tasks: db.tasks.length }, state: () => ({ tasks: db.tasks }), fetch: (request) => api.fetch(request) }
}
