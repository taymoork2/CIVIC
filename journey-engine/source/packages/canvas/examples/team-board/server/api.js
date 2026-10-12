// The app's API as a fetch handler, with its own password check and cookie sessions. It knows nothing about CIVIC.
export async function hashPassword(password, salt) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${password}`))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function createApi(db) {
  const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })
  const sessionOf = (request) => /(?:^|;\s*)sid=([^;]+)/.exec(request.headers.get('cookie') ?? '')?.[1]
  const userOf = (request) => db.users.find((user) => user.id === db.sessions.get(sessionOf(request)))
  const profile = (user) => ({ id: user.id, name: user.name, email: user.email, canPost: user.canPost })
  return {
    async fetch(request) {
      const url = new URL(request.url)
      if (url.pathname === '/api/session' && request.method === 'POST') {
        const { email, password } = await request.json()
        const user = db.users.find((row) => row.email === String(email).trim().toLowerCase())
        if (!user || typeof password !== 'string' || await hashPassword(password, user.salt) !== user.passwordHash) return json({ error: 'That email and password don\'t match an account.' }, 401)
        const sid = crypto.randomUUID()
        db.sessions.set(sid, user.id)
        return json(profile(user), 200, { 'set-cookie': `sid=${sid}; Path=/; HttpOnly; SameSite=Lax` })
      }
      if (url.pathname === '/api/session' && request.method === 'DELETE') {
        db.sessions.delete(sessionOf(request))
        return new Response(null, { status: 204, headers: { 'set-cookie': 'sid=; Path=/; Max-Age=0' } })
      }
      const user = userOf(request)
      if (!user) return json({ error: 'Sign in to see the board.' }, 401)
      if (url.pathname === '/api/me' && request.method === 'GET') return json(profile(user))
      if (url.pathname === '/api/posts' && request.method === 'GET') return json(db.posts)
      if (url.pathname === '/api/posts' && request.method === 'POST') {
        if (!user.canPost) return json({ error: 'Readers can\'t post to the board.' }, 403)
        const { text } = await request.json()
        if (typeof text !== 'string' || !text.trim()) return json({ error: 'Write a message first.' }, 400)
        const post = { id: String(db.posts.length + 1), author: user.name, text: text.trim(), postedAt: new Date().toISOString() }
        db.posts.push(post)
        return json(post, 201)
      }
      return json({ error: 'Not found' }, 404)
    },
  }
}
