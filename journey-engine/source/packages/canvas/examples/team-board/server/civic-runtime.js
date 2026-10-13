import { createApi, hashPassword } from './api.js'

// CIVIC runs this per review run: the app's real API and password check over an in-memory store. Every persona's
// synthetic review identity is an account of the run, with this run's review credential as its password, so a
// reviewer can switch accounts without leaving the run.
export async function createFetchRuntime({ persona, role, identity, identities = identity ? [identity] : [] }) {
  const db = { users: [], sessions: new Map(), posts: (persona.seed?.posts ?? []).map((text, index) => ({ id: String(index + 1), author: identity?.name ?? 'Teammate', text, postedAt: new Date().toISOString() })) }
  for (const row of identities) db.users.push({ id: row.id, name: row.name, email: row.email, canPost: role === 'member', salt: row.id, passwordHash: await hashPassword(row.credential, row.id) })
  const api = createApi(db)
  return { seed: { posts: db.posts.length }, state: () => ({ posts: db.posts, sessions: db.sessions.size }), fetch: (request) => api.fetch(request) }
}
