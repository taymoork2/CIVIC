// The app's API as a fetch handler: the same code can serve production behind any server.
export function createApi(db) {
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  return {
    async fetch(request) {
      const url = new URL(request.url)
      if (db.unavailable) return json({ error: 'The task service is unavailable. Your draft is kept.' }, 503)
      if (url.pathname === '/api/tasks' && request.method === 'GET') return json(db.tasks)
      if (url.pathname === '/api/tasks' && request.method === 'POST') {
        if (!db.canWrite) return json({ error: 'Viewers cannot add tasks.' }, 403)
        const { title } = await request.json()
        if (typeof title !== 'string' || !title.trim()) return json({ error: 'Give the task a title.' }, 400)
        const task = { id: String(db.next++), title: title.trim(), done: false, createdAt: new Date().toISOString() }
        db.tasks.push(task)
        return json(task, 201)
      }
      const done = url.pathname.match(/^\/api\/tasks\/([^/]+)$/)
      if (done && request.method === 'PATCH') {
        const task = db.tasks.find((row) => row.id === done[1])
        if (!task) return json({ error: 'Unknown task.' }, 404)
        if (!db.canWrite) return json({ error: 'Viewers cannot change tasks.' }, 403)
        task.done = Boolean((await request.json()).done)
        return json(task)
      }
      return json({ error: 'Not found' }, 404)
    },
  }
}
