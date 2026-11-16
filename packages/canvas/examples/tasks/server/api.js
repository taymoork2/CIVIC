import routes from './routes.json' with { type: 'json' }

// The app's API as a fetch handler: the same code can serve production behind any server.
export function createApi(db) {
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  return {
    async fetch(request) {
      const url = new URL(request.url)
      const route = routes.find(row => {
        const method = row.id.split(':')[0], path = row.id.slice(method.length + 1).split('/'), actual = url.pathname.split('/')
        return method === request.method && path.length === actual.length && path.every((part, index) => part.startsWith(':') ? Boolean(actual[index]) : part === actual[index])
      })?.export
      if (db.unavailable) return json({ error: 'The task service is unavailable. Your draft is kept.' }, 503)
      if (route === 'listTasks') return json(db.tasks)
      if (route === 'addTask') {
        if (!db.canWrite) return json({ error: 'Viewers cannot add tasks.' }, 403)
        const { title } = await request.json()
        if (typeof title !== 'string' || !title.trim()) return json({ error: 'Give the task a title.' }, 400)
        const task = { id: String(db.next++), title: title.trim(), done: false, createdAt: new Date().toISOString() }
        db.tasks.push(task)
        return json(task, 201)
      }
      const done = url.pathname.match(/^\/api\/tasks\/([^/]+)$/)
      if (route === 'updateTask' && done) {
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
