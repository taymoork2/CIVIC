import { createApi, hashPassword } from './api.js'

// CIVIC runs this per review run: the app's real API and password check over an in-memory store. The persona's
// synthetic review identity is its only account, with this run's review credential as its password.
export async function createFetchRuntime({ persona, role, identity }) {
  const db = { users: [], sessions: new Map(), posts: (persona.seed?.posts ?? []).map((text, index) => ({ id: String(index + 1), author: identity?.name ?? 'Teammate', text, postedAt: new Date().toISOString() })) }
  if (identity) db.users.push({ id: identity.id, name: identity.name, email: identity.email, canPost: role === 'member', salt: identity.id, passwordHash: await hashPassword(identity.credential, identity.id) })
  const api = createApi(db)
  return { seed: { posts: db.posts.length }, state: () => ({ posts: db.posts, sessions: db.sessions.size }), fetch: (request) => api.fetch(request) }
}
